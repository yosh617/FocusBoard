import { useEffect, useRef, useState } from "react";
import { AppCalendar } from "./AppCalendar";

function parseValue(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || dateLabel(match[1]) === "日付を選択") return { date: "", hour: "09", minute: "00" };
  return { date: match[1], hour: normalizeTime(match[2], 23), minute: normalizeTime(match[3], 59) };
}

function dateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "日付を選択";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
    : "日付を選択";
}

function normalizeTime(value: string, maximum: number) {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? String(Math.min(maximum, Math.max(0, numeric))).padStart(2, "0") : "00";
}

function normalizedTimeValue(hour: string, minute: string) {
  return `${normalizeTime(hour, 23)}:${normalizeTime(minute, 59)}`;
}

export type AppDateTimeFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  today: string;
  disabled?: boolean;
};

export function AppDateTimeField({ id, label, value, onChange, today, disabled = false }: AppDateTimeFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const parsed = parseValue(value);
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const calendarId = `${id}-calendar`;

  useEffect(() => {
    const next = parseValue(value);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

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

  const commitTime = (nextHour = hour, nextMinute = minute) => {
    const [normalizedHour, normalizedMinute] = normalizedTimeValue(nextHour, nextMinute).split(":");
    setHour(normalizedHour);
    setMinute(normalizedMinute);
    if (parsed.date) onChange(`${parsed.date}T${normalizedHour}:${normalizedMinute}`);
  };

  const updateRawTime = (kind: "hour" | "minute", rawValue: string) => {
    const nextHour = kind === "hour" ? rawValue : hour;
    const nextMinute = kind === "minute" ? rawValue : minute;
    if (kind === "hour") setHour(rawValue);
    else setMinute(rawValue);
    const maximum = kind === "hour" ? 23 : 59;
    const numeric = Number.parseInt(rawValue, 10);
    if (parsed.date && rawValue.length === 2 && Number.isFinite(numeric) && numeric <= maximum) {
      const nextNormalizedHour = kind === "hour" ? rawValue : normalizeTime(nextHour, 23);
      const nextNormalizedMinute = kind === "minute" ? rawValue : normalizeTime(nextMinute, 59);
      onChange(`${parsed.date}T${nextNormalizedHour}:${nextNormalizedMinute}`);
    }
  };

  const handleDateSelect = (nextDate: string) => {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${normalizedTimeValue(hour, minute)}`);
  };

  return (
    <div className="app-ui-field app-date-time-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <div className="app-date-time-field__controls">
        <div className="app-date-time-field__date">
          <button ref={triggerRef} id={id} type="button" className="app-date-field__trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={calendarId} disabled={disabled} onClick={() => setOpen((isOpen) => !isOpen)}>
            <span>{dateLabel(parsed.date)}</span>
            <svg className="app-date-field__icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
          </button>
          {open && <AppCalendar id={calendarId} title={`${label}の日付を選択`} value={parsed.date} today={today} onSelect={handleDateSelect} onClose={closeCalendar} />}
        </div>
        <div className="app-date-time-field__time" aria-label={`${label}の時刻`}>
          <label htmlFor={`${id}-hour`}>時</label>
          <input id={`${id}-hour`} aria-label={`${label}の時`} type="text" inputMode="numeric" maxLength={2} value={hour} disabled={disabled} onChange={(event) => updateRawTime("hour", event.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={() => commitTime()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTime(); } }} />
          <span aria-hidden="true">:</span>
          <label htmlFor={`${id}-minute`}>分</label>
          <input id={`${id}-minute`} aria-label={`${label}の分`} type="text" inputMode="numeric" maxLength={2} value={minute} disabled={disabled} onChange={(event) => updateRawTime("minute", event.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={() => commitTime()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTime(); } }} />
        </div>
      </div>
    </div>
  );
}
