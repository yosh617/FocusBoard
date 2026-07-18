import type { AppSettings } from "../types/settings";

export const SETTINGS_EXPORT_FORMAT_VERSION = 1;

export function createSettingsExport(settings: AppSettings, exportedAt = new Date()) {
  return JSON.stringify({
    app: "FocusBoard",
    formatVersion: SETTINGS_EXPORT_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    settings
  }, null, 2);
}

export function downloadSettingsExport(settings: AppSettings, exportedAt = new Date()): boolean {
  try {
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
    const blob = new Blob([createSettingsExport(settings, exportedAt)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `focusboard-settings-${exportedAt.toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
