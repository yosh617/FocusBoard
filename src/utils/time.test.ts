import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, getDurationMs } from "./time";
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

  it("omits the day period in 12-hour clock mode", () => {
    const value = formatClock(new Date(2026, 6, 13, 14, 5, 6), { showSeconds: false, use12Hour: true });
    expect(value).not.toMatch(/午前|午後|AM|PM/i);
    expect(value).toMatch(/02:05|2:05/);
  });
});
