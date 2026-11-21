import type { Shift } from "../../../shared/types";
import { shiftLabel } from "../../../shared/constants";
import { ownDelaySeconds } from "../../flights";
export function ScoreStrip({ state }: { state: Shift }) {
  const active = state.flights.filter((f) => f.status !== "departed"),
    departed = state.flights.filter((f) => f.status === "departed").length,
    late = active.filter((f) => ownDelaySeconds(f, state.time) > 0).length;
  return (
    <div className="score-strip">
      <div>
        <span className="stat-icon orange">↗</span>
        <p>
          第 {shiftLabel(state.number)} 班得分
          <strong data-testid="shift-score">
            {state.score}
            <small>PTS</small>
          </strong>
        </p>
      </div>
      <div>
        <span className="stat-icon">✈</span>
        <p>
          已完成离港
          <strong>
            {String(departed).padStart(2, "0")}
            <small>/ {String(departed + active.length).padStart(2, "0")}</small>
          </strong>
        </p>
      </div>
      <div>
        <span className="stat-icon">◷</span>
        <p>
          本班新增延误
          <strong>
            {String(late).padStart(2, "0")}
            <small>FLIGHTS</small>
          </strong>
        </p>
      </div>
      <div>
        <span className="stat-icon">◇</span>
        <p>
          指令冲突
          <strong>
            {String(state.conflicts).padStart(2, "0")}
            <small>EVENTS</small>
          </strong>
        </p>
      </div>
      <div className="objective">
        <span>SHIFT OBJECTIVE</span>
        <strong>
          {active.length === 0
            ? "班次现场已清空 · 可以交班"
            : "让每一次起飞，都准时发生。"}
        </strong>
        <div>
          <i
            style={{
              width: `${Math.min(100, (departed / Math.max(1, departed + active.length)) * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
