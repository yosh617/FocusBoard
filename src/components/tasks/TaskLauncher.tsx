import { forwardRef, useEffect, useRef, useState } from "react";

type Props = {
  todayCount: number;
  activeTaskTitle: string | null;
  suggestedTask: {
    title: string;
    detail: string;
  } | null;
  timerSummary: {
    statusText: string;
    title: string;
    detail: string;
  } | null;
  onClick: () => void;
};

export const TaskLauncher = forwardRef<HTMLButtonElement, Props>(function TaskLauncher({ todayCount, activeTaskTitle, suggestedTask, timerSummary, onClick }, ref) {
  const title = timerSummary?.title ?? activeTaskTitle ?? suggestedTask?.title ?? "今日のタスク";
  const detail = timerSummary?.detail
    ?? (activeTaskTitle
      ? `今日の未完了 ${todayCount}件`
      : suggestedTask?.detail
        ?? (todayCount === 0 ? "今日の予定はありません" : `${todayCount}件を整理`));
  const status = timerSummary?.statusText ?? (activeTaskTitle ? "集中中" : suggestedTask ? "次のおすすめ" : "今日のタスク");
  const isEmphasized = activeTaskTitle !== null || timerSummary !== null;
  const actionLabel = timerSummary !== null || activeTaskTitle
    ? "戻る"
    : suggestedTask
      ? "おすすめ"
      : todayCount === 0
        ? "追加"
        : "整理";
  const accessibleLabel = activeTaskTitle
    ? `タスクを開く。集中中のタスクは${activeTaskTitle}。今日の未完了は${todayCount}件`
    : suggestedTask
      ? `タスクを開く。次のおすすめは${suggestedTask.title}。今日の未完了は${todayCount}件`
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
      className={`task-launcher${isEmphasized ? " task-launcher--active" : ""}${isDimmed ? " task-launcher--dimmed" : ""}`}
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
        <small>{status}</small>
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className="task-launcher__action" aria-hidden="true">{actionLabel}</span>
      <b className="task-launcher__count" aria-hidden="true">{todayCount}</b>
    </button>
  );
});
