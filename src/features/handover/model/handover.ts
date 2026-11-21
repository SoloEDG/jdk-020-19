import type {
  Flight,
  HandoverPlanLine,
  HandoverRecord,
  PlanAdjustment,
  Service,
  Shift,
  ShiftArchive,
} from "../../../shared/types";
import { SHIFT_LENGTH, shiftIdFor } from "../../../shared/constants";
import { clockLabel, copyShift } from "../../../shared/document";
import { compatibleStand } from "../../apron";
import {
  inboundFlightsBetween,
  preferredStandForArrival,
} from "../../flights";
import { initialServices } from "../../services";
import { compareHandover, settlementOf } from "./settlement";
import { estimatedGroundTime, estimateReadyAt, handoverTaskLines } from "./tasks";
import { handoverRisks } from "./risks";
export interface HandoverRequest {
  at: number;
  /** Shift the controller was looking at when confirming; guards duplicates. */
  expectedShiftId: string;
  adjustments: Record<string, PlanAdjustment>;
}
export interface HandoverPlan {
  lines: HandoverPlanLine[];
  newFlights: Flight[];
  planFlightIds: string[];
  risks: ReturnType<typeof handoverRisks>;
  comparison: ReturnType<typeof compareHandover>;
  settlementPreview: ReturnType<typeof settlementOf>;
  boundary: number;
}
const MAX_LOG = 8;
/** The handover instant is both the outgoing settlement edge and next shift start. */
export function handoverBoundary(state: Shift, at: number): number {
  return Math.max(state.startedAt, Math.round(at * 1000) / 1000);
}
function releaseOf(state: Shift, flight: Flight, at: number): number {
  if (flight.status === "departing")
    return Math.max(at, (flight.departureAt ?? at) + 12);
  if (flight.status === "departed") return at;
  return Math.max(at, estimateReadyAt(state, flight.id, at)) + 15;
}
/**
 * Build the incoming shift's plan. Existing aircraft on stand are never moved;
 * the plan only allocates stands for aircraft that are still airborne, and
 * pushes an arrival back (defers it) when no compatible stand is free. The
 * controller can override any line through `adjustments`.
 */
