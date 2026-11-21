import type { HandoverRisk, Shift } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import { compatibleStand } from "../../apron";
import { delaySeconds, ownDelaySeconds } from "../../flights";
import { serviceCatalog } from "../../services";
import { turnaroundRemaining } from "./tasks";
/**
 * Unresolved risks an outgoing controller should review before handing over.
 * These are advisory: the handover engine never drops an aircraft or a task to
 * make the plan fit, it only surfaces the conflict.
 */
export function handoverRisks(state: Shift, at: number): HandoverRisk[] {
  const risks: HandoverRisk[] = [];
  for (const flight of state.flights) {
    if (flight.status === "departed") continue;
    const tasks = state.services.filter((t) => t.flightId === flight.id),
      unfinished = tasks.filter((t) => t.status !== "done"),
      own = ownDelaySeconds(flight, at),
      total = delaySeconds(flight, at);
    if (own > 0)
      risks.push({
        id: `delay-${flight.id}`,
        severity: own >= 180 ? "danger" : "warning",
        title: `${flight.id} 本班新增延误 ${clockDelta(own)}`,
        detail:
          total > own
            ? `累计延误 ${clockDelta(total)}，其中 ${clockDelta(total - own)} 已由上班带入，不在本班重复扣分。`
            : `已超过计划离港 ${clockLabel(flight.deadline)}，延误随交班结算。`,
        flightId: flight.id,
      });
    if (flight.status === "departing")
      risks.push({
        id: `rollout-${flight.id}`,
        severity: "info",
        title: `${flight.id} 正在推出`,
        detail: "推出动作将在接班后完成，机位占用与离港状态由下一班接管。",
        flightId: flight.id,
      });
    if (flight.status === "parked" && unfinished.length > 0) {
      const idleByKind = (kind: string) =>
        state.vehicles.some((v) => v.kind === kind && v.status === "idle");
      for (const task of unfinished) {
        if (task.status === "pending" && !idleByKind(task.kind))
          risks.push({
            id: `fleet-${task.id}`,
            severity: "warning",
            title: `${serviceCatalog[task.kind].label}缺少可用车辆`,
            detail: `${flight.id} 的${serviceCatalog[task.kind].label}尚未派遣，车队暂无空闲${
              task.kind === "fuel" ? "加油车" : task.kind === "baggage" ? "行李车" : "清洁车"
            }，接班后需等待回场。`,
            flightId: flight.id,
            taskId: task.id,
          });
        if (
          task.status === "working" &&
          task.kind === "clean" &&
          state.services.some(
            (t) =>
              t.flightId === flight.id &&
              t.kind === "baggage" &&
              t.status !== "done",
          )
        )
          risks.push({
            id: `dependency-${task.id}`,
            severity: "warning",
            title: `客舱清洁与行李装卸交叉`,
            detail: `${flight.id} 的清洁已开始但行李装卸尚未完成，接班后需复核作业面。`,
            flightId: flight.id,
            taskId: task.id,
          });
      }
      if (flight.deadline < at && unfinished.length === tasks.length)
        risks.push({
          id: `untouched-${flight.id}`,
          severity: "danger",
          title: `${flight.id} 已误机且尚未开始保障`,
          detail: `计划离港 ${clockLabel(flight.deadline)} 已过，三项保障均未开始，接班后无法按原计划恢复。`,
          flightId: flight.id,
        });
    }
    if (flight.status === "incoming") {
      const free = state.stands.some(
        (stand) =>
          compatibleStand(stand, flight) &&
          !state.flights.some(
            (x) =>
              x.standId === stand.id && x.status !== "departed",
          ),
      );
      if (!free)
        risks.push({
          id: `nostand-${flight.id}`,
          severity: "danger",
          title: `${flight.id} 无机位可分配`,
          detail: "所有兼容机位均被未离港飞机占用，接班计划需顺延进港或调整机位。",
          flightId: flight.id,
        });
    }
    if (
      flight.status === "parked" &&
      flight.standId &&
      flight.deadline < at &&
      unfinished.length > 0 &&
      unfinished.length < tasks.length
    )
      risks.push({
        id: `behind-${flight.id}`,
        severity: "warning",
        title: `${flight.id} 保障进度落后`,
        detail: `计划离港 ${clockLabel(flight.deadline)} 已过，仍有 ${unfinished.length} 项保障未完成，剩余约 ${Math.round(
          turnaroundRemaining(state, flight.id, at),
        )} 秒。`,
        flightId: flight.id,
      });
  }
  const seen = new Set<string>();
  return risks.filter((risk) => {
    if (seen.has(risk.id)) return false;
    seen.add(risk.id);
    return true;
  });
}
export function clockDelta(seconds: number): string {
  const total = Math.max(0, Math.round(seconds)),
    minutes = Math.floor(total / 60),
    rest = total % 60;
  return minutes > 0 ? `${minutes}分${String(rest).padStart(2, "0")}秒` : `${rest}秒`;
}
