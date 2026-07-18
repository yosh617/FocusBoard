import { forwardRef } from "react";

type Props = {
  todayCount: number;
  onClick: () => void;
};

export const TaskLauncher = forwardRef<HTMLButtonElement, Props>(function TaskLauncher({ todayCount, onClick }, ref) {
  return (
    <button className="task-launcher" type="button" onClick={onClick} ref={ref} aria-label={`タスクを開く。今日${todayCount}件`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6h10M9 12h10M9 18h10" />
        <path d="m4 6 1 1 2-2M4 12h3M4 18h3" />
      </svg>
      <span>今日</span>
      <strong>{todayCount}</strong>
    </button>
  );
});
