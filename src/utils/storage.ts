import { defaultSettings, fontOptions, positionPresets, type AppSettings, type PositionPreset } from "../types/settings";
import type { TimerMode, TimerState, TimerStatus } from "../types/timer";

export const SETTINGS_KEY = "study-clock:settings";
export const TIMER_KEY = "study-clock:timer";
export const APP_STORAGE_KEYS = [SETTINGS_KEY, TIMER_KEY] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const booleanValue = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const numberValue = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const isPosition = (value: unknown): value is PositionPreset =>
  typeof value === "string" && (positionPresets as readonly string[]).includes(value);

export function migrateSettings(value: unknown): AppSettings {
  if (!isRecord(value) || value.version !== 1) return { ...defaultSettings };

  return {
    version: 1,
    showClock: booleanValue(value.showClock, defaultSettings.showClock),
    showDate: booleanValue(value.showDate, defaultSettings.showDate),
    showTimer: booleanValue(value.showTimer, defaultSettings.showTimer),
    showSeconds: booleanValue(value.showSeconds, defaultSettings.showSeconds),
    use12Hour: booleanValue(value.use12Hour, defaultSettings.use12Hour),
    clockFontSize: numberValue(value.clockFontSize, defaultSettings.clockFontSize, 56, 220),
    dateFontSize: numberValue(value.dateFontSize, defaultSettings.dateFontSize, 16, 64),
    timerFontSize: numberValue(value.timerFontSize, defaultSettings.timerFontSize, 36, 120),
    fontFamily: typeof value.fontFamily === "string" && value.fontFamily in fontOptions
      ? value.fontFamily
      : defaultSettings.fontFamily,
    textColor: /^#[0-9a-f]{6}$/i.test(String(value.textColor)) ? String(value.textColor) : defaultSettings.textColor,
    overlayOpacity: numberValue(value.overlayOpacity, defaultSettings.overlayOpacity, 0, 0.85),
    slideshowIntervalSec: numberValue(value.slideshowIntervalSec, defaultSettings.slideshowIntervalSec, 10, 600),
    clockPosition: isPosition(value.clockPosition) ? value.clockPosition : defaultSettings.clockPosition,
    datePosition: isPosition(value.datePosition) ? value.datePosition : defaultSettings.datePosition,
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

export function createInitialTimerState(workMinutes: number): TimerState {
  return {
    version: 1,
    mode: "work",
    status: "idle",
    remainingMs: workMinutes * 60_000,
    endAt: null,
    completedWorkSessions: 0
  };
}

export function loadTimerState(workMinutes: number): TimerState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TIMER_KEY) ?? "null");
    if (!isRecord(parsed) || parsed.version !== 1) return createInitialTimerState(workMinutes);
    if (!timerModes.includes(parsed.mode as TimerMode) || !timerStatuses.includes(parsed.status as TimerStatus)) {
      return createInitialTimerState(workMinutes);
    }
    const remainingMs = numberValue(parsed.remainingMs, workMinutes * 60_000, 0, 24 * 60 * 60_000);
    const endAt = typeof parsed.endAt === "number" && Number.isFinite(parsed.endAt) ? parsed.endAt : null;
    const status = parsed.status as TimerStatus;
    return {
      version: 1,
      mode: parsed.mode as TimerMode,
      status: status === "running" && endAt === null ? "paused" : status,
      remainingMs,
      endAt,
      completedWorkSessions: Math.floor(numberValue(parsed.completedWorkSessions, 0, 0, 9999))
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
  if (!("indexedDB" in window) || !("databases" in indexedDB)) return;
  const databases = await indexedDB.databases();
  await Promise.all(databases
    .filter(({ name }) => name?.startsWith("study-clock"))
    .map(({ name }) => new Promise<void>((resolve) => {
      if (!name) return resolve();
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    })));
}
