export const positionPresets = [
  "center",
  "top",
  "bottom",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
] as const;

export type PositionPreset = (typeof positionPresets)[number];

export type AppSettings = {
  version: 1;
  showClock: boolean;
  showDate: boolean;
  showTimer: boolean;
  showSeconds: boolean;
  use12Hour: boolean;
  clockFontSize: number;
  dateFontSize: number;
  timerFontSize: number;
  fontFamily: string;
  textColor: string;
  overlayOpacity: number;
  slideshowIntervalSec: number;
  clockPosition: PositionPreset;
  datePosition: PositionPreset;
  timerPosition: PositionPreset;
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  soundEnabled: boolean;
};

export const defaultSettings: AppSettings = {
  version: 1,
  showClock: true,
  showDate: true,
  showTimer: true,
  showSeconds: false,
  use12Hour: false,
  clockFontSize: 136,
  dateFontSize: 28,
  timerFontSize: 64,
  fontFamily: "system",
  textColor: "#f8fafc",
  overlayOpacity: 0.42,
  slideshowIntervalSec: 60,
  clockPosition: "center",
  datePosition: "center",
  timerPosition: "center",
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  soundEnabled: true
};

export const fontOptions = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
  serif: 'Iowan Old Style, "Times New Roman", serif',
  mono: 'ui-monospace, "SFMono-Regular", Consolas, monospace'
} as const;

export type FontOption = keyof typeof fontOptions;
