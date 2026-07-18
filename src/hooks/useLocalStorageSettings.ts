import { useCallback, useEffect, useRef, useState } from "react";
import { defaultSettings, type AppSettings } from "../types/settings";
import { loadSettings, saveSettings } from "../utils/storage";

type SettingsUpdate = Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>);

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
      const patch = typeof update === "function" ? update(current) : update;
      previousSettings.current = current;
      return { ...current, ...patch, version: 2, uiRevision: 4 };
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
