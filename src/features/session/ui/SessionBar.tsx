import {
  Pause,
  Play,
  FastForward,
  Save,
  FolderOpen,
  RotateCcw,
  Plane,
  ArrowLeftRight,
  History,
  Lock,
} from "lucide-react";
import type { Shift } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import { shiftLabel } from "../../../shared/constants";
export function SessionBar({
  state,
  canLoad,
  onPause,
  onSpeed,
  onSave,
  onLoad,
  onReset,
  onHandover,
  onReview,
}: {
  state: Shift;
  canLoad: boolean;
  onPause: () => void;
  onSpeed: () => void;
  onSave: () => void;
  onLoad: () => void;
  onReset: () => void;
  onHandover: () => void;
  onReview: () => void;
}) {
  return (
    <header className="session-bar">
      <div className="brand">
        <div className="brand-icon">
          <Plane size={25} />
        </div>
        <div>
          <strong>
            APRON <b>07</b>
          </strong>
          <span>机场地勤指挥 / GROUND CONTROL</span>
        </div>
      </div>
      <div className="shift-title">
        {state.archived ? (
          <Lock size={13} />
        ) : (
          <span className="live-dot" />
        )}
        <span data-testid="shift-name">
          第 {shiftLabel(state.number)} 班值守
          <span>
            SHIFT {shiftLabel(state.number)} ·{" "}
            {state.archived ? "READ ONLY" : "EAST FIELD"}
          </span>
        </span>
      </div>
      <div className="clock">
        <span>LOCAL TIME</span>
        <strong>
          {clockLabel(state.time)}
          <small>:{String(Math.floor(state.time % 60)).padStart(2, "0")}</small>
        </strong>
      </div>
      <div className="shift-window" data-testid="shift-window">
        <span>窗口</span>
        <b>
          {clockLabel(state.startedAt)}–{clockLabel(state.endsAt)}
        </b>
      </div>
      <div className="time-buttons">
        <button
          aria-label={state.paused ? "继续" : "暂停"}
          data-testid="pause"
          disabled={state.archived}
          onClick={onPause}
        >
          {state.paused ? <Play size={17} /> : <Pause size={17} />}
        </button>
        <button
          onClick={onSpeed}
          data-testid="speed"
          disabled={state.archived}
          title="切换模拟速度"
        >
          <FastForward size={15} />
          {state.speed}×
        </button>
      </div>
      <div className="file-buttons">
        <button
          onClick={onHandover}
          data-testid="open-handover"
          title={
            state.archived
              ? "本班已交班"
              : `交接给第 ${state.number + 1} 班`
          }
          aria-label="交接班"
          className="handover-button"
          disabled={state.archived || state.time <= state.startedAt}
        >
          <ArrowLeftRight size={16} />
          交班
        </button>
        <button
          onClick={onReview}
          title="交接记录"
          aria-label="交接记录"
          data-testid="open-review"
        >
          <History size={17} />
        </button>
        <button
          onClick={onSave}
          title="保存班次"
          aria-label="保存班次"
          disabled={state.archived}
        >
          <Save size={17} />
        </button>
        <button
          onClick={onLoad}
          title={canLoad ? "读取存档" : "没有可用存档"}
          aria-label="读取存档"
          disabled={!canLoad}
        >
          <FolderOpen size={17} />
        </button>
        <button onClick={onReset} title="新班次" aria-label="新班次">
          <RotateCcw size={17} />
        </button>
      </div>
    </header>
  );
}
