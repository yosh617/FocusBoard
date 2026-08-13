import { useEffect, useRef, useState } from "react";
import { AppCalendar } from "./AppCalendar";

function dateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "日付を選択";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
    : "日付を選択";
}

export type AppDateFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  today: string;
  disabled?: boolean;
};

export function AppDateField({ id, label, value, onChange, today, disabled = false }: AppDateFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const calendarId = `${id}-calendar`;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const closeCalendar = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="app-ui-field app-date-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <button ref={triggerRef} id={id} type="button" className="app-date-field__trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={calendarId} disabled={disabled} onClick={() => setOpen((isOpen) => !isOpen)}>
        <span>{dateLabel(value)}</span>
        <svg className="app-date-field__icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
      </button>
      {open && <AppCalendar id={calendarId} title={`${label}を選択`} value={value} today={today} onSelect={onChange} onClose={closeCalendar} />}
    </div>
  );
}
