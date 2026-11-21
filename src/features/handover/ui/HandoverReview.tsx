import {
  ArrowLeftRight,
  ClipboardCheck,
  ShieldAlert,
  TriangleAlert,
  Info,
  History,
} from "lucide-react";
import type { HandoverRecord, HandoverRisk } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import { serviceCatalog } from "../../services";
import { shiftLabel } from "../../../shared/constants";
import { clockDelta } from "../model/risks";

const riskIcon = (severity: HandoverRisk["severity"]) =>
  severity === "danger" ? (
    <ShieldAlert size={13} />
  ) : severity === "warning" ? (
    <TriangleAlert size={13} />
  ) : (
    <Info size={13} />
  );

export function HandoverReview({
  records,
  onClose,
}: {
  records: HandoverRecord[];
  onClose: () => void;
}) {
  const latest = records[records.length - 1];
  if (!latest)
    return (
      <div className="handover-review" data-testid="handover-review-empty">
        <div className="subheading">
          <h3>
            <History size={15} /> 交接记录
          </h3>
          <span>0 次交班</span>
        </div>
        <p className="empty-risk">
          本班尚未交接。完成一次交班后，这里会保留上一班的结算、风险与未完任务清单。
        </p>
        <button className="secondary close-review" onClick={onClose}>
          关闭
        </button>
      </div>
    );
  return (
    <div className="handover-review" data-testid="handover-review">
      <div className="subheading">
        <h3>
          <History size={15} /> 交接记录
        </h3>
        <span>{records.length} 次交班</span>
      </div>
      <article className="review-card" data-testid="review-latest">
        <div className="review-head">
          <strong>
            第 {shiftLabel(latest.fromShiftNumber)} 班
            <ArrowLeftRight size={14} />第 {shiftLabel(latest.toShiftNumber)} 班
          </strong>
          <span>{clockLabel(latest.at)}</span>
        </div>
        <div className="review-scores">
          <div>
            <span>本班结算</span>
            <b>{latest.settlement.finalScore}</b>
          </div>
          <div>
            <span>移出延误</span>
            <b>{clockDelta(latest.settlement.carriedDelaySeconds)}</b>
          </div>
          <div>
            <span>移交任务</span>
            <b>{latest.taskLines.length}</b>
          </div>
          <div>
            <span>继承飞机</span>
            <b>{latest.inheritedFlightIds.length}</b>
          </div>
        </div>
        <div className="review-risks">
          {latest.risks.length === 0 ? (
            <span className="review-ok">
              <ClipboardCheck size={13} /> 交接时无未处理风险
            </span>
          ) : (
            latest.risks.map((risk) => (
              <span className={`risk-inline ${risk.severity}`} key={risk.id}>
                {riskIcon(risk.severity)}
                {risk.title}
              </span>
            ))
          )}
        </div>
        <details>
          <summary>同一笔未完任务 · {latest.taskLines.length} 项</summary>
          <ul className="task-line-list">
            {latest.taskLines.map((line) => (
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
        </details>
      </article>
      <button className="secondary close-review" onClick={onClose}>
        关闭记录
      </button>
    </div>
  );
}
