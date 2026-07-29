import type { AppSettings } from "../types/settings";
import { formatDate } from "../utils/time";

export function DateDisplay({ now, fontSize, format }: { now: Date; fontSize: number; format: AppSettings["dateFormat"] }) {
  return (
    <time className="date" dateTime={formatDate(now, "yyyy-mm-dd")} style={{ fontSize: `${fontSize}px` }}>
      {formatDate(now, format)}
    </time>
  );
}
