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

  it("keeps the fullscreen setting backward compatible", () => {
    const legacy = { ...defaultSettings } as Record<string, unknown>;
    Reflect.deleteProperty(legacy, "fullscreen");
    expect(migrateSettings(legacy).fullscreen).toBe(false);
  });

  it("clamps background framing settings", () => {
    const result = migrateSettings({ ...defaultSettings, backgroundScale: 999, backgroundPosition: { x: -1, y: 2 } });
    expect(result.backgroundScale).toBe(220);
    expect(result.backgroundPosition).toEqual({ x: 0, y: 1 });
  });

  it("migrates the previous dark default to the pastel theme", () => {
    const legacy = { ...defaultSettings, textColor: "#f8fafc", overlayOpacity: 0.42 } as Record<string, unknown>;
    delete legacy.backgroundChoice;
    const result = migrateSettings(legacy);
    expect(result.textColor).toBe(defaultSettings.textColor);
    expect(result.overlayOpacity).toBe(defaultSettings.overlayOpacity);
    expect(result.backgroundChoice).toBe("slideshow");
  });

  it("migrates legacy layouts and validates free clock positions", () => {
    const legacy = migrateSettings({ ...defaultSettings, uiRevision: 2 });
    expect(legacy.clockDatePosition).toEqual(defaultSettings.clockDatePosition);

    const current = migrateSettings({
      ...defaultSettings,
      clockDatePosition: { x: 4, y: -2 },
      clockDateAlignment: "outside"
    });
    expect(current.clockDatePosition).toEqual({ x: .94, y: .08 });
    expect(current.clockDateAlignment).toBe(defaultSettings.clockDateAlignment);
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

  it("migrates version 2 timers to task-aware version 3 without losing elapsed state", () => {
    localStorage.setItem(TIMER_KEY, JSON.stringify({
      version: 2,
      program: "countdown",
      mode: "work",
      category: "focus",
      status: "paused",
      durationMs: 600_000,
      customDurationMs: 600_000,
      remainingMs: 420_000,
      endAt: null,
      completedWorkSessions: 2,
      floatingPosition: { x: .3, y: .4 }
    }));
    expect(loadTimerState(25)).toMatchObject({
      version: 3,
      program: "countdown",
      remainingMs: 420_000,
      completedWorkSessions: 2,
      activeTaskId: null,
      activeSessionId: null,
      sessionStartedAt: null
    });
  });

  it("keeps a valid active task session and drops incomplete session metadata", () => {
    const base = {
      version: 3,
      program: "pomodoro",
      mode: "work",
      category: "focus",
      status: "paused",
      durationMs: 1_500_000,
      customDurationMs: 1_800_000,
      remainingMs: 1_200_000,
      endAt: null,
      completedWorkSessions: 0,
      floatingPosition: { x: .3, y: .4 },
      activeTaskId: "task-1",
      activeSessionId: "session-1",
      sessionStartedAt: 100
    };
    localStorage.setItem(TIMER_KEY, JSON.stringify(base));
    expect(loadTimerState(25)).toMatchObject({ activeTaskId: "task-1", activeSessionId: "session-1", sessionStartedAt: 100 });
    localStorage.setItem(TIMER_KEY, JSON.stringify({ ...base, sessionStartedAt: null }));
    expect(loadTimerState(25)).toMatchObject({ activeTaskId: "task-1", activeSessionId: null, sessionStartedAt: null });
  });
});
