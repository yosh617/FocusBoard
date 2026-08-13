import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function parseDateKey(value: string, fallback: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || fallback);
  if (!match) return parseDateKey(fallback, "1970-01-01");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    return parseDateKey(fallback, "1970-01-01");
  }
  return date;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey, "1970-01-01");
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export type AppCalendarProps = {
  value: string;
  today: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  title: string;
  id?: string;
};

export function AppCalendar({ value, today, onSelect, onClose, title, id }: AppCalendarProps) {
  const calendarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const focusDateAfterRenderRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const initialDate = parseDateKey(value, today);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const generatedId = useId();
  const titleId = `${id ?? generatedId}-title`;
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const leadingDays = new Date(year, month, 1).getDay();
  const monthDays = new Date(year, month + 1, 0).getDate();
  const cells = useMemo(() => Array.from({ length: leadingDays + monthDays }, (_, index) => index < leadingDays ? null : index - leadingDays + 1), [leadingDays, monthDays]);
  const initialFocusDate = toDateKey(initialDate);
  const [focusedDate, setFocusedDate] = useState(initialFocusDate);
  const focusedDateObject = parseDateKey(focusedDate, initialFocusDate);
  const focusDateInVisibleMonth = focusedDateObject.getFullYear() === year && focusedDateObject.getMonth() === month
    ? focusedDate
    : value.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`)
      ? value
      : today.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`)
        ? today
        : toDateKey(new Date(year, month, 1));

  useLayoutEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!focusDateAfterRenderRef.current) return;
    focusDateAfterRenderRef.current = false;
    calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus();
  }, [focusedDate, visibleMonth]);

  useEffect(() => () => {
    if (openerRef.current && openerRef.current.isConnected) openerRef.current.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(calendarRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? []).filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    if (!value) return;
    const selectedDate = parseDateKey(value, today);
    setVisibleMonth((current) => current.getFullYear() === selectedDate.getFullYear() && current.getMonth() === selectedDate.getMonth() ? current : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [today, value]);

  const selectDate = (dateKey: string) => {
    onSelect(dateKey);
    onClose();
  };

  const moveDateFocus = (dateKey: string) => {
    const date = parseDateKey(dateKey, focusDateInVisibleMonth);
    focusDateAfterRenderRef.current = true;
    setFocusedDate(dateKey);
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const handleDateKeyDown = (event: KeyboardEvent<HTMLButtonElement>, dateKey: string) => {
    const current = parseDateKey(dateKey, today);
    let next: Date | null = null;
    if (event.key === "ArrowLeft") next = parseDateKey(addDays(dateKey, -1), today);
    if (event.key === "ArrowRight") next = parseDateKey(addDays(dateKey, 1), today);
    if (event.key === "ArrowUp") next = parseDateKey(addDays(dateKey, -7), today);
    if (event.key === "ArrowDown") next = parseDateKey(addDays(dateKey, 7), today);
    if (event.key === "Home") next = parseDateKey(addDays(dateKey, -current.getDay()), today);
    if (event.key === "End") next = parseDateKey(addDays(dateKey, 6 - current.getDay()), today);
    if (event.key === "PageUp" || event.key === "PageDown") {
      const targetMonth = current.getMonth() + (event.key === "PageUp" ? -1 : 1);
      const lastDay = new Date(current.getFullYear(), targetMonth + 1, 0).getDate();
      next = new Date(current.getFullYear(), targetMonth, Math.min(current.getDate(), lastDay));
    }
    if (!next) return;
    event.preventDefault();
    moveDateFocus(toDateKey(next));
  };

  return (
    <section ref={calendarRef} className="app-calendar" id={id} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <div className="app-calendar__header">
        <strong id={titleId}>{title}</strong>
        <button ref={closeButtonRef} type="button" aria-label={`${title}を閉じる`} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg></button>
      </div>
      <div className="app-calendar__shortcuts" aria-label="日付のショートカット">
        <button type="button" className={value === today ? "is-selected" : ""} onClick={() => selectDate(today)}>今日</button>
        <button type="button" className={value === addDays(today, 1) ? "is-selected" : ""} onClick={() => selectDate(addDays(today, 1))}>明日</button>
        <button type="button" className={value === addDays(today, 7) ? "is-selected" : ""} onClick={() => selectDate(addDays(today, 7))}>7日後</button>
        <button type="button" className={value === "" ? "is-selected" : ""} onClick={() => selectDate("")}>なし</button>
      </div>
      <div className="app-calendar__month">
        <strong>{year}年{month + 1}月</strong>
        <span>
          <button type="button" aria-label="前の月" onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg></button>
          <button type="button" aria-label="次の月" onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg></button>
        </span>
      </div>
      <div className="app-calendar__week" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="app-calendar__grid" role="grid" aria-label={`${year}年${month + 1}月`}>
        {cells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} aria-hidden="true" />;
          const dateKey = toDateKey(new Date(year, month, day));
          const selected = value === dateKey;
          const isToday = today === dateKey;
          return <button key={dateKey} data-date={dateKey} type="button" tabIndex={dateKey === focusDateInVisibleMonth ? 0 : -1} aria-pressed={selected} aria-current={isToday ? "date" : undefined} aria-label={`${year}年${month + 1}月${day}日`} className={`${selected ? "is-selected " : ""}${isToday ? "is-today" : ""}`} onFocus={() => setFocusedDate(dateKey)} onKeyDown={(event) => handleDateKeyDown(event, dateKey)} onClick={() => selectDate(dateKey)}>{day}</button>;
        })}
      </div>
    </section>
  );
}
