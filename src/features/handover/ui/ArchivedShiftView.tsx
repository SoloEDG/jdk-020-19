import { ArrowLeftRight, History, Lock, ShieldAlert, TriangleAlert, Info } from "lucide-react";
import type { Shift } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import { serviceCatalog } from "../../services";
import { shiftLabel } from "../../../shared/constants";
import { clockDelta } from "../model/risks";

/** Read-only view of the shift that just handed over. */
export function ArchivedShiftView({
  state,
  onBack,
}: {
  state: Shift;
  onBack: () => void;
}) {
  const record = state.handover;
  return (
    <div className="archived-view" data-testid="archived-view">
      <div className="archived-banner">
        <Lock size={16} />
        <div>
          <strong>
            第 {shiftLabel(state.number)} 班已交班 · 只读
          </strong>
          <span>
            {record
              ? `交接于 ${clockLabel(record.at)}，已移交第 ${shiftLabel(record.toShiftNumber)} 班`
              : "该班次已归档"}
          </span>
        </div>
        <button className="secondary" onClick={onBack}>
          返回当班
        </button>
      </div>
      {record && (
        <>
          <div className="archived-stats">
            <div>
              <span>本班结算</span>
              <b>{record.settlement.finalScore}</b>
            </div>
            <div>
              <span>已离港</span>
              <b>{record.settlement.departedFlights}</b>
            </div>
            <div>
              <span>移出延误</span>
              <b>{clockDelta(record.settlement.carriedDelaySeconds)}</b>
            </div>
            <div>
              <span>移交未完任务</span>
              <b>{record.taskLines.length}</b>
            </div>
          </div>
          <div className="archived-grid">
            <section>
              <h3>
                <ArrowLeftRight size={14} /> 移交清单
              </h3>
              <ul>
                <li>
                  未离港飞机：{record.inheritedFlightIds.join("、") || "无"}
                </li>
                <li>
                  占用机位：{record.occupiedStandIds.join("、") || "无"}
                </li>
                <li>
                  在途车辆：{record.inheritedVehicleIds.join("、") || "无"}
                </li>
                <li>接班计划：{record.planFlightIds.join("、") || "无"}</li>
              </ul>
            </section>
            <section>
              <h3>
                <History size={14} /> 未完任务核对
              </h3>
              <ul className="task-line-list readonly">
                {record.taskLines.map((line) => (
                  <li key={line.taskId}>
                    <strong>{line.flightId}</strong>
                    <span>{serviceCatalog[line.kind].label}</span>
                    <em>
                      {line.status === "working"
                        ? `作业 ${line.progress}%`
                        : line.status === "travel"
                          ? "车辆在途"
                          : "待派遣"}
                    </em>
                    <b>剩 {line.remainingSeconds}s</b>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>
                <ShieldAlert size={14} /> 交接风险
              </h3>
              {record.risks.length === 0 ? (
                <p className="review-ok">无未处理风险</p>
              ) : (
                <ul className="risk-plain">
                  {record.risks.map((risk) => (
                    <li className={risk.severity} key={risk.id}>
                      {risk.severity === "danger" ? (
                        <ShieldAlert size={12} />
                      ) : risk.severity === "warning" ? (
                        <TriangleAlert size={12} />
                      ) : (
                        <Info size={12} />
                      )}
                      {risk.title}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3>交班对比</h3>
              <p className="archived-compare">
                {record.comparison.now.settleableScore} PTS（
                {clockLabel(record.comparison.now.at)}） vs{" "}
                {record.comparison.planned.settleableScore} PTS（
                {clockLabel(record.comparison.planned.at)}）
              </p>
              <p className="archived-verdict">{record.comparison.verdict}</p>
            </section>
          </div>
        </>
      )}
      <section className="archived-events">
        <h3>当班记录</h3>
        <ul>
          {state.events.slice(0, 8).map((event) => (
            <li className={event.tone} key={event.id}>
              <span>{clockLabel(event.time)}</span>
              {event.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
