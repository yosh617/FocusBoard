import { formatDate } from "../utils/time";

export function DateDisplay({ now, fontSize, format }: { now: Date; fontSize: number; format?: string }) {
  return (
    <time className="date" dateTime={now.toISOString().slice(0, 10)} style={{ fontSize: `${fontSize}px` }}>
      {formatDate(now, format)}
    </time>
  );
}
