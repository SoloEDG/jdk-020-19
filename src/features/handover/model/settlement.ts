import type {
  Flight,
  HandoverComparison,
  HandoverOption,
  HandoverSettlement,
  Shift,
} from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import { SHIFT_LENGTH } from "../../../shared/constants";
import { compatibleStand } from "../../apron";
import {
  departurePoints,
  delaySeconds,
  inboundFlightsBetween,
  ownDelaySeconds,
} from "../../flights";
import { estimatedGroundTime, estimateReadyAt } from "./tasks";
import { handoverRisks } from "./risks";
/** Points deducted per full minute of delay accrued on the current watch. */
export function delayPenaltyPoints(seconds: number): number {
  return Math.round(Math.max(0, seconds) / 20);
}
export function settlementOf(state: Shift, at: number): HandoverSettlement {
  let accrued = 0,
    carried = 0,
    penalty = 0;
  for (const flight of state.flights) {
    if (flight.status === "departed") continue;
    const total = delaySeconds(flight, at);
    carried += total;
    // Once pushback is approved the points are already settled with the delay
    // at that instant; only still-parked aircraft carry uncharged delay.
    if (flight.status === "departing") continue;
    const own = ownDelaySeconds(flight, at);
    accrued += own;
    penalty += delayPenaltyPoints(own);
  }
  const inherited = state.flights.filter((f) => f.status !== "departed"),
    unfinished = state.services.filter((task) => {
      if (task.status === "done") return false;
      const flight = state.flights.find((f) => f.id === task.flightId);
      return flight !== undefined && flight.status !== "departed";
    });
  return {
    earnedScore: state.score,
    delayPenalty: penalty,
    finalScore: state.score - penalty,
    accruedDelaySeconds: accrued,
    carriedDelaySeconds: carried,
    departedFlights: state.flights.filter(
      (f) => f.departureShiftId === state.shiftId,
    ).length,
    inheritedFlights: inherited.length,
    unfinishedTasks: unfinished.length,
    activeVehicles: state.vehicles.filter((v) => v.status !== "idle").length,
    occupiedStands: inherited.filter((f) => f.standId !== undefined).length,
  };
}
interface WindowForecast {
  points: number;
  departing: number;
  remaining: Flight[];
}
/**
 * Coarse forward projection: what could still be pushed back inside the
 * window, and what would still be on the stand at the boundary. Stands are
 * allocated in arrival order so inbound aircraft do not block each other.
 */
