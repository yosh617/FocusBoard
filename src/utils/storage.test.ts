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
    const result = migrateSettings({ ...defaultSettings, clockFontSize: 999, overlayOpacity: -1, timerBackgroundOpacity: .1, clockColor: "red", timerColor: "blue", colorPreset: "neon" });
    expect(result.clockFontSize).toBe(220);
    expect(result.overlayOpacity).toBe(0);
    expect(result.clockColor).toBe(defaultSettings.clockColor);
    expect(result.timerColor).toBe(defaultSettings.timerColor);
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

  it("validates per-image framing settings", () => {
    const result = migrateSettings({
      ...defaultSettings,
      backgroundFrames: {
        bg2: { scale: 999, position: { x: -1, y: 2 } },
        slideshow: { scale: 150, position: { x: .5, y: .5 } },
        unknown: { scale: 150, position: { x: .5, y: .5 } }
      }
    });
    expect(result.backgroundFrames.bg2).toEqual({ scale: 220, position: { x: 0, y: 1 } });
    expect(result.backgroundFrames.slideshow).toBeUndefined();
    expect(result.backgroundFrames.unknown).toBeUndefined();
  });

  it("falls back to the default date format when a saved format is invalid", () => {
    const result = migrateSettings({ ...defaultSettings, dateFormat: "<script>" });
    expect(result.dateFormat).toBe(defaultSettings.dateFormat);
  });

  it("migrates the previous dark default to the pastel theme", () => {
    const legacy = { ...defaultSettings, textColor: "#f8fafc", overlayOpacity: 0.42 } as Record<string, unknown>;
    delete legacy.backgroundChoice;
    const result = migrateSettings(legacy);
    expect(result.clockColor).toBe(defaultSettings.clockColor);
    expect(result.overlayOpacity).toBe(defaultSettings.overlayOpacity);
    expect(result.backgroundChoice).toBe("slideshow");
  });

  it("migrates legacy text and accent colors into separate colors", () => {
    const legacy = { ...defaultSettings, textColor: "#112233", accentColor: "#aabbcc" } as Record<string, unknown>;
    Reflect.deleteProperty(legacy, "clockColor");
    Reflect.deleteProperty(legacy, "timerColor");
    const result = migrateSettings(legacy);
    expect(result.clockColor).toBe("#112233");
    expect(result.timerColor).toBe("#aabbcc");
  });

  it("migrates the old shared color and clock position into each known background", () => {
    const legacy = {
      version: 1,
      uiRevision: 3,
      textColor: "#112233",
      clockDatePosition: { x: .2, y: .8 },
      timerPosition: "top-right"
    };
    const result = migrateSettings(legacy);
    expect(result.version).toBe(2);
    expect(result.clockColor).toBe("#112233");
    expect(result.timerColor).toBe("#112233");
    expect(result.matchBackgroundColors).toBe(false);
    expect(result.clockBackgroundSettings.bg1).toEqual({ position: { x: .2, y: .8 }, color: "#112233" });
    expect(result.clockBackgroundSettings.bg3).toEqual({ position: { x: .2, y: .8 }, color: "#112233" });
    expect(result.timerPosition).toBe("top-right");
  });

  it("preserves the shared auto-color switch while migrating", () => {
    const result = migrateSettings({ version: 1, uiRevision: 3, matchBackgroundColors: true, textColor: "#445566" });
    expect(result.matchBackgroundColors).toBe(true);
    expect(result.matchClockBackgroundColors).toBe(true);
    expect(result.matchTimerBackgroundColors).toBe(true);
    expect(result.clockBackgroundSettings.bg2.color).toBe("#445566");
    expect(result.timerColor).toBe("#445566");
  });

  it("preserves independent auto-color switches in the new format", () => {
    const result = migrateSettings({ ...defaultSettings, matchClockBackgroundColors: true, matchTimerBackgroundColors: false, matchBackgroundColors: true });
    expect(result.matchClockBackgroundColors).toBe(true);
    expect(result.matchTimerBackgroundColors).toBe(false);
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
});
