import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  taskTitle: string;
  focusedDurationLabel: string | null;
  nextModeLabel: string;
  remainingTodayCount: number;
  nextTaskTitle: string | null;
  nextTaskDetail: string | null;
  onStartBreak: () => void;
  onStartNextTask: () => void;
  onContinueTask: () => void;
  onCompleteTask: () => void;
  onOpenTaskList: () => void;
  onClose: () => void;
};

export function SessionCompleteDialog({
  open,
  taskTitle,
  focusedDurationLabel,
  nextModeLabel,
  remainingTodayCount,
  nextTaskTitle,
  nextTaskDetail,
  onStartBreak,
  onStartNextTask,
  onContinueTask,
  onCompleteTask,
  onOpenTaskList,
  onClose
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")]
        .filter((button) => !button.closest("details:not([open])"));
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="session-complete-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="session-complete" role="dialog" aria-modal="true" aria-labelledby="session-complete-title" ref={dialogRef}>
        <div className="session-complete__result">
          <span className="session-complete__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m7.5 12 3 3 6-6" /></svg></span>
          <div><h2 id="session-complete-title">集中セッション完了</h2><p>{taskTitle}</p></div>
        </div>
        <div className="session-complete__summary" aria-label="完了した集中の概要">
          <div>
            <span>記録した集中</span>
            <strong>{focusedDurationLabel ?? "00:00"}</strong>
          </div>
          <div>
            <span>次のおすすめ</span>
            <strong>{nextModeLabel}</strong>
          </div>
          <div>
            <span>今日の未完了</span>
            <strong>{remainingTodayCount}件</strong>
          </div>
        </div>
        <section className="session-complete__plan" aria-label="次の操作">
          <div className="session-complete__plan-actions">
            <button className="primary-button session-complete__choice" type="button" onClick={onStartBreak} ref={primaryRef} aria-label="休憩を開始">
              <strong>休憩を開始</strong>
              <span>{nextModeLabel}</span>
            </button>
            {nextTaskTitle && (
              <button className="secondary-button session-complete__next-action" type="button" onClick={onStartNextTask} aria-label={`${nextTaskTitle}を開始`}>
                <strong>次のタスクへ</strong>
                <span>{nextTaskTitle}{nextTaskDetail ? ` · ${nextTaskDetail}` : ""}</span>
              </button>
            )}
          </div>
        </section>
        <details className="session-complete__more">
          <summary>ほかの操作</summary>
          <div className="session-complete__actions">
            <button className="secondary-button" type="button" onClick={onContinueTask}>同じタスクを続ける</button>
            <button className="secondary-button" type="button" onClick={onCompleteTask}>タスクを完了</button>
            <button className="secondary-button" type="button" onClick={onOpenTaskList} aria-label="タスク一覧を開く">一覧で次を選ぶ</button>
          </div>
        </details>
        <button className="text-button session-complete__close" type="button" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
