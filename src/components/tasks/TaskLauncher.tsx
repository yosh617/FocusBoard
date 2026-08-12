import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FreePosition } from "../../types/settings";

type Props = {
  todayCount: number;
  todaySummary?: {
    completedCount: number;
    totalCount: number;
    focusedLabel: string;
    overdueCount: number;
  };
  activeTaskTitle: string | null;
  suggestedTask: {
    id: string;
    title: string;
    detail: string;
  } | null;
  timerSummary: {
    statusText: string;
    title: string;
    detail: string;
    accessibleLabel?: string;
  } | null;
  onClick: () => void;
  position?: FreePosition;
  onPositionChange?: (position: FreePosition) => void;
  transient?: boolean;
  fading?: boolean;
};

const defaultTodaySummary = {
  completedCount: 0,
  totalCount: 0,
  focusedLabel: "0分",
  overdueCount: 0
} satisfies NonNullable<Props["todaySummary"]>;

const defaultPosition: FreePosition = { x: .2, y: .86 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const TaskLauncher = forwardRef<HTMLButtonElement, Props>(function TaskLauncher({ todayCount, todaySummary = defaultTodaySummary, activeTaskTitle, suggestedTask, timerSummary, onClick, position = defaultPosition, onPositionChange = () => undefined, transient = false, fading = false }, ref) {
  const title = timerSummary?.title ?? activeTaskTitle ?? suggestedTask?.title ?? "今日のタスク";
  const detail = timerSummary?.detail
    ?? (activeTaskTitle
      ? `今日の未完了 ${todayCount}件`
      : suggestedTask?.detail
        ?? (todayCount === 0 ? "今日の予定はありません" : `${todayCount}件を整理`));
  const status = timerSummary?.statusText ?? (activeTaskTitle ? "集中中" : suggestedTask ? "次のおすすめ" : "今日のタスク");
  const isEmphasized = activeTaskTitle !== null || timerSummary !== null;
  const isBreakFlow = timerSummary !== null && timerSummary.statusText !== "集中中";
  const actionLabel = timerSummary !== null || activeTaskTitle
    ? "戻る"
    : suggestedTask
      ? "おすすめ"
      : todayCount === 0
        ? "追加"
        : "整理";
  const queueLabel = todayCount === 0 ? "今日の未完了なし" : `未完了 ${todayCount}件`;
  const hintLabel = timerSummary !== null || activeTaskTitle
    ? "タスクとタイマーを開く"
    : suggestedTask
      ? "次の1件を開く"
      : "今日を整える";
  const completionRate = todaySummary.totalCount === 0
    ? 0
    : Math.round((todaySummary.completedCount / todaySummary.totalCount) * 100);
  const completionLabel = todaySummary.totalCount === 0
    ? "完了 0 / 0"
    : `完了 ${todaySummary.completedCount} / ${todaySummary.totalCount}`;
  const accessibleLabel = timerSummary?.accessibleLabel
    ?? (activeTaskTitle
      ? `タスクを開く。集中中のタスクは${activeTaskTitle}。今日の未完了は${todayCount}件`
      : suggestedTask
        ? `タスクを開く。次のおすすめは${suggestedTask.title}。今日の未完了は${todayCount}件`
        : `タスクを開く。今日の未完了は${todayCount}件`);
  const [isDimmed, setIsDimmed] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dimTimeoutRef = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number; position: FreePosition } | null>(null);
  const positionRef = useRef(position);
  const moved = useRef(false);
  positionRef.current = position;

  const clampPosition = useCallback((x: number, y: number): FreePosition => {
    const rect = launcherRef.current?.getBoundingClientRect();
    const width = rect?.width || Math.min(430, Math.max(0, window.innerWidth - 32));
    const height = rect?.height || 120;
    const edgeGap = 12;
    const minX = Math.min(.5, (width / 2 + edgeGap) / window.innerWidth);
    const minY = Math.min(.5, (height / 2 + edgeGap) / window.innerHeight);
    return { x: clamp(x, minX, 1 - minX), y: clamp(y, minY, 1 - minY) };
  }, []);

  const moveBy = useCallback((x: number, y: number) => onPositionChange(clampPosition(x, y)), [clampPosition, onPositionChange]);

  useLayoutEffect(() => {
    const keepInsideViewport = () => {
      const current = positionRef.current;
      const next = clampPosition(current.x, current.y);
      if (next.x !== current.x || next.y !== current.y) onPositionChange(next);
    };
    keepInsideViewport();
    window.addEventListener("resize", keepInsideViewport);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(keepInsideViewport);
    if (observer && launcherRef.current) observer.observe(launcherRef.current);
    return () => {
      window.removeEventListener("resize", keepInsideViewport);
      observer?.disconnect();
    };
  }, [clampPosition, onPositionChange]);

  useEffect(() => {
    const clearDimTimeout = () => {
      if (dimTimeoutRef.current !== null) {
        window.clearTimeout(dimTimeoutRef.current);
        dimTimeoutRef.current = null;
      }
    };
    const scheduleDim = () => {
      clearDimTimeout();
      if (isEmphasized) {
        setIsDimmed(false);
        return;
      }
      dimTimeoutRef.current = window.setTimeout(() => {
        dimTimeoutRef.current = null;
        setIsDimmed(true);
      }, 4_000);
    };
    const reveal = () => {
      clearDimTimeout();
      setIsDimmed(false);
      scheduleDim();
    };

    reveal();
    window.addEventListener("pointerdown", reveal);
    window.addEventListener("keydown", reveal);
    window.addEventListener("focusin", reveal);
    return () => {
      clearDimTimeout();
      window.removeEventListener("pointerdown", reveal);
      window.removeEventListener("keydown", reveal);
      window.removeEventListener("focusin", reveal);
    };
  }, [isEmphasized]);

  return (
    <button
      className={`task-launcher${isEmphasized ? " task-launcher--active" : ""}${isBreakFlow ? " task-launcher--break" : ""}${isDimmed ? " task-launcher--dimmed" : ""}${transient ? " task-launcher--transient" : ""}${fading ? " task-launcher--fading" : ""}`}
      type="button"
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
      onPointerDown={(event) => {
        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
        pointerStart.current = { x: event.clientX, y: event.clientY, position };
        moved.current = false;
      }}
      onPointerMove={(event) => {
        const start = pointerStart.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
        if (moved.current) moveBy(start.position.x + dx / window.innerWidth, start.position.y + dy / window.innerHeight);
      }}
      onPointerUp={() => { pointerStart.current = null; }}
      onPointerCancel={() => { pointerStart.current = null; moved.current = true; }}
      onClick={(event) => {
        if (moved.current) {
          event.preventDefault();
          moved.current = false;
          return;
        }
        onClick();
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? .05 : .015;
        if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(position.x - step, position.y); }
        if (event.key === "ArrowRight") { event.preventDefault(); moveBy(position.x + step, position.y); }
        if (event.key === "ArrowUp") { event.preventDefault(); moveBy(position.x, position.y - step); }
        if (event.key === "ArrowDown") { event.preventDefault(); moveBy(position.x, position.y + step); }
      }}
      onFocus={() => setIsDimmed(false)}
      ref={(node) => {
        launcherRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      aria-label={accessibleLabel}
    >
      <span className="task-launcher__main">
        <span className="task-launcher__topline">
          <span className="task-launcher__status" aria-hidden="true">
            <i />
            <span>{status}</span>
          </span>
          <span className="task-launcher__queue" aria-hidden="true">{queueLabel}</span>
        </span>
        <span className="task-launcher__headline">
          <strong>{title}</strong>
          <span className="task-launcher__action" aria-hidden="true">{actionLabel}</span>
        </span>
        <span className="task-launcher__detailRow">
          <span className="task-launcher__detail">{detail}</span>
          <span className="task-launcher__hint" aria-hidden="true">{hintLabel}</span>
        </span>
        <span className="task-launcher__stats" aria-hidden="true">
          <span>{completionLabel}</span>
          <span>集中 {todaySummary.focusedLabel}</span>
          {todaySummary.overdueCount > 0 && <span className="is-alert">期限切れ {todaySummary.overdueCount}件</span>}
        </span>
        <span className="task-launcher__progress" aria-hidden="true">
          <i style={{ width: `${completionRate}%` }} />
        </span>
      </span>
      <span className="task-launcher__side" aria-hidden="true">
        <span className="task-launcher__icon">
          <svg viewBox="0 0 24 24">
            <path d="M9 6h10M9 12h10M9 18h10" />
            <path d="m4 6 1 1 2-2M4 12h3M4 18h3" />
          </svg>
        </span>
        <b className="task-launcher__count">{todayCount}</b>
      </span>
    </button>
  );
});
