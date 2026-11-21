import type { Shift } from "../../../shared/types";
import { compatibleStand, occupiedFlight } from "../lib/geometry";
export function StandPicker({
  state,
  onAssign,
  onSelect,
}: {
  state: Shift;
  onAssign: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId);
  if (!f || f.status !== "incoming") return null;
  const valid = state.stands.find((s) => s.id === state.selectedStandId),
    planned = f.plannedStandId
      ? state.stands.find((s) => s.id === f.plannedStandId)
      : undefined;
  return (
    <div className="stand-picker">
      <div className="hint-label">01 / 为航班分配机位</div>
      {planned && (
        <p className="planned-stand" data-testid="planned-stand">
          接班计划建议机位 <b>{planned.id}</b>
          <button
            className="linkish"
            disabled={
              !!occupiedFlight(state, planned.id) ||
              !compatibleStand(planned, f)
            }
            onClick={() => onSelect(planned.id)}
          >
            采用
          </button>
        </p>
      )}
      <div className="stand-choices">
        {state.stands.map((s) => (
          <button
            key={s.id}
            disabled={!!occupiedFlight(state, s.id) || !compatibleStand(s, f)}
            className={s.id === state.selectedStandId ? "chosen" : ""}
            onClick={() => onSelect(s.id)}
          >
            {s.id}
            {s.size === "wide" && <small>W</small>}
            {s.id === f.plannedStandId && <small className="plan-mark">计</small>}
          </button>
        ))}
      </div>
      <button
        className="primary full"
        data-testid="assign-stand"
        disabled={
          !valid ||
          !!occupiedFlight(state, valid.id) ||
          !compatibleStand(valid, f)
        }
        onClick={() => valid && onAssign(valid.id)}
      >
        分配至 {valid?.id ?? "所选机位"} <span>↗</span>
      </button>
    </div>
  );
}
