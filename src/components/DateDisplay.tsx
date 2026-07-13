import { formatDate } from "../utils/time";

export function DateDisplay({ now, fontSize }: { now: Date; fontSize: number }) {
  return (
    <time className="date" dateTime={now.toISOString().slice(0, 10)} style={{ fontSize: `${fontSize}px` }}>
      {formatDate(now)}
    </time>
  );
}
