/** Seconds of simulated time in one planned shift (10 minutes). */
export const SHIFT_LENGTH = 600;
/** Simulation clock starts at 08:00 local time. */
export const SHIFT_START_MINUTES = 8 * 60;
export function shiftIdFor(number: number): string {
  return `shift-${number}`;
}
export function shiftLabel(number: number): string {
  return String(number).padStart(2, "0");
}
