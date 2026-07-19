import { describe, expect, it } from "vitest";
import { formatClock, formatDate, formatDuration, getCountupLap, getDurationMs, getTimerProgress } from "./time";
import { defaultSettings } from "../types/settings";

describe("time helpers", () => {
  it("rounds remaining milliseconds up to avoid early visual completion", () => {
    expect(formatDuration(60_001)).toBe("01:01");
    expect(formatDuration(0)).toBe("00:00");
  });

  it("selects each configured mode duration", () => {
    expect(getDurationMs("work", defaultSettings)).toBe(25 * 60_000);
    expect(getDurationMs("shortBreak", defaultSettings)).toBe(5 * 60_000);
    expect(getDurationMs("longBreak", defaultSettings)).toBe(15 * 60_000);
  });

  it("wraps count-up progress into a new lap without stopping", () => {
    const timer = { program: "countup" as const, status: "paused" as const, durationMs: 60_000, remainingMs: 75_000, endAt: null };
    expect(getCountupLap(timer.remainingMs, timer.durationMs)).toBe(2);
    expect(getTimerProgress(timer)).toBe(.25);
  });

  it("omits the day period in 12-hour clock mode", () => {
    const value = formatClock(new Date(2026, 6, 13, 14, 5, 6), { showSeconds: false, use12Hour: true });
    expect(value).not.toMatch(/午前|午後|AM|PM/i);
    expect(value).toMatch(/02:05|2:05/);
  });

  it("formats dates with preset-style tokens", () => {
    const date = new Date(2026, 6, 18);
    expect(formatDate(date, "yyyy/mm/dd weekday")).toBe("2026/07/18 土曜日");
    expect(formatDate(date, "mm/dd weekdayShort")).toBe("07/18 土");
  });
});
