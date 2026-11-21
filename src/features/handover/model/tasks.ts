import type {
  Flight,
  HandoverTaskLine,
  Service,
  Shift,
  Vehicle,
} from "../../../shared/types";
import { serviceCatalog } from "../../services";
import { taskRemainingSeconds } from "../../services/lib/timing";
/**
 * Estimated seconds needed to finish every ground task on a flight, assuming
 * two service positions per stand and the cabin-clean dependency on baggage.
 * The estimate is used only for handover forecasts and stand release times.
 */
export function turnaroundRemaining(state: Shift, flightId: string, now: number): number {
  const tasks = state.services.filter(
      (t) => t.flightId === flightId && t.status !== "done",
    ),
    vehicle = (task: Service) =>
      state.vehicles.find((v) => v.id === task.vehicleId);
  const remaining = (kind: "baggage" | "fuel" | "clean") => {
    const task = tasks.find((t) => t.kind === kind);
    return task ? taskRemainingSeconds(task, vehicle(task)) : 0;
  };
  const baggage = remaining("baggage"),
    fuel = remaining("fuel"),
    clean = remaining("clean");
  // Clean waits for baggage; baggage and fuel share two service slots.
  return Math.max(baggage, fuel, baggage + clean);
}
/** Estimated seconds of ground time for an aircraft that has no tasks yet. */
export function estimatedGroundTime(flight: Flight): number {
  const scale = flight.size === "wide" ? 1.3 : 1;
  const baggage = serviceCatalog.baggage.duration * scale,
    fuel = serviceCatalog.fuel.duration * scale,
    clean = serviceCatalog.clean.duration * scale;
  return Math.max(baggage, fuel, baggage + clean);
}
/** Seconds until the aircraft could read pushback, relative to `now`. */
export function estimateReadyAt(state: Shift, flightId: string, now: number): number {
  const flight = state.flights.find((f) => f.id === flightId);
  if (!flight) return now;
  if (flight.status === "departing" || flight.status === "departed") return now;
  if (flight.status !== "parked") return Math.max(now, flight.arrival) + estimatedGroundTime(flight);
  const tasks = state.services.filter((t) => t.flightId === flightId);
  if (tasks.length > 0 && tasks.every((t) => t.status === "done")) return now;
  return now + turnaroundRemaining(state, flightId, now);
}
/**
 * One reconciliation line per unfinished task. Both shifts share these exact
 * lines through the handover record, so remaining work can be checked twice.
 */
export function handoverTaskLines(state: Shift, at: number): HandoverTaskLine[] {
  return state.services
    .filter((task) => {
      if (task.status === "done") return false;
      const flight = state.flights.find((f) => f.id === task.flightId);
      return flight !== undefined && flight.status !== "departed";
    })
    .map((task) => {
      const flight = state.flights.find((f) => f.id === task.flightId)!,
        vehicle = state.vehicles.find((v) => v.id === task.vehicleId);
      return {
        taskId: task.id,
        flightId: task.flightId,
        kind: task.kind,
        status: task.status,
        progress: Math.round(task.progress),
        remainingSeconds: Math.max(
          0,
          Math.round(taskRemainingSeconds(task, vehicle)),
        ),
        vehicleId: task.vehicleId,
        occupiedStandId: flight.standId,
      };
    })
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}
/** Vehicles that are not parked at the depot, kept on the map across shifts. */
export function activeVehicles(state: Shift): Vehicle[] {
  return state.vehicles.filter((v) => v.status !== "idle");
}