export function forecastWindow(
  state: Shift,
  from: number,
  until: number,
): WindowForecast {
  const freeAt = new Map<string, number>(),
    assign = (standId: string, release: number) =>
      freeAt.set(standId, Math.max(freeAt.get(standId) ?? 0, release));
  for (const flight of state.flights) {
    if (flight.status === "departed" || !flight.standId) continue;
    const release =
      flight.status === "departing"
        ? (flight.departureAt ?? from) + 12
        : estimateReadyAt(state, flight.id, from) + 15;
    assign(flight.standId, release);
  }
  let points = 0,
    departing = 0;
  const remaining: Flight[] = [];
  const existingIds = new Set(state.flights.map((f) => f.id)),
    active = [
      ...state.flights.filter((f) => f.status !== "departed"),
      ...inboundFlightsBetween(from, until, existingIds).map(
        (flight) => ({ ...flight, status: "incoming" as const }),
      ),
    ];
  const waiting = active
    .filter((f) => !f.standId)
    .sort((a, b) => Math.max(a.arrival, from) - Math.max(b.arrival, from));
  for (const flight of waiting) {
    const arrival = Math.max(flight.arrival, from),
      candidates = state.stands.filter((stand) => compatibleStand(stand, flight));
    const freeEnough = candidates
      .filter((stand) => (freeAt.get(stand.id) ?? 0) <= arrival)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const chosen =
      freeEnough ??
      candidates
        .slice()
        .sort((a, b) => (freeAt.get(a.id) ?? 0) - (freeAt.get(b.id) ?? 0))[0];
    if (!chosen) continue;
    const readyAt = Math.max(arrival, freeAt.get(chosen.id) ?? 0) + estimatedGroundTime(flight);
    assign(chosen.id, readyAt + 15);
    if (readyAt <= until) {
      points += departurePoints(flight, readyAt);
      departing++;
    } else remaining.push(flight);
  }
  for (const flight of active) {
    if (!flight.standId) continue;
    if (flight.status === "departing") continue;
    const readyAt = estimateReadyAt(state, flight.id, from);
    if (readyAt <= until) {
      points += departurePoints(flight, readyAt);
      departing++;
    } else remaining.push(flight);
  }
  return { points, departing, remaining };
}
function riskLevel(field: "now" | "planned", state: Shift, extra: number): HandoverOption["riskLevel"] {
  const risks = handoverRisks(state, state.time),
    dangers = risks.filter((r) => r.severity === "danger").length,
    warnings = risks.filter((r) => r.severity === "warning").length;
  if (dangers >= 2 || (dangers >= 1 && extra >= 2)) return "高";
  if (dangers >= 1 || warnings >= 2 || (field === "planned" && extra >= 3))
    return "中";
  return "低";
}
export function compareHandover(
  state: Shift,
  at: number,
  nextEnd: number,
  newPlanCount: number,
): HandoverComparison {
  const nowSettlement = settlementOf(state, at),
    plannedEnd = Math.max(at, state.endsAt),
    forecast = forecastWindow(state, at, plannedEnd),
    stillActive = forecast.remaining;
  const plannedPenalty = stillActive.reduce(
      (sum, flight) =>
        sum + delayPenaltyPoints(ownDelaySeconds(flight, plannedEnd)),
      0,
    ),
    plannedScore = state.score + forecast.points - plannedPenalty;
  const inWindow = (after: number, until: number) =>
    inboundFlightsBetween(
      after,
      until,
      new Set(state.flights.map((f) => f.id)),
    ).length;
  // "Now" shifts every arrival in the next shift window onto the successor;
  // "planned" lets this shift keep receiving until its planned end.
  const successorIntake = inWindow(at, at + SHIFT_LENGTH),
    ownIntakeIfKept = inWindow(at, plannedEnd);
  const activeNow = state.flights.filter((f) => f.status !== "departed").length;
  const unfinishedNow = state.services.filter(
    (task) =>
      task.status !== "done" &&
      state.flights.find((f) => f.id === task.flightId)?.status !== "departed",
  ).length;
  const nowOption: HandoverOption = {
    key: "now",
    label: "立即交班",
    at,
    settleableScore: nowSettlement.finalScore,
    newInboundCount: successorIntake,
    inheritedFlights: activeNow,
    unfinishedTasks: unfinishedNow,
    riskLevel: riskLevel("now", state, 0),
    note:
      successorIntake > 0
        ? `现在交班，${successorIntake} 架新进港转由下一班接收，本班不再新增收入。`
        : "现在交班，本班不再接收新的进港航班。",
  };
  const plannedOption: HandoverOption = {
    key: "planned",
    label: "值守至计划交班",
    at: plannedEnd,
    settleableScore: plannedScore,
    newInboundCount: ownIntakeIfKept,
    inheritedFlights: stillActive.length,
    unfinishedTasks: state.services.filter(
      (task) =>
        task.status !== "done" &&
        stillActive.some((flight) => flight.id === task.flightId),
    ).length,
    riskLevel: riskLevel("planned", state, ownIntakeIfKept),
    note:
      plannedEnd <= at
        ? "计划交班时刻已到，继续值守不再增加可结算收入。"
        : `继续值守期间本班将新接 ${ownIntakeIfKept} 架进港，多结算约 ${Math.max(0, plannedScore - nowSettlement.finalScore)} 分。`,
  };
  const gap = plannedScore - nowSettlement.finalScore;
  const verdict =
    plannedEnd <= at
      ? "计划交班时刻已到，建议立即交班。"
      : gap <= 0 && ownIntakeIfKept > 0
        ? `继续值守不会增加可结算收入，还会多接 ${ownIntakeIfKept} 架进港，建议立即交班。`
        : gap <= 0
          ? "立即交班与值守至计划时刻的可结算收入相当，建议立即交班。"
          : `值守至 ${clockLabel(plannedEnd)} 可多结算约 ${gap} 分，代价是多接 ${ownIntakeIfKept} 架进港、多 ${plannedOption.unfinishedTasks} 项未完保障。`;
  return {
    now: nowOption,
    planned: plannedOption,
    plannedEnd,
    newPlanCount,
    verdict,
  };
}
