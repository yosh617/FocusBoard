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
  onCollapse: () => void;
  onShowFloating: () => void;
};

const modes: TimerMode[] = ["work", "shortBreak", "longBreak"];
const programs: { value: TimerProgram; label: string; caption: string }[] = [
  { value: "pomodoro", label: "ポモドーロ", caption: "集中と休憩を循環" },
  { value: "countdown", label: "カウントダウン", caption: "残り時間を表示" },
  { value: "countup", label: "カウントアップ", caption: "経過時間を表示" }
];
const modeCaptions: Record<TimerMode, string> = {
  work: "集中する時間",
  shortBreak: "ひと休み",
  longBreak: "しっかり休む"
};

export function PomodoroTimer({
  timer,
  fontSize,
  onStart,
  onSelectMode,
  onSelectProgram,
  onSelectCategory,
  onSetDuration,
  onReset,
  onCollapse,
  onShowFloating
}: Props) {
  const isActive = timer.status !== "idle";
  const elapsedMs = getTimerElapsedMs(timer);
  const displayMs = timer.program === "countup" ? elapsedMs : timer.status === "overtime" ? Math.max(0, elapsedMs - timer.durationMs) : timer.remainingMs;
  const countupLap = getCountupLap(elapsedMs, timer.durationMs);
  const statusLabel = timer.status === "running" ? "進行中" : timer.status === "paused" ? "一時停止中" : timer.status === "overtime" ? "延長中" : "完了";
  const statusDetail = timer.status === "running" ? "タイマーは動作中" : timer.status === "paused" ? "タイマーは一時停止中" : timer.status === "overtime" ? "設定時間を過ぎています。終了ボタンでタイマーを終えられます。" : "タイマーは終了済み";

  return (
    <section className={`timer-card timer-setup${isActive ? " timer-setup--active" : ""}`} aria-label={isActive ? "進行中タイマーの設定" : "タイマー設定"}>
      <div className="timer-setup__heading">
        <div>
          <span>{isActive ? "TIMER IS ON" : "FOCUS TIMER"}</span>
          <h2>{isActive ? "タイマーを確認" : "集中時間をセット"}</h2>
          {!isActive && <p className="timer-setup__heading-caption">やることを選んで、すぐに始められます</p>}
        </div>
        <div className="timer-setup__tools">
          {timer.program === "pomodoro" && <p className="timer-setup__sessions"><strong>{timer.completedWorkSessions}</strong><span>セッション</span></p>}
          {!isActive && <button className="timer-setup__collapse" type="button" aria-label="タイマー設定をしまう" title="タイマー設定をしまう" onClick={onCollapse}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
          </button>}
        </div>
      </div>

      {isActive ? <div className="timer-setup__live-note" role="status"><strong>{statusLabel}・{statusDetail}</strong><span>{timer.program === "countup" ? `${countupLap}周目。目安 ${formatDuration(timer.durationMs)}ごとに進捗が一周します。` : "設定を確認できます。タイマー表示へ戻って操作を続けられます。"}</span></div> : null}

      <div className="timer-setup__step">
        <div className="timer-setup__step-heading">
          <span className="timer-setup__step-number">1</span>
          <div><strong>タイマー方式</strong><span>目的に合わせて選択</span></div>
        </div>
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
              <strong>{program.label}</strong><span>{program.caption}</span>
            </button>
          ))}
        </div>
      </div>

      {timer.program === "pomodoro" ? (
        <div className="timer-setup__step">
          <div className="timer-setup__step-heading">
            <span className="timer-setup__step-number">2</span>
            <div><strong>今からすること</strong><span>集中か休憩かを選択</span></div>
          </div>
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
                <strong>{modeLabels[mode]}</strong><small>{modeCaptions[mode]}</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="timer-setup__step">
          <div className="timer-setup__step-heading">
            <span className="timer-setup__step-number">2</span>
            <div><strong>時間を決める</strong><span>自分に合う長さでスタート</span></div>
          </div>
          <div className="custom-timer-options">
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
            <label className="duration-field" htmlFor="custom-duration">
              <span>時間</span>
              <input
                id="custom-duration"
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
          </div>
        </div>
      )}

      <div className={`timer-setup__footer${isActive ? " timer-setup__footer--active" : ""}`}>
        <div className="timer-setup__preview">
          {!isActive && <span>セット時間</span>}
          <div className="timer-card__time" style={{ fontSize: `${Math.min(fontSize, 68)}px` }}>
            {formatDuration(displayMs)}
            {isActive && <small className="timer-card__status">{timer.program === "countup" ? `${countupLap}周目` : statusLabel}</small>}
          </div>
        </div>
        {isActive ? <div className="timer-setup__actions"><button className="timer-return-button" type="button" onClick={onShowFloating}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          タイマー表示へ戻る
        </button><button className="timer-reset-button" type="button" onClick={onReset} aria-label="タイマーをリセット" title="タイマーをリセット">
          リセット
        </button></div> : <button className="timer-start-button" type="button" onClick={onStart}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>
          開始
        </button>}
      </div>
    </section>
  );
}