export function buildHandoverPlan(
  state: Shift,
  at: number,
  adjustments: Record<string, PlanAdjustment> = {},
): HandoverPlan {
  const boundary = handoverBoundary(state, at),
    until = boundary + SHIFT_LENGTH,
    freeAt = new Map<string, number>(),
    reserve = (standId: string, release: number) =>
      freeAt.set(standId, Math.max(freeAt.get(standId) ?? boundary, release));
  for (const flight of state.flights) {
    if (flight.status === "departed" || !flight.standId) continue;
    reserve(flight.standId, releaseOf(state, flight, boundary));
  }
  const inherited = state.flights.filter((f) => f.status !== "departed"),
    existingIds = new Set(state.flights.map((f) => f.id)),
    incoming = inboundFlightsBetween(boundary, until, existingIds);
  const lines: HandoverPlanLine[] = [];
  const allocate = (
    flight: Flight,
    source: "inherited" | "new",
    baseArrival: number,
    requestedStandId: string | undefined,
  ) => {
    const adjustment = adjustments[flight.id],
      defer = Math.max(0, adjustment?.deferSeconds ?? 0);
    let arrival = Math.max(baseArrival, boundary) + defer;
    const compatible = state.stands.filter((s) => compatibleStand(s, flight));
    let stand = requestedStandId
      ? state.stands.find((s) => s.id === requestedStandId)
      : undefined;
    let note = defer > 0 ? `计划顺延 ${Math.round(defer)} 秒` : "按计划进港";
    let severity: HandoverPlanLine["severity"] = "ok",
      deferred = defer > 0;
    if (stand && (!compatibleStand(stand, flight) || (freeAt.get(stand.id) ?? boundary) > arrival)) {
      note = `指定机位 ${stand.id} 不可用（尺寸或占用），已自动改派`;
      severity = "warning";
      stand = undefined;
    }
    if (!stand) {
      const open = compatible
        .filter((s) => (freeAt.get(s.id) ?? boundary) <= arrival)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (open) stand = open;
      else {
        const earliest = compatible
          .slice()
          .sort((a, b) => (freeAt.get(a.id) ?? boundary) - (freeAt.get(b.id) ?? boundary))[0];
        if (earliest) {
          const wait = freeAt.get(earliest.id) ?? boundary;
          if (wait > arrival) {
            note = `机位全满，顺延至 ${clockLabel(wait)} 进港`;
            arrival = wait;
            deferred = true;
            severity = "warning";
          }
          stand = earliest;
        }
      }
    }
    if (!stand) {
      severity = "danger";
      note = "没有兼容机位，需在下班重新协调";
      deferred = true;
    } else reserve(stand.id, arrival + estimatedGroundTime(flight) + 15);
    if (arrival > until) {
      severity = severity === "danger" ? severity : "danger";
      deferred = true;
      note += " · 已超出接班班次窗口";
    }
    lines.push({
      flightId: flight.id,
      source,
      baseArrival,
      arrival,
      requestedStandId,
      assignedStandId: stand?.id,
      deferred,
      severity,
      note,
    });
  };
  for (const flight of inherited)
    if (!flight.standId)
      allocate(
        flight,
        "inherited",
        flight.arrival,
        adjustments[flight.id]?.standId ?? flight.plannedStandId,
      );
  const newFlights = incoming.map((flight) => {
    const requested =
      adjustments[flight.id]?.standId ??
      preferredStandForArrival(flight.arrival) ??
      undefined;
    allocate(flight, "new", flight.arrival, requested);
    return flight;
  });
  const byId = new Map(lines.map((line) => [line.flightId, line]));
  for (const flight of inherited) {
    const line = byId.get(flight.id);
    if (line) continue;
    lines.push({
      flightId: flight.id,
      source: "inherited",
      baseArrival: flight.arrival,
      arrival: flight.arrival,
      assignedStandId: flight.standId,
      deferred: false,
      severity: "ok",
      note: flight.status === "departing" ? "推出中，机位继续占用至离港" : "已在机位，原样交接",
    });
  }
  lines.sort((a, b) => {
    if (a.source !== b.source) return a.source === "new" ? 1 : -1;
    return a.arrival - b.arrival || a.flightId.localeCompare(b.flightId);
  });
  const planned: Flight[] = newFlights.map((flight) => {
    const line = byId.get(flight.id);
    const plannedStand =
      line?.assignedStandId ?? preferredStandForArrival(flight.arrival);
    return {
      ...flight,
      arrival: line?.arrival ?? flight.arrival,
      plannedStandId: plannedStand,
    };
  });
  return {
    lines,
    newFlights: planned,
    planFlightIds: planned.map((flight) => flight.id),
    boundary,
    risks: handoverRisks(state, boundary),
    settlementPreview: settlementOf(state, boundary),
    comparison: compareHandover(
      state,
      boundary,
      boundary + SHIFT_LENGTH,
      incoming.length,
    ),
  };
}
function archiveOf(state: Shift, at: number): ShiftArchive {
  return {
    shiftId: state.shiftId,
    number: state.number,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    time: at,
    score: state.score,
    conflicts: state.conflicts,
    flights: copyShift({ ...state, flights: state.flights }).flights,
    stands: state.stands.map((s) => ({ ...s })),
    services: state.services.map((s) => ({ ...s })),
    vehicles: state.vehicles.map((v) => ({
      ...v,
      position: { ...v.position },
      origin: { ...v.origin },
      target: { ...v.target },
    })),
    events: state.events.map((e) => ({ ...e })),
  };
}
export function handoverRecordId(shiftId: string, at: number): string {
  return `handover-${shiftId}-${Math.round(at * 1000)}`;
}
/** Rebuild a read-only shift from a handover record, for either side to view. */
export function archivedShift(record: HandoverRecord): Shift {
  const archive = record.fromArchive;
  return {
    version: 1,
    shiftId: archive.shiftId,
    number: archive.number,
    startedAt: archive.startedAt,
    endsAt: archive.endsAt,
    time: archive.time,
    paused: true,
    speed: 1,
    score: archive.score,
    conflicts: archive.conflicts,
    flights: archive.flights,
    stands: archive.stands,
    services: archive.services,
    vehicles: archive.vehicles,
    events: archive.events,
    selectedFlightId: record.inheritedFlightIds[0] ?? archive.flights[0]?.id ?? "",
    nextEventId: Math.max(0, ...archive.events.map((e) => e.id + 1)),
    archived: true,
    handover: record,
    handoverLog: [record],
  };
}
/**
 * Confirm the handover and materialise the successor shift. Idempotent:
 * stale or repeated confirmations (same expected shift) return the input.
 */
