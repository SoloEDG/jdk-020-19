import type { Flight, Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { inboundFlightsBetween } from "../../flights/model/inbound";
import { initialServices } from "../../services/model/catalog";
export function advanceClock(state: Shift, seconds: number): Shift {
  if (state.paused || state.archived) return state;
  const s = copyShift(state),
    previous = s.time;
  s.time += seconds;
  for (const f of s.flights) {
    if (f.status === "scheduled" && s.time >= f.arrival) {
      f.status = "incoming";
      record(s, `${f.id} 已进入进港队列`);
    }
    if (f.status === "departing" && s.time - (f.departureAt ?? s.time) >= 12) {
      f.status = "departed";
      record(s, `${f.id} 已离港，机位 ${f.standId} 释放`, "success");
    }
  }
  // Continuous inbound traffic: new flights join the live shift as they arrive.
  const taken = new Set(s.flights.map((f) => f.id)),
    arrivals = inboundFlightsBetween(previous, s.time, taken);
  for (const flight of arrivals) {
    const joined: Flight = {
      ...flight,
      status: "incoming",
    };
    s.flights.push(joined);
    s.services.push(...initialServices([joined]));
    record(s, `${joined.id} 进港 · 待分配机位`, "info");
  }
  if (s.time >= s.endsAt && !s.events.some((e) => e.text.startsWith("本班计划交班时刻")))
    record(s, "本班计划交班时刻已到 · 建议立即交接，继续值守将按新班次收入核算", "warning");
  return s;
}
export function togglePause(s: Shift): Shift {
  if (s.archived) return s;
  return { ...s, paused: !s.paused };
}
export function changeSpeed(s: Shift): Shift {
  if (s.archived) return s;
  return { ...s, speed: s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1 };
}
