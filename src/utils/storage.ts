import { backgroundChoices, colorPresets, defaultSettings, fontOptions, positionPresets, type AppSettings, type BackgroundChoice, type ColorPreset, type PositionPreset } from "../types/settings";
import type { SessionCategory, TimerMode, TimerProgram, TimerState, TimerStatus } from "../types/timer";
import { BACKGROUND_DB_NAME } from "./backgroundStorage";

export const SETTINGS_KEY = "focusboard:settings";
export const TIMER_KEY = "focusboard:timer";
export const APP_STORAGE_KEYS = [SETTINGS_KEY, TIMER_KEY] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const booleanValue = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const numberValue = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const isPosition = (value: unknown): value is PositionPreset =>
  typeof value === "string" && (positionPresets as readonly string[]).includes(value);
const isBackgroundChoice = (value: unknown): value is BackgroundChoice =>
  typeof value === "string" && (
    (backgroundChoices as readonly string[]).includes(value) || /^custom:[a-zA-Z0-9_-]+$/.test(value)
  );
const isColorPreset = (value: unknown): value is ColorPreset =>
  value === "custom" || typeof value === "string" && value in colorPresets;

export function migrateSettings(value: unknown): AppSettings {
  if (!isRecord(value) || value.version !== 1) return { ...defaultSettings };
  const isLegacyTheme = !("backgroundChoice" in value);
  const isLegacyLayout = value.uiRevision !== 2;

  return {
    version: 1,
    uiRevision: 2,
    showClock: booleanValue(value.showClock, defaultSettings.showClock),
    showDate: booleanValue(value.showDate, defaultSettings.showDate),
    showTimer: booleanValue(value.showTimer, defaultSettings.showTimer),
    timerSetupCollapsed: booleanValue(value.timerSetupCollapsed, defaultSettings.timerSetupCollapsed),
    showSeconds: booleanValue(value.showSeconds, defaultSettings.showSeconds),
    use12Hour: booleanValue(value.use12Hour, defaultSettings.use12Hour),
    clockFontSize: isLegacyLayout ? defaultSettings.clockFontSize : numberValue(value.clockFontSize, defaultSettings.clockFontSize, 56, 220),
    dateFontSize: isLegacyLayout ? defaultSettings.dateFontSize : numberValue(value.dateFontSize, defaultSettings.dateFontSize, 16, 64),
    timerFontSize: isLegacyLayout ? defaultSettings.timerFontSize : numberValue(value.timerFontSize, defaultSettings.timerFontSize, 36, 120),
    timerBackgroundOpacity: numberValue(value.timerBackgroundOpacity, defaultSettings.timerBackgroundOpacity, .6, 1),
    fontFamily: typeof value.fontFamily === "string" && value.fontFamily in fontOptions
      ? value.fontFamily
      : defaultSettings.fontFamily,
    colorPreset: isColorPreset(value.colorPreset) ? value.colorPreset : defaultSettings.colorPreset,
    textColor: isLegacyTheme && String(value.textColor).toLowerCase() === "#f8fafc"
      ? defaultSettings.textColor
      : /^#[0-9a-f]{6}$/i.test(String(value.textColor)) ? String(value.textColor) : defaultSettings.textColor,
    accentColor: /^#[0-9a-f]{6}$/i.test(String(value.accentColor)) ? String(value.accentColor) : defaultSettings.accentColor,
    matchBackgroundColors: booleanValue(value.matchBackgroundColors, defaultSettings.matchBackgroundColors),
    overlayOpacity: isLegacyTheme && value.overlayOpacity === 0.42
      ? defaultSettings.overlayOpacity
      : numberValue(value.overlayOpacity, defaultSettings.overlayOpacity, 0, 0.85),
    slideshowIntervalSec: numberValue(value.slideshowIntervalSec, defaultSettings.slideshowIntervalSec, 10, 600),
    backgroundChoice: isBackgroundChoice(value.backgroundChoice) ? value.backgroundChoice : defaultSettings.backgroundChoice,
    clockPosition: isLegacyLayout ? defaultSettings.clockPosition : isPosition(value.clockPosition) ? value.clockPosition : defaultSettings.clockPosition,
    datePosition: isLegacyLayout ? defaultSettings.datePosition : isPosition(value.datePosition) ? value.datePosition : defaultSettings.datePosition,
    timerPosition: isPosition(value.timerPosition) ? value.timerPosition : defaultSettings.timerPosition,
    workMinutes: numberValue(value.workMinutes, defaultSettings.workMinutes, 1, 180),
    shortBreakMinutes: numberValue(value.shortBreakMinutes, defaultSettings.shortBreakMinutes, 1, 60),
    longBreakMinutes: numberValue(value.longBreakMinutes, defaultSettings.longBreakMinutes, 1, 120),
    soundEnabled: booleanValue(value.soundEnabled, defaultSettings.soundEnabled)
  };
}

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? migrateSettings(JSON.parse(stored)) : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

