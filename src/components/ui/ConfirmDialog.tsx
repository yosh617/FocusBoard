import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
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
  }, [onCancel, open]);

  if (!open) return null;
  return (
    <div className="confirm-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="confirm-dialog__heading">
          <span className="confirm-dialog__icon" aria-hidden="true">!</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <p>{description}</p>
        <div className="confirm-dialog__actions">
          <button className="secondary-button" type="button" onClick={onCancel} ref={cancelRef}>キャンセル</button>
          <button className="danger-button" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
