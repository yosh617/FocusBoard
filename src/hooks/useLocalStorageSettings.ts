import { useCallback, useEffect, useRef, useState } from "react";
import { defaultSettings, type AppSettings } from "../types/settings";
import { loadSettings, saveSettings } from "../utils/storage";

type SettingsUpdate = Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>);

function normalizePatch(patch: Partial<AppSettings>): Partial<AppSettings> {
  const normalized = { ...patch };

  if (normalized.textColor && normalized.clockColor === undefined) normalized.clockColor = normalized.textColor;
  if (normalized.clockColor && normalized.textColor === undefined) normalized.textColor = normalized.clockColor;
  if (normalized.accentColor && normalized.timerColor === undefined) normalized.timerColor = normalized.accentColor;
  if (normalized.timerColor && normalized.accentColor === undefined) normalized.accentColor = normalized.timerColor;
  if (normalized.matchBackgroundColors !== undefined) {
    if (normalized.matchClockBackgroundColors === undefined) normalized.matchClockBackgroundColors = normalized.matchBackgroundColors;
    if (normalized.matchTimerBackgroundColors === undefined) normalized.matchTimerBackgroundColors = normalized.matchBackgroundColors;
  }
  if (normalized.timerPosition && normalized.timerPositions === undefined) {
    normalized.timerPositions = {
      portrait: normalized.timerPosition,
      landscape: normalized.timerPosition
    };
  }

  return normalized;
}

export function useLocalStorageSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [storageMessage, setStorageMessage] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const previousSettings = useRef<AppSettings | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    if (!saveSettings(settings)) {
      setSaveState("failed");
      setStorageMessage("設定を端末に保存できませんでした。");
    } else {
      setSaveState("saved");
    }
  }, [settings]);

  const updateSettings = useCallback((update: SettingsUpdate) => {
    setSettings((current) => {
      const patch = normalizePatch(typeof update === "function" ? update(current) : update);
      previousSettings.current = current;
      return { ...current, ...patch, version: 2, uiRevision: 5 };
    });
  }, []);

  const undoSettings = useCallback(() => {
    if (!previousSettings.current) return false;
    const previous = previousSettings.current;
    previousSettings.current = null;
    setSettings(previous);
    return true;
  }, []);

  const resetSettings = useCallback(() => {
    const next = { ...defaultSettings };
    setSettings(next);
    if (!saveSettings(next)) setStorageMessage("設定を端末に保存できませんでした。");
  }, []);

  return { settings, updateSettings, undoSettings, resetSettings, storageMessage, setStorageMessage, saveState };
}
