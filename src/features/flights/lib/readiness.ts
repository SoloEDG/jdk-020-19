import type { Flight, Shift } from "../../../shared/types";
export function flightReady(state: Shift, id: string): boolean {
  const tasks = state.services.filter((t) => t.flightId === id);
  return tasks.length === 3 && tasks.every((t) => t.status === "done");
}
export function turnaroundProgress(state: Shift, id: string): number {
  const tasks = state.services.filter((t) => t.flightId === id);
  return tasks.length
    ? Math.round(tasks.reduce((n, t) => n + t.progress, 0) / tasks.length)
    : 0;
}
export function delaySeconds(flight: Flight, time: number): number {
  return Math.max(
    0,
    Math.floor((flight.departureAt ?? time) - flight.deadline),
  );
}
/**
 * Delay accrued after this shift took over the aircraft. The delay already
 * carried into the shift is kept on the record but never re-charged here.
 */
export function ownDelaySeconds(flight: Flight, time: number): number {
  return Math.max(0, delaySeconds(flight, time) - (flight.delayCarried ?? 0));
}
/** Points still collectable if pushback happens at `time`. */
export function departurePoints(flight: Flight, time: number): number {
  return Math.max(20, 120 - ownDelaySeconds(flight, time));
}
export const statusLabels: Record<Flight["status"], string> = {
  scheduled: "计划到达",
  incoming: "等待机位",
  parked: "地勤保障",
  departing: "正在推出",
  departed: "已离港",
};
