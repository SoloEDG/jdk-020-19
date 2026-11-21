import type { Shift, Event } from "./types";
import { SHIFT_START_MINUTES } from "./constants";
export function copyShift(state: Shift): Shift {
  return structuredClone(state);
}
export function record(
  state: Shift,
  text: string,
  tone: Event["tone"] = "info",
): void {
  state.events.unshift({
    id: state.nextEventId++,
    time: state.time,
    text,
    tone,
  });
  state.events = state.events.slice(0, 30);
}
export function clockLabel(seconds: number): string {
  const minutes = SHIFT_START_MINUTES + Math.floor(seconds / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
