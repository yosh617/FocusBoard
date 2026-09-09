import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  taskTitle: string;
  overtimeLabel: string;
  onContinue: () => void;
  onStartBreak: () => void;
};

export function TimerOvertimeDialog({ open, taskTitle, overtimeLabel, onContinue, onStartBreak }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const breakRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    breakRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onContinue();
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
  }, [onContinue, open]);

  if (!open) return null;
  return (
    <div className="timer-overtime-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onContinue(); }}>
      <div className="timer-overtime" role="dialog" aria-modal="true" aria-labelledby="timer-overtime-title" ref={dialogRef}>
        <div className="timer-overtime__heading">
          <span className="timer-overtime__mark" aria-hidden="true">＋</span>
          <div>
            <p className="timer-overtime__eyebrow">集中時間が終了</p>
            <h2 id="timer-overtime-title">このまま延長しますか？</h2>
            <p>{taskTitle} ・ 延長 {overtimeLabel}</p>
          </div>
        </div>
        <div className="timer-overtime__actions" aria-label="延長後の操作">
          <button className="primary-button" type="button" onClick={onStartBreak} ref={breakRef} aria-label="休憩に入る">
            <strong>休憩に入る</strong>
            <span>次の休憩を開始</span>
          </button>
          <button className="secondary-button" type="button" onClick={onContinue} aria-label="延長を続ける">
            <strong>延長を続ける</strong>
            <span>集中をそのまま続ける</span>
          </button>
        </div>
      </div>
    </div>
  );
}
