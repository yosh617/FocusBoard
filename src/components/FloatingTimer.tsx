import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
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
  const [isCompact, setIsCompact] = useState(false);
  const [position, setPosition] = useState(timer.floatingPosition);
  const positionRef = useRef(timer.floatingPosition);
  const compactPositionRef = useRef<FloatingPosition | null>(null);
  const movedWhileExpandedRef = useRef(false);
  const dragElementRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; position: FloatingPosition; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
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
    const rect = dragElementRef.current?.getBoundingClientRect();
    const width = rect?.width || (isCompact ? 88 : 224);
    const height = rect?.height || (isCompact ? 88 : 224);
    const edgeGap = 8;
    const xMargin = (width / 2 + edgeGap) / window.innerWidth;
    const yMargin = (height / 2 + edgeGap) / window.innerHeight;
    return {
      x: Math.max(Math.min(.5, xMargin), Math.min(1 - Math.min(.5, xMargin), x)),
      y: Math.max(Math.min(.5, yMargin), Math.min(1 - Math.min(.5, yMargin), y))
    };
  };

  useEffect(() => {
    const keepInsideViewport = () => {
      const current = positionRef.current;
      const next = clampPosition(current.x, current.y);
      if (next.x === current.x && next.y === current.y) return;
      positionRef.current = next;
      setPosition(next);
      onPositionChange(next);
    };
    keepInsideViewport();
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, [isCompact, onPositionChange]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressClickRef.current = false;
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, position, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    if (Math.hypot(event.clientX - dragRef.current.pointerX, event.clientY - dragRef.current.pointerY) > 6) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;
    if (!isCompact) movedWhileExpandedRef.current = true;
    const next = clampPosition(
      dragRef.current.position.x + (event.clientX - dragRef.current.pointerX) / window.innerWidth,
      dragRef.current.position.y + (event.clientY - dragRef.current.pointerY) / window.innerHeight
    );
    positionRef.current = next;
    setPosition(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    suppressClickRef.current = drag.moved || event.type === "pointercancel";
    if (event.type === "pointercancel") return;
    if (drag.moved) {
      onPositionChange(positionRef.current);
    }
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button")) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleCompact();
  };

  const moveWithKeyboard = (x: number, y: number) => {
    if (!isCompact) movedWhileExpandedRef.current = true;
    const next = clampPosition(position.x + x, position.y + y);
    positionRef.current = next;
    setPosition(next);
    onPositionChange(next);
  };

  const toggleCompact = () => {
    if (isCompact) {
      compactPositionRef.current = positionRef.current;
      movedWhileExpandedRef.current = false;
      setIsCompact(false);
      return;
    }

    const compactPosition = compactPositionRef.current;
    if (compactPosition && !movedWhileExpandedRef.current) {
      positionRef.current = compactPosition;
      setPosition(compactPosition);
      onPositionChange(compactPosition);
    }
    compactPositionRef.current = null;
    setIsCompact(true);
  };

  return (
    <section
      className={`floating-timer floating-timer--${timer.status}${isCompact ? " floating-timer--compact" : ""}`}
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
      role="group"
      aria-label={`${sessionLabel}タイマー${isCompact ? "（ミニ表示）" : ""}`}
    >
      <div
        className="floating-timer__drag"
        ref={dragElementRef}
        role={isCompact ? "button" : "group"}
        aria-pressed={isCompact ? isCompact : undefined}
        tabIndex={0}
        aria-label={`${sessionLabel} ${formatDuration(displayMs)}。クリックで${isCompact ? "通常表示に戻す" : "ミニ表示にする"}。ドラッグまたは矢印キーで移動できます。`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        onKeyDown={(event) => {
          if ((event.target as Element).closest("button")) return;
          const moves: Record<string, [number, number]> = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] };
          if (moves[event.key]) { event.preventDefault(); moveWithKeyboard(...moves[event.key]); }
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleCompact(); }
        }}
      >
        <span className="floating-timer__grip" aria-hidden="true"><i /><i /><i /></span>
        <svg className="progress-ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle className="progress-ring__track" cx="100" cy="100" r="91" pathLength="100" />
          <circle className="progress-ring__value" cx="100" cy="100" r="91" pathLength="100" style={{ strokeDashoffset: 100 - progress * 100 }} />
        </svg>
        {isCompact ? (
          <div className="floating-timer__content floating-timer__content--compact">
            <strong>{formatDuration(displayMs)}</strong>
          </div>
        ) : (
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
        )}
      </div>
    </section>
  );
}
