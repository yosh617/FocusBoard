import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  taskTitle: string;
  onStartBreak: () => void;
  onContinueTask: () => void;
  onCompleteTask: () => void;
  onClose: () => void;
};

export function SessionCompleteDialog({ open, taskTitle, onStartBreak, onContinueTask, onCompleteTask, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
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
    <div className="session-complete-backdrop">
      <div className="session-complete" role="dialog" aria-modal="true" aria-labelledby="session-complete-title" ref={dialogRef}>
        <p className="eyebrow">SESSION COMPLETE</p>
        <h2 id="session-complete-title">集中セッション完了</h2>
        <p><strong>{taskTitle}</strong>の集中時間を記録しました。</p>
        <div className="session-complete__actions">
          <button className="primary-button" type="button" onClick={onStartBreak} ref={primaryRef}>休憩を開始</button>
          <button className="secondary-button" type="button" onClick={onContinueTask}>同じタスクを続ける</button>
          <button className="secondary-button" type="button" onClick={onCompleteTask}>タスクを完了</button>
          <button className="text-button" type="button" onClick={onClose}>未完了のまま閉じる</button>
        </div>
      </div>
    </div>
  );
}
