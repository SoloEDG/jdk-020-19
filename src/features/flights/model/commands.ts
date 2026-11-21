import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { departurePoints, flightReady } from "../lib/readiness";
export function assignStand(state: Shift, id: string, standId: string): Shift {
  if (state.archived) return state;
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id),
    stand = s.stands.find((x) => x.id === standId);
  if (!f || !stand) return state;
  const occupied = s.flights.some(
    (x) => x.standId === standId && x.status !== "departed",
  );
  if (
    f.status !== "incoming" ||
    occupied ||
    (f.size === "wide" && stand.size !== "wide")
  ) {
    s.conflicts++;
    s.score -= 10;
    record(s, "机位指令冲突：请检查尺寸、占用与航班状态", "warning");
    return s;
  }
  f.standId = standId;
  f.plannedStandId = undefined;
  f.status = "parked";
  s.selectedStandId = standId;
  record(s, `${id} 已停靠 ${standId}，可开始保障`, "success");
  return s;
}
export function departFlight(state: Shift, id: string): Shift {
  if (state.archived) return state;
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id);
  if (!f) return state;
  if (f.status !== "parked" || !flightReady(s, id)) {
    record(s, "离港未获许可：请先完成全部地勤任务", "warning");
    return s;
  }
  f.status = "departing";
  f.departureAt = s.time;
  f.departureShiftId = s.shiftId;
  f.departureShiftNumber = s.number;
  const points = departurePoints(f, s.time);
  s.score += points;
  record(s, `${id} 获准推出 · +${points} 分`, "success");
  return s;
}
export function selectFlight(state: Shift, id: string): Shift {
  const f = state.flights.find((x) => x.id === id);
  return {
    ...state,
    selectedFlightId: id,
    selectedStandId: f?.standId ?? f?.plannedStandId,
  };
}
