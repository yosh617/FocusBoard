import { describe, expect, it } from "vitest";
import { defaultSettings } from "../types/settings";
import { createSettingsExport, SETTINGS_EXPORT_FORMAT_VERSION } from "./settingsExport";

describe("settings export", () => {
  it("creates a versioned JSON backup containing settings", () => {
    const exported = JSON.parse(createSettingsExport(defaultSettings, new Date("2026-07-18T03:04:05.000Z"))) as {
      app: string;
      formatVersion: number;
      exportedAt: string;
      settings: typeof defaultSettings;
    };

    expect(exported.app).toBe("FocusBoard");
    expect(exported.formatVersion).toBe(SETTINGS_EXPORT_FORMAT_VERSION);
    expect(exported.exportedAt).toBe("2026-07-18T03:04:05.000Z");
    expect(exported.settings).toEqual(defaultSettings);
  });
});
