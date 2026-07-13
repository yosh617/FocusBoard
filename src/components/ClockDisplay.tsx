import type { AppSettings } from "../types/settings";
import { formatClock } from "../utils/time";

export function ClockDisplay({ now, settings }: { now: Date; settings: AppSettings }) {
  return (
    <time className="clock" dateTime={now.toISOString()} style={{ fontSize: `${settings.clockFontSize}px` }}>
      {formatClock(now, settings)}
    </time>
  );
}
