import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../types/settings";
import { SETTINGS_KEY, TIMER_KEY, clearAppLocalData, loadSettings, loadTimerState, migrateSettings } from "./storage";

describe("settings storage", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when JSON is broken", () => {
    localStorage.setItem(SETTINGS_KEY, "{");
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it("validates and clamps persisted fields", () => {
    const result = migrateSettings({ ...defaultSettings, clockFontSize: 999, overlayOpacity: -1, timerBackgroundOpacity: .1, textColor: "red", accentColor: "blue", colorPreset: "neon" });
    expect(result.clockFontSize).toBe(220);
    expect(result.overlayOpacity).toBe(0);
    expect(result.textColor).toBe(defaultSettings.textColor);
    expect(result.accentColor).toBe(defaultSettings.accentColor);
    expect(result.colorPreset).toBe(defaultSettings.colorPreset);
    expect(result.timerBackgroundOpacity).toBe(.6);
  });

  it("migrates the previous dark default to the pastel theme", () => {
    const legacy = { ...defaultSettings, textColor: "#f8fafc", overlayOpacity: 0.42 } as Record<string, unknown>;
    delete legacy.backgroundChoice;
    const result = migrateSettings(legacy);
    expect(result.textColor).toBe(defaultSettings.textColor);
    expect(result.overlayOpacity).toBe(defaultSettings.overlayOpacity);
    expect(result.backgroundChoice).toBe("slideshow");
  });

  it("falls back when localStorage access fails", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadSettings()).toEqual(defaultSettings);
    spy.mockRestore();
  });

  it("removes only application keys", () => {
    localStorage.setItem(SETTINGS_KEY, "settings");
    localStorage.setItem(TIMER_KEY, "timer");
    localStorage.setItem("another-app", "keep");
    clearAppLocalData();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(localStorage.getItem(TIMER_KEY)).toBeNull();
    expect(localStorage.getItem("another-app")).toBe("keep");
  });
});

describe("timer storage", () => {
  beforeEach(() => localStorage.clear());

  it("repairs running state without an end time", () => {
    localStorage.setItem(TIMER_KEY, JSON.stringify({
      version: 1, mode: "work", status: "running", remainingMs: 5_000, endAt: null, completedWorkSessions: 0
    }));
    expect(loadTimerState(25).status).toBe("paused");
  });
});
