import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { FloatingPosition, TimerState } from "../types/timer";
import { formatDuration, modeLabels } from "../utils/time";

type Props = {
  timer: TimerState;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onPositionChange: (position: FloatingPosition) => void;
};

const programLabels = { pomodoro: "POMODORO", countdown: "COUNTDOWN", countup: "COUNT UP" } as const;

export function FloatingTimer({ timer, onStart, onPause, onReset, onPositionChange }: Props) {
  const [position, setPosition] = useState(timer.floatingPosition);
  const positionRef = useRef(timer.floatingPosition);
  const dragRef = useRef<{ pointerX: number; pointerY: number; position: FloatingPosition } | null>(null);
  const elapsedMs = Math.max(0, timer.durationMs - timer.remainingMs);
  const displayMs = timer.program === "countup" ? elapsedMs : timer.remainingMs;
  const progress = timer.durationMs > 0 ? Math.min(1, elapsedMs / timer.durationMs) : 0;
  const sessionLabel = timer.program === "pomodoro"
    ? modeLabels[timer.mode]
    : timer.category === "focus" ? "実施中" : "休憩";

  useEffect(() => {
    positionRef.current = timer.floatingPosition;
    setPosition(timer.floatingPosition);
  }, [timer.floatingPosition]);

  const clampPosition = (x: number, y: number): FloatingPosition => {
    const xMargin = Math.min(.22, 120 / window.innerWidth);
    const yMargin = Math.min(.24, 120 / window.innerHeight);
    return {
      x: Math.max(xMargin, Math.min(1 - xMargin, x)),
      y: Math.max(yMargin, Math.min(1 - yMargin, y))
    };
  };

  useEffect(() => {
    const keepInsideViewport = () => {
      const next = clampPosition(positionRef.current.x, positionRef.current.y);
      positionRef.current = next;
      setPosition(next);
      onPositionChange(next);
    };
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, [onPositionChange]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, position };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const next = clampPosition(
      dragRef.current.position.x + (event.clientX - dragRef.current.pointerX) / window.innerWidth,
      dragRef.current.position.y + (event.clientY - dragRef.current.pointerY) / window.innerHeight
    );
    positionRef.current = next;
    setPosition(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    onPositionChange(positionRef.current);
  };

  const moveWithKeyboard = (x: number, y: number) => {
    const next = clampPosition(position.x + x, position.y + y);
    positionRef.current = next;
    setPosition(next);
    onPositionChange(next);
  };

  return (
    <section
      className={`floating-timer floating-timer--${timer.status}`}
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
      aria-label={`${sessionLabel}タイマー`}
    >
      <div
        className="floating-timer__drag"
        role="timer"
        tabIndex={0}
        aria-label={`${sessionLabel} ${formatDuration(displayMs)}。ドラッグまたは矢印キーで移動できます。`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(event) => {
          const moves: Record<string, [number, number]> = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] };
          if (moves[event.key]) { event.preventDefault(); moveWithKeyboard(...moves[event.key]); }
        }}
      >
        <span className="floating-timer__grip" aria-hidden="true"><i /><i /><i /></span>
        <svg className="progress-ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle className="progress-ring__track" cx="100" cy="100" r="91" pathLength="100" />
          <circle className="progress-ring__value" cx="100" cy="100" r="91" pathLength="100" style={{ strokeDashoffset: 100 - progress * 100 }} />
        </svg>
        <div className="floating-timer__content">
          <span className="floating-timer__program">
            {timer.program === "pomodoro"
              ? `SESSION ${(timer.completedWorkSessions % 4) + 1} / 4`
              : programLabels[timer.program]}
          </span>
          <span className="floating-timer__session">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
            {sessionLabel}
          </span>
          <strong>{formatDuration(displayMs)}</strong>
          <div className="floating-timer__controls" onPointerDown={(event) => event.stopPropagation()}>
            {timer.status === "running" ? (
              <button className="floating-timer__primary" type="button" onClick={onPause} aria-label="一時停止">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>
              </button>
            ) : timer.status !== "completed" ? (
              <button className="floating-timer__primary" type="button" onClick={onStart} aria-label={timer.status === "idle" ? "開始" : "再開"}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>
              </button>
            ) : <span className="floating-timer__done">完了</span>}
            <button type="button" onClick={onReset} aria-label="リセットして設定へ戻る">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
