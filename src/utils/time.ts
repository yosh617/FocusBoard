import { defaultDateFormat, type AppSettings } from "../types/settings";
import type { TimerMode, TimerState } from "../types/timer";

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

export function formatDate(date: Date, pattern = defaultDateFormat) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const shortWeekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date);
  const tokens: [string, string][] = [
    ["weekdayShort", shortWeekday],
    ["weekday", values.weekday ?? ""],
    ["yyyy", values.year ?? ""],
    ["yy", (values.year ?? "").slice(-2)],
    ["mm", (values.month ?? "").padStart(2, "0")],
    ["m", values.month ?? ""],
    ["dd", (values.day ?? "").padStart(2, "0")],
    ["d", values.day ?? ""]
  ];

  return tokens.reduce((result, [token, value]) => result.replaceAll(token, value), pattern);
}

export function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function getTimerElapsedMs(timer: Pick<TimerState, "program" | "status" | "durationMs" | "remainingMs" | "endAt">, now = Date.now()) {
  if (timer.program === "countup") {
    return timer.status === "running" && timer.endAt !== null
      ? Math.max(0, now - timer.endAt)
      : Math.max(0, timer.remainingMs);
  }
  return Math.max(0, timer.durationMs - timer.remainingMs);
}

export function getCountupLap(elapsedMs: number, durationMs: number) {
  return durationMs > 0 ? Math.floor(Math.max(0, elapsedMs) / durationMs) + 1 : 1;
}

export function getTimerProgress(timer: Pick<TimerState, "program" | "status" | "durationMs" | "remainingMs" | "endAt">, now = Date.now()) {
  if (timer.durationMs <= 0) return 0;
  const elapsedMs = getTimerElapsedMs(timer, now);
  return timer.program === "countup"
    ? (elapsedMs % timer.durationMs) / timer.durationMs
    : Math.min(1, elapsedMs / timer.durationMs);
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