export function confirmHandover(state: Shift, request: HandoverRequest): Shift {
  if (state.archived) return state;
  if (state.shiftId !== request.expectedShiftId) return state;
  const boundary = handoverBoundary(state, request.at);
  // A shift must have run for at least an instant before it can hand over;
  // this also stops a re-opened handover result from cutting a zero-duration
  // successor at the same boundary.
  if (boundary <= state.startedAt) return state;
  const recordId = handoverRecordId(state.shiftId, boundary);
  // A repeated or re-opened confirmation of the same handover instant must not
  // spawn a second successor: match any record already cut from this shift at
  // (within rounding of) the same boundary.
  if (
    state.handoverLog.some(
      (r) => r.fromShiftId === state.shiftId && Math.abs(r.at - boundary) < 1,
    ) ||
    (state.handover?.fromShiftId === state.shiftId &&
      Math.abs(state.handover.at - boundary) < 1)
  )
    return state;
  const plan = buildHandoverPlan(state, boundary, request.adjustments),
    taskLines = handoverTaskLines(state, boundary),
    settlement = settlementOf(state, boundary),
    risks = plan.risks,
    comparison = plan.comparison,
    plannedStands = new Map(
      plan.lines
        .filter((line) => line.source === "inherited" && line.assignedStandId)
        .map((line) => [line.flightId, line.assignedStandId!]),
    ),
    plannedArrivals = new Map(
      plan.lines.map((line) => [line.flightId, line.arrival]),
    ),
    inherited = state.flights
      .filter((f) => f.status !== "departed")
      .map((flight) => {
        const next: Flight = {
          ...flight,
          standId: flight.standId,
          // Waiting aircraft keep the incoming plan as an advisory stand; it
          // becomes binding only when the new shift parks them.
          plannedStandId:
            flight.standId === undefined
              ? plannedStands.get(flight.id)
              : undefined,
          arrival: plannedArrivals.get(flight.id) ?? flight.arrival,
          delayLedger: [...(flight.delayLedger ?? [])],
          delayCarried: Math.max(flight.delayCarried ?? 0, 0),
        };
        const totalDelay = Math.max(
          0,
          Math.floor((flight.departureAt ?? boundary) - flight.deadline),
        );
        // A deferred arrival chosen in this handover can bake in delay before
        // the next shift starts; that decision belongs to the outgoing shift,
        // so it is carried rather than charged again.
        const bakedIn =
          next.arrival > boundary
            ? Math.max(0, Math.floor(next.arrival - flight.deadline))
            : 0;
        const carriedAfter = Math.max(
            totalDelay,
            bakedIn,
            next.delayCarried ?? 0,
          ),
          own = Math.max(0, carriedAfter - (next.delayCarried ?? 0));
        next.delayLedger?.push({
          shiftId: state.shiftId,
          shiftNumber: state.number,
          seconds: own,
          at: boundary,
        });
        next.delayCarried = carriedAfter;
        if (next.status === "scheduled" && next.arrival <= boundary)
          next.status = "incoming";
        return next;
      }),
    inheritedIds = new Set(inherited.map((f) => f.id)),
    newFlights = plan.newFlights.map((flight) => ({
      ...flight,
      status: (flight.arrival <= boundary ? "incoming" : "scheduled") as Flight["status"],
      // Delay already implied by a deferred arrival is inherited, not newly
      // accrued by the receiving shift.
      delayCarried: Math.max(0, Math.floor(flight.arrival - flight.deadline)),
      delayLedger: [],
    })),
    flights = [...inherited, ...newFlights],
    inheritedServices = state.services
      .filter((task) => inheritedIds.has(task.flightId))
      .map<Service>((task) => ({
        ...task,
        handover:
          task.status === "done"
            ? task.handover
            : {
                recordId,
                fromShiftId: state.shiftId,
                fromShiftNumber: state.number,
                at: boundary,
                status: task.status,
                progress: Math.round(task.progress),
              },
      })),
    retainedVehicles = state.vehicles.map((v) => ({
      ...v,
      position: { ...v.position },
      origin: { ...v.origin },
      target: { ...v.target },
    })),
    record: HandoverRecord = {
      id: recordId,
      fromShiftId: state.shiftId,
      fromShiftNumber: state.number,
      toShiftId: shiftIdFor(state.number + 1),
      toShiftNumber: state.number + 1,
      at: boundary,
      confirmed: true,
      taskLines,
      inheritedFlightIds: inherited.map((f) => f.id),
      inheritedServiceIds: inheritedServices.map((s) => s.id),
      inheritedVehicleIds: state.vehicles
        .filter((v) => v.status !== "idle")
        .map((v) => v.id),
      occupiedStandIds: inherited
        .filter((f) => f.standId !== undefined)
        .map((f) => f.standId!),
      planFlightIds: newFlights.map((f) => f.id),
      plan: plan.lines,
      newFlights,
      risks,
      settlement,
      comparison,
      fromArchive: archiveOf(state, boundary),
    };
  const nextShiftNumber = state.number + 1;
  const successor: Shift = {
    version: 1,
    shiftId: shiftIdFor(nextShiftNumber),
    number: nextShiftNumber,
    startedAt: boundary,
    endsAt: boundary + SHIFT_LENGTH,
    time: boundary,
    paused: false,
    speed: state.speed,
    score: 0,
    conflicts: 0,
    flights,
    stands: state.stands.map((s) => ({ ...s })),
    services: [...inheritedServices, ...initialServices(newFlights)],
    vehicles: retainedVehicles,
    events: [
      {
        id: 0,
        time: boundary,
        text: `第 ${nextShiftNumber} 班接班 · 继承 ${inherited.length} 架飞机、${taskLines.length} 项未完保障、${state.vehicles.filter((v) => v.status !== "idle").length} 台在途车辆`,
        tone: "success",
      },
      {
        id: 1,
        time: boundary,
        text: record.planFlightIds.length
          ? `本班进港计划 ${record.planFlightIds.length} 架：${record.planFlightIds.join("、")}`
          : "本班暂无新增进港计划",
        tone: "info",
      },
    ],
    selectedFlightId: flights[0]?.id ?? "",
    nextEventId: 2,
    archived: false,
    handoverLog: [...state.handoverLog, record].slice(-MAX_LOG),
  };
  return successor;
}
/** Archive the outgoing shift in place, for callers that keep both sides. */
export function closeOutgoingShift(
  state: Shift,
  successor: Shift,
): Shift {
  const record = successor.handoverLog[successor.handoverLog.length - 1];
  if (!record || record.fromShiftId !== state.shiftId) return state;
  return {
    ...state,
    time: record.at,
    paused: true,
    archived: true,
    handover: record,
    handoverLog: state.handoverLog,
  };
}
/** True when this shift has run long enough to hand over. */
export function canHandOver(state: Shift): boolean {
  return !state.archived && state.time > state.startedAt;
}
/** The outgoing shift's record viewed from the incoming shift. */
export function incomingHandover(state: Shift): HandoverRecord | undefined {
  const record = state.handoverLog[state.handoverLog.length - 1];
  return record && record.toShiftId === state.shiftId ? record : undefined;
}
export function findHandover(
  state: Shift,
  id: string,
): HandoverRecord | undefined {
  return (
    state.handoverLog.find((record) => record.id === id) ??
    (state.handover?.id === id ? state.handover : undefined)
  );
}
