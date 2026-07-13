import type { AppSettings } from "../types/settings";
import type { TimerMode } from "../types/timer";

export function formatClock(date: Date, settings: Pick<AppSettings, "showSeconds" | "use12Hour">) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: settings.showSeconds ? "2-digit" : undefined,
    hourCycle: settings.use12Hour ? "h12" : "h23"
  });

  return formatter
    .formatToParts(date)
    .filter(({ type }) => type !== "dayPeriod")
    .map(({ value }) => value)
    .join("")
    .trim();
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

export function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function getDurationMs(mode: TimerMode, settings: AppSettings) {
  const minutes = mode === "work"
    ? settings.workMinutes
    : mode === "shortBreak" ? settings.shortBreakMinutes : settings.longBreakMinutes;
  return minutes * 60_000;
}

export const modeLabels: Record<TimerMode, string> = {
  work: "集中",
  shortBreak: "短い休憩",
  longBreak: "長い休憩"
};