const timerModes: TimerMode[] = ["work", "shortBreak", "longBreak"];
const timerStatuses: TimerStatus[] = ["idle", "running", "paused", "completed"];
const timerPrograms: TimerProgram[] = ["pomodoro", "countdown", "countup"];
const sessionCategories: SessionCategory[] = ["focus", "break"];

export function createInitialTimerState(workMinutes: number): TimerState {
  const durationMs = workMinutes * 60_000;
  return {
    version: 2,
    program: "pomodoro",
    mode: "work",
    category: "focus",
    status: "idle",
    durationMs,
    customDurationMs: 30 * 60_000,
    remainingMs: durationMs,
    endAt: null,
    completedWorkSessions: 0,
    floatingPosition: { x: 0.18, y: 0.38 }
  };
}

export function loadTimerState(workMinutes: number): TimerState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TIMER_KEY) ?? "null");
    if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== 2)) return createInitialTimerState(workMinutes);
    if (!timerModes.includes(parsed.mode as TimerMode) || !timerStatuses.includes(parsed.status as TimerStatus)) {
      return createInitialTimerState(workMinutes);
    }
    const remainingMs = numberValue(parsed.remainingMs, workMinutes * 60_000, 0, 24 * 60 * 60_000);
    const endAt = typeof parsed.endAt === "number" && Number.isFinite(parsed.endAt) ? parsed.endAt : null;
    const status = parsed.status as TimerStatus;
    if (parsed.version === 1) {
      const mode = parsed.mode as TimerMode;
      return {
        ...createInitialTimerState(workMinutes),
        program: "pomodoro",
        mode,
        category: mode === "work" ? "focus" : "break",
        status: status === "running" && endAt === null ? "paused" : status,
        durationMs: Math.max(remainingMs, workMinutes * 60_000),
        remainingMs,
        endAt,
        completedWorkSessions: Math.floor(numberValue(parsed.completedWorkSessions, 0, 0, 9999))
      };
    }

    const program = timerPrograms.includes(parsed.program as TimerProgram) ? parsed.program as TimerProgram : "pomodoro";
    const category = sessionCategories.includes(parsed.category as SessionCategory) ? parsed.category as SessionCategory : "focus";
    const position = isRecord(parsed.floatingPosition) ? parsed.floatingPosition : {};
    const usesOldDefaultPosition = position.x === 0.84 && position.y === 0.22;
    return {
      version: 2,
      program,
      mode: parsed.mode as TimerMode,
      category,
      status: status === "running" && endAt === null ? "paused" : status,
      durationMs: numberValue(parsed.durationMs, workMinutes * 60_000, 60_000, 24 * 60 * 60_000),
      customDurationMs: numberValue(parsed.customDurationMs, 30 * 60_000, 60_000, 24 * 60 * 60_000),
      remainingMs,
      endAt,
      completedWorkSessions: Math.floor(numberValue(parsed.completedWorkSessions, 0, 0, 9999)),
      floatingPosition: {
        x: usesOldDefaultPosition ? 0.18 : numberValue(position.x, 0.18, 0.06, 0.94),
        y: usesOldDefaultPosition ? 0.38 : numberValue(position.y, 0.38, 0.08, 0.92)
      }
    };
  } catch {
    return createInitialTimerState(workMinutes);
  }
}

export function saveTimerState(state: TimerState): boolean {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function removeTimerState() {
  try { localStorage.removeItem(TIMER_KEY); } catch { /* Storage can be unavailable. */ }
}

export function clearAppLocalData() {
  for (const key of APP_STORAGE_KEYS) {
    try { localStorage.removeItem(key); } catch { /* Continue deleting remaining keys. */ }
  }
}

export async function clearAppIndexedDb() {
  if (!("indexedDB" in window)) return;
  const names = new Set<string>([BACKGROUND_DB_NAME]);
  if ("databases" in indexedDB) {
    const databases = await indexedDB.databases();
    for (const { name } of databases) if (name?.startsWith("focusboard")) names.add(name);
  }
  await Promise.all([...names].map((name) => new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    })));
}
