import { forwardRef, useEffect, useRef, useState } from "react";

type Props = {
  todayCount: number;
  activeTaskTitle: string | null;
  onClick: () => void;
};

export const TaskLauncher = forwardRef<HTMLButtonElement, Props>(function TaskLauncher({ todayCount, activeTaskTitle, onClick }, ref) {
  const title = activeTaskTitle ?? "今日のタスク";
  const detail = activeTaskTitle ? `今日の未完了 ${todayCount}件` : todayCount === 0 ? "今日の予定はありません" : `${todayCount}件を整理`;
  const accessibleLabel = activeTaskTitle
    ? `タスクを開く。集中中のタスクは${activeTaskTitle}。今日の未完了は${todayCount}件`
    : `タスクを開く。今日の未完了は${todayCount}件`;
  const [isDimmed, setIsDimmed] = useState(false);
  const dimTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const clearDimTimeout = () => {
      if (dimTimeoutRef.current !== null) {
        window.clearTimeout(dimTimeoutRef.current);
        dimTimeoutRef.current = null;
      }
    };
    const scheduleDim = () => {
      clearDimTimeout();
      if (activeTaskTitle) {
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
  }, [activeTaskTitle]);

  return (
    <button
      className={`task-launcher${activeTaskTitle ? " task-launcher--active" : ""}${isDimmed ? " task-launcher--dimmed" : ""}`}
      type="button"
      onClick={onClick}
      onFocus={() => setIsDimmed(false)}
      ref={ref}
      aria-label={accessibleLabel}
    >
      <span className="task-launcher__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M9 6h10M9 12h10M9 18h10" />
          <path d="m4 6 1 1 2-2M4 12h3M4 18h3" />
        </svg>
      </span>
      <span className="task-launcher__copy">
        <small>{activeTaskTitle ? "集中中" : "今日のタスク"}</small>
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <b className="task-launcher__count" aria-hidden="true">{todayCount}</b>
    </button>
  );
});
