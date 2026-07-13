import type { TimerMode, TimerState } from "../types/timer";
import { formatDuration, modeLabels } from "../utils/time";

type Props = {
  timer: TimerState;
  fontSize: number;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSelectMode: (mode: TimerMode) => void;
};

const modes: TimerMode[] = ["work", "shortBreak", "longBreak"];

export function PomodoroTimer({ timer, fontSize, onStart, onPause, onReset, onSelectMode }: Props) {
  return (
    <section className="timer-card" aria-label="ポモドーロタイマー">
      <div className="mode-tabs" role="group" aria-label="タイマーモード">
        {modes.map((mode) => (
          <button
            className={timer.mode === mode ? "mode-tab mode-tab--active" : "mode-tab"}
            type="button"
            aria-pressed={timer.mode === mode}
            onClick={() => onSelectMode(mode)}
            key={mode}
          >
            {modeLabels[mode]}
          </button>
        ))}
      </div>
      <div className="timer-card__time" style={{ fontSize: `${fontSize}px` }} aria-label={`残り${formatDuration(timer.remainingMs)}`}>
        {formatDuration(timer.remainingMs)}
      </div>
      <div className="timer-card__status">
        {timer.status === "running" ? "進行中" : timer.status === "paused" ? "一時停止" : "準備完了"}
        <span aria-hidden="true"> · </span>完了 {timer.completedWorkSessions} セッション
      </div>
      <div className="timer-actions">
        <button className="primary-button" type="button" onClick={onStart} disabled={timer.status === "running"}>Start</button>
        <button className="secondary-button" type="button" onClick={onPause} disabled={timer.status !== "running"}>Pause</button>
        <button className="secondary-button" type="button" onClick={onReset}>Reset</button>
      </div>
    </section>
  );
}
