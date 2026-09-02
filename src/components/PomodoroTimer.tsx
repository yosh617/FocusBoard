import type { SessionCategory, TimerMode, TimerProgram, TimerState } from "../types/timer";
import { formatDuration, getCountupLap, getTimerElapsedMs, modeLabels } from "../utils/time";

type Props = {
  timer: TimerState;
  fontSize: number;
  onStart: () => void;
  onSelectMode: (mode: TimerMode) => void;
  onSelectProgram: (program: TimerProgram) => void;
  onSelectCategory: (category: SessionCategory) => void;
  onSetDuration: (minutes: number) => void;
  onReset: () => void;
  onEnd: () => void;
  onCollapse: () => void;
  onShowFloating: () => void;
  taskSelectionEnabled: boolean;
  selectedTaskTitle: string | null;
  onOpenTaskPicker: () => void;
};

const modes: TimerMode[] = ["work", "shortBreak", "longBreak"];
const programs: { value: TimerProgram; label: string }[] = [
  { value: "pomodoro", label: "ポモドーロ" },
  { value: "countdown", label: "カウントダウン" },
  { value: "countup", label: "カウントアップ" }
];

function ProgramIcon({ program }: { program: TimerProgram }) {
  if (program === "pomodoro") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.5 8.2A7.5 7.5 0 1 0 19 14" /><path d="M18.5 4.5v3.7h-3.7M9 4.5h6" /></svg>;
  return program === "countdown"
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v9m-3-3 3 3 3-3" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 17V8m-3 3 3-3 3 3" /></svg>;
}

export function PomodoroTimer({
  timer,
  fontSize,
  onStart,
  onSelectMode,
  onSelectProgram,
  onSelectCategory,
  onSetDuration,
  onReset,
  onEnd,
  onCollapse,
  onShowFloating,
  taskSelectionEnabled,
  selectedTaskTitle,
  onOpenTaskPicker
}: Props) {
  const isActive = timer.status !== "idle";
  const elapsedMs = getTimerElapsedMs(timer);
  const displayMs = timer.program === "countup" ? elapsedMs : timer.status === "overtime" ? Math.max(0, elapsedMs - timer.durationMs) : timer.remainingMs;
  const countupLap = getCountupLap(elapsedMs, timer.durationMs);
  const statusLabel = timer.status === "running" ? "進行中" : timer.status === "paused" ? "一時停止中" : timer.status === "overtime" ? "延長中" : "完了";

  return (
    <section className={`timer-card timer-setup${isActive ? " timer-setup--active" : ""}`} aria-label={isActive ? "進行中タイマーの設定" : "タイマー設定"}>
      <div className="timer-setup__heading">
        <div>
          <h2>{isActive ? "実行中タイマー" : "タイマー設定"}</h2>
        </div>
        <div className="timer-setup__tools" style={{ marginInlineStart: "auto" }}>
          {timer.program === "pomodoro" && <p className="timer-setup__sessions" aria-label={`完了セッション ${timer.completedWorkSessions}`}><strong>{timer.completedWorkSessions}</strong></p>}
          {!isActive && <button className="timer-setup__collapse" type="button" aria-label="タイマー設定をしまう" title="タイマー設定をしまう" onClick={onCollapse}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
          </button>}
        </div>
      </div>

      {isActive ? <div className="timer-setup__live-note" role="status"><span className="timer-setup__status-dot" aria-hidden="true" /><strong>{statusLabel}</strong>{timer.program === "countup" && <span>{countupLap}周目</span>}{selectedTaskTitle && <span>タスク: {selectedTaskTitle}</span>}</div> : null}

      <div className="timer-setup__step">
        <div className="program-tabs" role="group" aria-label="タイマー方式">
          {programs.map((program) => (
            <button
              className={timer.program === program.value ? "program-tab program-tab--active" : "program-tab"}
              type="button"
              aria-pressed={timer.program === program.value}
              disabled={isActive}
              onClick={() => onSelectProgram(program.value)}
              key={program.value}
            >
              <ProgramIcon program={program.value} />
              <strong>{program.label}</strong>
              {timer.program === program.value && <svg className="timer-option__check" viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12 3.5 3.5 7.5-7.5" /></svg>}
            </button>
          ))}
        </div>
      </div>

      {timer.program === "pomodoro" ? (
        <div className="timer-setup__step">
          <div className="mode-tabs" role="group" aria-label="ポモドーロモード">
            {modes.map((mode) => (
              <button
                className={timer.mode === mode ? "mode-tab mode-tab--active" : "mode-tab"}
                type="button"
                aria-pressed={timer.mode === mode}
                disabled={isActive}
                onClick={() => onSelectMode(mode)}
                key={mode}
              >
                <strong>{modeLabels[mode]}</strong>
                {timer.mode === mode && <svg className="timer-option__check" viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12 3.5 3.5 7.5-7.5" /></svg>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="timer-setup__step">
          <div className="category-tabs" role="group" aria-label="時間の種類">
            {(["focus", "break"] as SessionCategory[]).map((category) => (
              <button
                className={timer.category === category ? "category-tab category-tab--active" : "category-tab"}
                type="button"
                aria-pressed={timer.category === category}
                disabled={isActive}
                onClick={() => onSelectCategory(category)}
                key={category}
              >
                {category === "focus" ? "実施中" : "休憩"}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isActive && taskSelectionEnabled && (
        <div className="timer-setup__step timer-setup__task-step">
          <button className={`timer-task-select${selectedTaskTitle ? " has-task" : ""}`} type="button" onClick={onOpenTaskPicker} aria-haspopup="dialog" aria-label={selectedTaskTitle ? `タスク「${selectedTaskTitle}」を変更` : "タスクを選ぶ・追加する"}>
            <span className="timer-task-select__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 6h11M8 12h11M8 18h7M4 6h.01M4 12h.01M4 18h.01" /></svg></span>
            <span><strong>{selectedTaskTitle ?? "タスク"}</strong></span>
            <svg className="timer-task-select__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>
      )}

      <div className="timer-setup__step">
        {timer.program === "pomodoro" ? (
          <div className="timer-setup__preview" aria-label={`${isActive ? "残り時間" : "設定時間"} ${formatDuration(displayMs)}`}>
            <div className="timer-card__time" style={{ fontSize: `${Math.min(fontSize, 68)}px` }}>{formatDuration(displayMs)}</div>
          </div>
        ) : (
          <label className="duration-field" htmlFor="custom-duration">
            <input
              id="custom-duration"
              aria-label="時間（分）"
              type="number"
              min="1"
              max="1440"
              inputMode="numeric"
              disabled={isActive}
              value={Math.round(timer.customDurationMs / 60_000)}
              onChange={(event) => onSetDuration(Number(event.target.value))}
            />
            <span>分</span>
          </label>
        )}
      </div>

      <div className={`timer-setup__footer${isActive ? " timer-setup__footer--active" : ""}`}>
        {isActive ? <div className="timer-setup__actions"><button className="timer-return-button" type="button" onClick={onShowFloating}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          タイマー表示へ戻る
        </button><button className="timer-end-button" type="button" onClick={onEnd} aria-label="タイマーを終了して記録" title="タイマーを終了して記録">
          終了
        </button><button className="timer-reset-button" type="button" onClick={onReset} aria-label="タイマーをリセット" title="タイマーをリセット">
          リセット
        </button></div> : <button className="timer-start-button" type="button" onClick={onStart}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>
          {selectedTaskTitle && taskSelectionEnabled ? `${selectedTaskTitle}を開始` : "開始"}
        </button>}
      </div>
    </section>
  );
}
