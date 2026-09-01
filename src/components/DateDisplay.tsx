import type { AppSettings } from "../types/settings";
import { formatCalendarDay, formatCalendarMonth, formatCalendarWeekday, formatDate } from "../utils/time";

export function DateDisplay({ now, fontSize, format, displayStyle = "text" }: { now: Date; fontSize: number; format: AppSettings["dateFormat"]; displayStyle?: AppSettings["dateDisplayStyle"] }) {
  if (displayStyle === "calendar") {
    return (
      <time className="date date--calendar" dateTime={formatDate(now, "yyyy-mm-dd")}>
        <span className="date__month">{formatCalendarMonth(now)}</span>
        <strong className="date__day" style={{ fontSize: `${Math.max(fontSize * 5.5, 84)}px` }}>{formatCalendarDay(now)}</strong>
        <span className="date__weekday">{formatCalendarWeekday(now)}</span>
      </time>
    );
  }
  return (
    <time className="date" dateTime={formatDate(now, "yyyy-mm-dd")} style={{ fontSize: `${fontSize}px` }}>
      {formatDate(now, format)}
    </time>
  );
}
