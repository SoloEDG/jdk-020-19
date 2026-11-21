import { useState } from "react";
import { FlightBoard, assignStand, selectFlight } from "../features/flights";
import { ApronMap, selectStand } from "../features/apron";
import { FleetPanel, selectVehicle } from "../features/fleet";
import { dispatchService } from "../features/services";
import {
  SessionBar,
  ScoreStrip,
  changeSpeed,
  togglePause,
  saveShift,
  loadShift,
  hasSavedShift,
  createShift,
} from "../features/session";
import {
  HandoverDialog,
  HandoverReview,
  ArchivedShiftView,
  archivedShift,
  confirmHandover,
  incomingHandover,
} from "../features/handover";
import type { HandoverRequest } from "../features/handover";
import { clockLabel } from "../shared/document";
import { useSimulation } from "./useSimulation";
import { Inspector } from "./Inspector";
import "./styles.css";
export function App() {
  const [state, setState] = useSimulation(),
    [notice, setNotice] = useState(""),
    [resetOpen, setResetOpen] = useState(false),
    [handoverOpen, setHandoverOpen] = useState(false),
    [reviewOpen, setReviewOpen] = useState(false),
    [archiveView, setArchiveView] = useState<
      ReturnType<typeof archivedShift> | undefined
    >(undefined);
  const notify = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 4000);
  };
  const incoming = incomingHandover(state);
  if (archiveView)
    return (
      <div className="app-shell">
        <ArchivedShiftView
          state={archiveView}
          onBack={() => setArchiveView(undefined)}
        />
      </div>
    );
  const handleConfirm = (request: HandoverRequest) => {
    const next = confirmHandover(state, request);
    setHandoverOpen(false);
    if (next === state) {
      notify("该交接已确认，未重复生成后续班次");
      return;
    }
    const record = next.handoverLog[next.handoverLog.length - 1];
    setState(next);
    notify(
      `第 ${next.number} 班已接班 · 继承 ${record.inheritedFlightIds.length} 架飞机、${record.taskLines.length} 项未完保障`,
    );
  };
  return (
    <div className="app-shell">
      <SessionBar
        state={state}
        canLoad={hasSavedShift()}
        onPause={() => setState(togglePause)}
        onSpeed={() => setState(changeSpeed)}
        onSave={() => {
          try {
            saveShift(state);
            notify("班次已保存到此浏览器");
          } catch {
            notify("保存失败：浏览器存储不可用");
          }
        }}
        onLoad={() => {
          const saved = loadShift();
          if (!saved) {
            notify("没有可用存档，当前班次保持不变");
            return;
          }
          if (saved.archived) {
            setArchiveView(saved);
            notify("已打开存档中的已交班班次（只读）");
            return;
          }
          setState(saved);
          notify(`已恢复第 ${saved.number} 班`);
        }}
        onReset={() => setResetOpen(true)}
        onHandover={() => {
          setState((s) => ({ ...s, paused: true }));
          setHandoverOpen(true);
        }}
        onReview={() => setReviewOpen(true)}
      />
      <main>
        <div className="page-heading">
          <div>
            <span className="eyebrow">EVERY MINUTE MATTERS.</span>
            <h1>
              掌控机坪的每一分钟<span>。</span>
            </h1>
          </div>
          <div className="field-badge">
            <span className="live-dot" />
            机场运行正常 <b>SHA / ZSSS</b>
          </div>
        </div>
        {incoming && (
          <div className="shift-intake" data-testid="shift-intake">
            <span>
              接班自第 {incoming.fromShiftNumber} 班 · 交接于{" "}
              {clockLabel(incoming.at)}
            </span>
            <b>
              继承 {incoming.inheritedFlightIds.length} 架 · 未完{" "}
              {incoming.taskLines.length} 项 · 新进港{" "}
              {incoming.planFlightIds.length} 架
            </b>
          </div>
        )}
        <ScoreStrip state={state} />
        <div className="workspace">
          <FlightBoard
            state={state}
            onSelect={(id) => setState((s) => selectFlight(s, id))}
          />
          <div className="center-column">
            <ApronMap
              state={state}
              onStand={(id) => setState((s) => selectStand(s, id))}
              onFlight={(id) => setState((s) => selectFlight(s, id))}
            />
            <FleetPanel
              state={state}
              onSelect={(id) => setState((s) => selectVehicle(s, id))}
            />
          </div>
          <Inspector
            state={state}
            onChange={setState}
            onStand={(id) => setState((s) => selectStand(s, id))}
            onAssign={(id) =>
              setState((s) => assignStand(s, s.selectedFlightId, id))
            }
            onDispatch={(kind, id) =>
              setState((s) => dispatchService(s, s.selectedFlightId, kind, id))
            }
          />
        </div>
        <footer>
          <span>APRON 07 · 地面有序，天空自由。</span>
          <span>
            {state.number > 1 ? "接班现场" : "操作提示"}：选择航班 → 分配机位 →
            派遣车辆 → 批准离港
          </span>
          <span>
            <i className="live-dot" />
            {state.paused ? "SIMULATION PAUSED" : "SIMULATION LIVE"}
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {handoverOpen && (
        <HandoverDialog
          state={state}
          onClose={() => setHandoverOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
      {reviewOpen && (
        <div className="modal-backdrop">
          <div className="modal review-modal">
            <HandoverReview
              records={state.handoverLog}
              onClose={() => setReviewOpen(false)}
            />
            {state.handoverLog.length > 0 && (
              <button
                className="secondary"
                onClick={() => {
                  const latest =
                    state.handoverLog[state.handoverLog.length - 1];
                  setReviewOpen(false);
                  setArchiveView(archivedShift(latest));
                }}
              >
                查看上一班只读现场
              </button>
            )}
          </div>
        </div>
      )}
      {resetOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <span className="eyebrow">NEW SHIFT · RESET</span>
            <h2>放弃当前现场并重开？</h2>
            <p>
              这会丢弃全部机坪现场，从早班初始状态重新开始，适合演示与重练。
              若要把未离港飞机与未完保障交给下一班，请使用「交班」。
            </p>
            <div>
              <button className="secondary" onClick={() => setResetOpen(false)}>
                继续当前班次
              </button>
              <button
                className="primary"
                data-testid="reset-confirm"
                onClick={() => {
                  setState(createShift());
                  setResetOpen(false);
                  notify("已重置为初始现场 · 建议用「交班」保留现场");
                }}
              >
                重置现场
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
