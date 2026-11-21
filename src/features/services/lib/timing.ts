import type { Service, Vehicle } from "../../../shared/types";
/** Seconds left before a vehicle reaches its target. */
export function vehicleRemainingSeconds(v: Vehicle): number {
  if (v.status !== "travel" && v.status !== "returning") return 0;
  return Math.max(0, v.tripDuration * (1 - v.progress / 100));
}
/** Seconds left on a ground-service task, including any remaining drive. */
export function taskRemainingSeconds(
  task: Service,
  vehicle?: Vehicle,
): number {
  if (task.status === "done") return 0;
  const work = Math.max(0, task.duration * (1 - task.progress / 100));
  if (task.status === "travel")
    return work + (vehicle ? vehicleRemainingSeconds(vehicle) : 5);
  return work;
}
