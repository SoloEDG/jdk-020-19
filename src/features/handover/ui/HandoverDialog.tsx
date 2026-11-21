import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  ShieldAlert,
  TriangleAlert,
  Clock3,
  X,
} from "lucide-react";
import type {
  HandoverPlanLine,
  HandoverRisk,
  PlanAdjustment,
  Shift,
} from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import { compatibleStand } from "../../apron";
import { serviceCatalog } from "../../services";
import { shiftLabel } from "../../../shared/constants";
import { buildHandoverPlan } from "../model/handover";
import type { HandoverRequest } from "../model/handover";
import { canHandOver } from "../model/handover";
import { handoverTaskLines } from "../model/tasks";
import { clockDelta } from "../model/risks";

interface Props {
  state: Shift;
  onClose: () => void;
  onConfirm: (request: HandoverRequest) => void;
}

const severityIcon = (severity: HandoverRisk["severity"]) =>
  severity === "danger" ? <ShieldAlert size={14} /> : <TriangleAlert size={14} />;

export function HandoverDialog({ state, onClose, onConfirm }: Props) {
  const [adjustments, setAdjustments] = useState<Record<string, PlanAdjustment>>(
      {},
    ),
    [acknowledged, setAcknowledged] = useState<Set<string>>(new Set()),
    [checkedIn, setCheckedIn] = useState(false);
  const plan = useMemo(
      () => buildHandoverPlan(state, state.time, adjustments),
      [state, adjustments],
    ),
    taskLines = useMemo(() => handoverTaskLines(state, state.time), [state]),
    dangers = plan.risks.filter((risk) => risk.severity === "danger"),
    unacknowledged = dangers.filter((risk) => !acknowledged.has(risk.id)),
    plannedLines = plan.lines.filter(
      (line) =>
        line.source === "new" ||
        state.flights.find((f) => f.id === line.flightId)?.standId ===
          undefined,
    ),
    canConfirm =
      unacknowledged.length === 0 && checkedIn && canHandOver(state);
  const adjust = (line: HandoverPlanLine) => {
    const current = adjustments[line.flightId] ?? { deferSeconds: 0 };
    const stand = line.assignedStandId;
    const persist = (next: PlanAdjustment) =>
      setAdjustments((map) => ({ ...map, [line.flightId]: next }));
    const defer = (delta: number) =>
      persist({
        ...current,
        deferSeconds: Math.max(0, (current.deferSeconds ?? 0) + delta),
      });
    const choose = (standId: string) =>
      persist({
        ...current,
        standId: standId === stand ? undefined : standId,
      });
    const reset = () =>
      setAdjustments((map) => {
        const next = { ...map };
        delete next[line.flightId];
        return next;
      });
    return { defer, choose, reset };
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="handover-modal">
        <header className="handover-head">
          <div>
            <span className="eyebrow">FORMAL HANDOVER · 交接班</span>
            <h2>
              第 {shiftLabel(state.number)} 班
              <ArrowLeftRight size={20} />
              第 {shiftLabel(state.number + 1)} 班
            </h2>
            <p>
              交班时刻 <b>{clockLabel(state.time)}</b>{" "}
              是本班结算边界，也是下班初始现场。飞机、保障、车辆与机位原样移交。
            </p>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="关闭交接">
            <X size={18} />
          </button>
        </header>
        <div className="handover-body">
          <section className="handover-compare">
            <div className="subheading">
              <h3>交班时刻对比</h3>
              <span>SETTLEMENT COMPARISON</span>
            </div>
            <div className="compare-grid">
              <article
                className={`compare-card chosen`}
                data-testid="compare-now"
              >
                <span className="compare-tag">现在交班 · {clockLabel(plan.comparison.now.at)}</span>
                <strong data-testid="compare-now-score">
                  {plan.comparison.now.settleableScore}
                  <small>PTS 可结算</small>
                </strong>
                <dl>
                  <div>
                    <dt>转交下班进港</dt>
                    <dd>{plan.comparison.now.newInboundCount} 架</dd>
                  </div>
                  <div>
                    <dt>移交未完保障</dt>
                    <dd>{taskLines.length} 项</dd>
                  </div>
                  <div>
                    <dt>风险等级</dt>
                    <dd>{plan.comparison.now.riskLevel}</dd>
                  </div>
                </dl>
                <p>{plan.comparison.now.note}</p>
              </article>
              <article className="compare-card" data-testid="compare-planned">
                <span className="compare-tag">
                  值守至计划 {clockLabel(plan.comparison.planned.at)}
                </span>
                <strong data-testid="compare-planned-score">
                  {plan.comparison.planned.settleableScore}
                  <small>PTS 预估</small>
                </strong>
                <dl>
                  <div>
                    <dt>值守新接进港</dt>
                    <dd>{plan.comparison.planned.newInboundCount} 架</dd>
                  </div>
                  <div>
                    <dt>预计仍需移交</dt>
                    <dd>{plan.comparison.planned.unfinishedTasks} 项</dd>
                  </div>
                  <div>
                    <dt>风险等级</dt>
                    <dd>{plan.comparison.planned.riskLevel}</dd>
                  </div>
                </dl>
                <p>{plan.comparison.planned.note}</p>
              </article>
            </div>
            <div className="compare-verdict" data-testid="compare-verdict">
              <Clock3 size={15} />
              {plan.comparison.verdict}
            </div>
          </section>

          <section className="handover-settlement">
            <div className="subheading">
              <h3>本班结算</h3>
              <span>SETTLEMENT LEDGER</span>
            </div>
            <div className="settle-row">
              <div>
                <span>已得运行分</span>
                <b>{plan.settlementPreview.earnedScore}</b>
              </div>
              <div>
                <span>本班新增延误扣分</span>
                <b className="warn">-{plan.settlementPreview.delayPenalty}</b>
              </div>
              <div>
                <span>本班结算分</span>
                <b data-testid="settle-final">
                  {plan.settlementPreview.finalScore}
                </b>
              </div>
            </div>
            <p className="settle-note">
              本班新增加速延误 {clockDelta(plan.settlementPreview.accruedDelaySeconds)}
              ；累计延误 {clockDelta(plan.settlementPreview.carriedDelaySeconds)}{" "}
              中已带入部分不重复扣分，接班后按新发生的操作损失独立归属。
            </p>
          </section>

          <section className="handover-risks">
            <div className="subheading">
              <h3>交接前风险检查</h3>
              <span>{dangers.length ? `${unacknowledged.length} 项待确认` : "无阻断风险"}</span>
            </div>
            {plan.risks.length === 0 ? (
              <p className="empty-risk" data-testid="risk-empty">
                未发现未处理风险，可以交接。
              </p>
            ) : (
              <ul className="risk-list">
                {plan.risks.map((risk) => (
                  <li
                    className={`risk ${risk.severity}`}
                    key={risk.id}
                    data-testid={`risk-${risk.id}`}
                  >
                    <span className="risk-icon">{severityIcon(risk.severity)}</span>
                    <div>
                      <strong>{risk.title}</strong>
                      <p>{risk.detail}</p>
                    </div>
                    {risk.severity === "danger" && (
                      <label className="risk-check">
                        <input
                          type="checkbox"
                          checked={acknowledged.has(risk.id)}
                          onChange={(event) =>
                            setAcknowledged((set) => {
                              const next = new Set(set);
                              if (event.target.checked) next.add(risk.id);
                              else next.delete(risk.id);
                              return next;
                            })
                          }
                        />
                        已处理
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="handover-plan">
            <div className="subheading">
              <h3>接班计划 · 进港与机位</h3>
              <span>
                {plan.planFlightIds.length} 架新进港 · 现场不改动
              </span>
            </div>
            {plannedLines.length === 0 ? (
              <p className="empty-risk">接班班次暂无新的进港计划。</p>
            ) : (
              <table className="plan-table">
                <thead>
                  <tr>
                    <th>航班</th>
                    <th>来源</th>
                    <th>计划到达</th>
                    <th>机位</th>
                    <th>调整</th>
                  </tr>
                </thead>
                <tbody>
                  {plannedLines.map((line) => {
                    const controls = adjust(line),
                      flight = state.flights.find(
                        (f) => f.id === line.flightId,
                      ) ?? plan.newFlights.find((f) => f.id === line.flightId),
                      compatible = state.stands.filter(
                        (stand) =>
                          !flight || compatibleStand(stand, flight),
                      );
                    return (
                      <tr
                        key={line.flightId}
                        className={line.severity}
                        data-testid={`plan-${line.flightId}`}
                      >
                        <td>
                          <strong>{line.flightId}</strong>
                          <small>{line.note}</small>
                        </td>
                        <td>{line.source === "new" ? "新进港" : "在场未停靠"}</td>
                        <td>
                          {clockLabel(line.arrival)}
                          {line.deferred && <em className="deferred">顺延</em>}
                        </td>
                        <td>{line.assignedStandId ?? "—"}</td>
                        <td className="plan-actions">
                          <button onClick={() => controls.defer(-60)} title="提前 60 秒">
                            −60s
                          </button>
                          <button onClick={() => controls.defer(60)} title="顺延 60 秒">
                            +60s
                          </button>
                          <select
                            value={adjustments[line.flightId]?.standId ?? ""}
                            onChange={(event) =>
                              controls.choose(event.target.value)
                            }
                            aria-label={`${line.flightId} 机位`}
                          >
                            <option value="">自动</option>
                            {compatible.map((stand) => (
                              <option key={stand.id} value={stand.id}>
                                {stand.id}
                              </option>
                            ))}
                          </select>
                          {adjustments[line.flightId] && (
                            <button onClick={controls.reset} title="恢复自动">
                              重置
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="plan-note">
              已停靠飞机不会因接班计划被挪动；若计划与现场占用冲突，请顺延或改派新进港航班。
            </p>
          </section>

          <section className="handover-inherit">
            <div className="subheading">
              <h3>移交清单</h3>
              <span>HANDOVER MANIFEST</span>
            </div>
            <div className="inherit-grid">
              <div>
                <b>{plan.settlementPreview.inheritedFlights}</b>
                <span>未离港飞机</span>
              </div>
              <div>
                <b>{taskLines.length}</b>
                <span>进行中保障</span>
              </div>
              <div>
                <b>{plan.settlementPreview.activeVehicles}</b>
                <span>在途车辆</span>
              </div>
              <div>
                <b>{plan.settlementPreview.occupiedStands}</b>
                <span>占用机位</span>
              </div>
            </div>
            {taskLines.length > 0 && (
              <div className="task-lines">
                {taskLines.slice(0, 6).map((line) => (
                  <span key={line.taskId}>
                    {line.flightId} · {serviceCatalog[line.kind].label} · 剩
                    {line.remainingSeconds}s
                  </span>
                ))}
                {taskLines.length > 6 && <span>…共 {taskLines.length} 项</span>}
              </div>
            )}
          </section>
        </div>
        <footer className="handover-foot">
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={checkedIn}
              onChange={(event) => setCheckedIn(event.target.checked)}
              data-testid="handover-checkbox"
            />
            已核对移交清单，确认交班后本班转为只读
          </label>
          <div>
            <button className="secondary" onClick={onClose}>
              继续当班
            </button>
            <button
              className="primary"
              data-testid="confirm-handover"
              disabled={!canConfirm}
              onClick={() =>
                onConfirm({
                  at: Math.max(state.time, state.startedAt + 1),
                  expectedShiftId: state.shiftId,
                  adjustments,
                })
              }
            >
              确认交班 <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
