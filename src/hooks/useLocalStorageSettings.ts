import { useCallback, useEffect, useRef, useState } from "react";
import { defaultSettings, type AppSettings } from "../types/settings";
import { loadSettings, saveSettings } from "../utils/storage";

export function useLocalStorageSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [storageMessage, setStorageMessage] = useState("");
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!saveSettings(settings)) setStorageMessage("設定を端末に保存できませんでした。");
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch, version: 1 }));
  }, []);

  const resetSettings = useCallback(() => {
    const next = { ...defaultSettings };
    setSettings(next);
    if (!saveSettings(next)) setStorageMessage("設定を端末に保存できませんでした。");
  }, []);

  return { settings, updateSettings, resetSettings, storageMessage, setStorageMessage };
}
