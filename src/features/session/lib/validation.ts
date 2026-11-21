import type { Shift } from "../../../shared/types";
const kinds = ["fuel", "baggage", "clean"];
const flightStates = [
  "scheduled",
  "incoming",
  "parked",
  "departing",
  "departed",
];
const serviceStates = ["pending", "travel", "working", "done"];
const vehicleStates = ["idle", "travel", "working", "returning"];
const tones = ["info", "success", "warning"];
type Row = Record<string, unknown>;
function row(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function point(value: unknown): boolean {
  return row(value) && finite(value.x) && finite(value.y);
}
function collection(value: unknown): value is Row[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(row) &&
    value.every((x) => text(x.id)) &&
    new Set(value.map((x) => x.id)).size === value.length
  );
}
function optionalId(value: unknown, ids: Set<unknown>): boolean {
  return value === undefined || ids.has(value);
}
function validTaskLine(value: unknown): boolean {
  return (
    row(value) &&
    text(value.taskId) &&
    text(value.flightId) &&
    kinds.includes(value.kind as string) &&
    serviceStates.includes(value.status as string) &&
    finite(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 100 &&
    finite(value.remainingSeconds) &&
    value.remainingSeconds >= 0 &&
    (value.vehicleId === undefined || text(value.vehicleId)) &&
    (value.occupiedStandId === undefined || text(value.occupiedStandId))
  );
}
function validSettlement(value: unknown): boolean {
  if (!row(value)) return false;
  const nonNegative = [
    "delayPenalty",
    "accruedDelaySeconds",
    "carriedDelaySeconds",
    "departedFlights",
    "inheritedFlights",
    "unfinishedTasks",
    "activeVehicles",
    "occupiedStands",
  ];
  return (
    finite(value.earnedScore) &&
    finite(value.finalScore) &&
    nonNegative.every((key) => finite(value[key]) && (value[key] as number) >= 0)
  );
}
function validOption(value: unknown): boolean {
  return (
    row(value) &&
    (value.key === "now" || value.key === "planned") &&
    text(value.label) &&
    finite(value.at) &&
    finite(value.settleableScore) &&
    finite(value.newInboundCount) &&
    finite(value.inheritedFlights) &&
    finite(value.unfinishedTasks) &&
    ["低", "中", "高"].includes(value.riskLevel as string) &&
    typeof value.note === "string"
  );
}
function validHandoverRecord(value: unknown): boolean {
  if (!row(value)) return false;
  if (
    !text(value.id) ||
    !text(value.fromShiftId) ||
    !finite(value.fromShiftNumber) ||
    !text(value.toShiftId) ||
    !finite(value.toShiftNumber) ||
    !finite(value.at) ||
    value.confirmed !== true ||
    !Array.isArray(value.taskLines) ||
    !value.taskLines.every(validTaskLine) ||
    !Array.isArray(value.inheritedFlightIds) ||
    !Array.isArray(value.inheritedServiceIds) ||
    !Array.isArray(value.inheritedVehicleIds) ||
    !Array.isArray(value.occupiedStandIds) ||
    !Array.isArray(value.planFlightIds) ||
    !Array.isArray(value.plan) ||
    !Array.isArray(value.newFlights) ||
    !value.newFlights.every(row) ||
    !Array.isArray(value.risks) ||
    !validSettlement(value.settlement) ||
    !row(value.comparison) ||
    !validOption(value.comparison.now) ||
    !validOption(value.comparison.planned) ||
    !row(value.fromArchive)
  )
    return false;
  const archive = value.fromArchive;
  return (
    text(archive.shiftId) &&
    finite(archive.number) &&
    finite(archive.time) &&
    Array.isArray(archive.flights) &&
    Array.isArray(archive.services) &&
    Array.isArray(archive.vehicles) &&
    Array.isArray(archive.stands) &&
    Array.isArray(archive.events) &&
    archive.flights.every(
      (f) =>
        row(f) &&
        text(f.id) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline),
    ) &&
    archive.services.every(
      (s) =>
        row(s) &&
        text(s.id) &&
        text(s.flightId) &&
        kinds.includes(s.kind as string) &&
        serviceStates.includes(s.status as string),
    )
  );
}
export function validShift(value: unknown): value is Shift {
  if (
    !row(value) ||
    value.version !== 1 ||
    !text(value.shiftId) ||
    !finite(value.number) ||
    value.number < 1 ||
    !finite(value.startedAt) ||
    !finite(value.endsAt) ||
    value.endsAt <= value.startedAt ||
    !finite(value.time) ||
    value.time < 0 ||
    !finite(value.score) ||
    !finite(value.conflicts) ||
    value.conflicts < 0 ||
    typeof value.paused !== "boolean" ||
    typeof value.archived !== "boolean" ||
    ![1, 2, 4].includes(value.speed as number) ||
    !finite(value.nextEventId) ||
    !Array.isArray(value.handoverLog) ||
    value.handoverLog.length > 8 ||
    !value.handoverLog.every(validHandoverRecord) ||
    (value.handover !== undefined && !validHandoverRecord(value.handover))
  )
    return false;
  if (
    !collection(value.flights) ||
    !collection(value.stands) ||
    !collection(value.vehicles) ||
    !collection(value.services) ||
    !Array.isArray(value.events) ||
    value.events.length > 30
  )
    return false;
  const flights = value.flights,
    stands = value.stands,
    vehicles = value.vehicles,
    services = value.services;
  const flightIds = new Set(flights.map((x) => x.id)),
    standIds = new Set(stands.map((x) => x.id)),
    vehicleIds = new Set(vehicles.map((x) => x.id)),
    serviceIds = new Set(services.map((x) => x.id));
  if (
    !flights.every(
      (f) =>
        text(f.airline) &&
        text(f.from) &&
        text(f.destination) &&
        text(f.aircraft) &&
        ["narrow", "wide"].includes(f.size as string) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline) &&
        finite(f.passengers) &&
        f.passengers > 0 &&
        text(f.color) &&
        (f.departureAt === undefined || finite(f.departureAt)) &&
        optionalId(f.standId, standIds) &&
        optionalId(f.plannedStandId, standIds) &&
        (f.delayCarried === undefined ||
          (finite(f.delayCarried) && f.delayCarried >= 0)) &&
        (f.delayLedger === undefined ||
          (Array.isArray(f.delayLedger) &&
            f.delayLedger.every(
              (e) =>
                row(e) &&
                text(e.shiftId) &&
                finite(e.shiftNumber) &&
                finite(e.seconds) &&
                e.seconds >= 0 &&
                finite(e.at),
            ))) &&
        (f.departureShiftId === undefined || text(f.departureShiftId)) &&
        (f.departureShiftNumber === undefined ||
          finite(f.departureShiftNumber)),
    )
  )
    return false;
  if (
    !stands.every(
      (s) =>
        point(s) &&
        ["narrow", "wide"].includes(s.size as string) &&
        text(s.terminal),
    )
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        kinds.includes(v.kind as string) &&
        vehicleStates.includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        finite(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 100 &&
        finite(v.tripDuration) &&
        v.tripDuration > 0 &&
        optionalId(v.serviceId, serviceIds),
    )
  )
    return false;
  if (
    !services.every(
      (s) =>
        flightIds.has(s.flightId) &&
        kinds.includes(s.kind as string) &&
        serviceStates.includes(s.status as string) &&
        finite(s.progress) &&
        s.progress >= 0 &&
        s.progress <= 100 &&
        finite(s.duration) &&
        s.duration > 0 &&
        optionalId(s.vehicleId, vehicleIds) &&
        (s.handover === undefined ||
          (row(s.handover) &&
            text(s.handover.recordId) &&
            text(s.handover.fromShiftId) &&
            finite(s.handover.at) &&
            serviceStates.includes(s.handover.status as string))),
    )
  )
    return false;
  if (
    !flights.every((f) =>
      kinds.every(
        (k) =>
          services.filter((t) => t.flightId === f.id && t.kind === k).length ===
          1,
      ),
    )
  )
    return false;
  if (services.length !== flights.length * 3) return false;
  const occupied = flights
    .filter((f) => f.status !== "departed" && f.standId !== undefined)
    .map((f) => f.standId);
  if (new Set(occupied).size !== occupied.length) return false;
  if (
    !flights.every(
      (f) =>
        !["parked", "departing", "departed"].includes(f.status as string) ||
        (standIds.has(f.standId) &&
          (f.size === "narrow" ||
            stands.find((s) => s.id === f.standId)?.size === "wide")),
    )
  )
    return false;
  if (
    !services.every((s) => {
      if (s.status === "pending")
        return s.progress === 0 && s.vehicleId === undefined;
      if (s.status === "done") {
        const v = vehicles.find((x) => x.id === s.vehicleId);
        return s.progress === 100 && (!v || v.kind === s.kind);
      }
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (!v || v.kind !== s.kind) return false;
      return (
        v.serviceId === s.id &&
        v.status === s.status &&
        flights.find((f) => f.id === s.flightId)?.status === "parked"
      );
    })
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        !["travel", "working"].includes(v.status as string) ||
        services.some(
          (s) =>
            s.id === v.serviceId &&
            s.vehicleId === v.id &&
            s.status === v.status,
        ),
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        services.filter(
          (t) =>
            t.flightId === f.id &&
            ["travel", "working"].includes(t.status as string),
        ).length <= 2,
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        !["departing", "departed"].includes(f.status as string) ||
        services
          .filter((t) => t.flightId === f.id)
          .every((t) => t.status === "done"),
    )
  )
    return false;
  if (
    !value.events.every(
      (e) =>
        row(e) &&
        finite(e.id) &&
        finite(e.time) &&
        text(e.text) &&
        tones.includes(e.tone as string),
    )
  )
    return false;
  const events = value.events as Row[];
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => (e.id as number) >= (value.nextEventId as number))
  )
    return false;
  return (
    flightIds.has(value.selectedFlightId) &&
    (value.selectedStandId === undefined ||
      standIds.has(value.selectedStandId)) &&
    (value.selectedVehicleId === undefined ||
      vehicleIds.has(value.selectedVehicleId))
  );
}
