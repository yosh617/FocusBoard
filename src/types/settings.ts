export const positionPresets = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
] as const;

export type PositionPreset = (typeof positionPresets)[number];
export type ClockDateAlignment = "left" | "center" | "right";
export type FreePosition = { x: number; y: number };

export const backgroundChoices = ["slideshow", "bg1", "bg2", "bg3"] as const;
export type BuiltInBackgroundChoice = (typeof backgroundChoices)[number];
export type BackgroundChoice = BuiltInBackgroundChoice | `custom:${string}`;

export const colorPresets = {
  sky: { label: "スカイ", text: "#17345f", accent: "#91bde8", accentStrong: "#315f98" },
  lavender: { label: "ラベンダー", text: "#453b68", accent: "#baa9e3", accentStrong: "#69559d" },
  mint: { label: "ミント", text: "#245954", accent: "#91d2c5", accentStrong: "#347b70" },
  peach: { label: "ピーチ", text: "#69463b", accent: "#e9b29d", accentStrong: "#965748" },
  rose: { label: "ローズ", text: "#6b4050", accent: "#e1adc0", accentStrong: "#98536c" }
} as const;
export type ColorPreset = keyof typeof colorPresets | "custom";

export type AppSettings = {
  version: 1;
  uiRevision: 3;
  showClock: boolean;
  showDate: boolean;
  showTimer: boolean;
  timerSetupCollapsed: boolean;
  showSeconds: boolean;
  use12Hour: boolean;
  clockFontSize: number;
  dateFontSize: number;
  timerFontSize: number;
  timerBackgroundOpacity: number;
  fontFamily: string;
  colorPreset: ColorPreset;
  textColor: string;
  accentColor: string;
  matchBackgroundColors: boolean;
  overlayOpacity: number;
  slideshowIntervalSec: number;
  backgroundChoice: BackgroundChoice;
  clockPosition: PositionPreset;
  datePosition: PositionPreset;
  timerPosition: PositionPreset;
  clockDatePosition: FreePosition;
  clockDateAlignment: ClockDateAlignment;
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  soundEnabled: boolean;
};

export const settingRanges = {
  clockFontSize: { min: 56, max: 220, step: 1, unit: "px" },
  dateFontSize: { min: 16, max: 64, step: 1, unit: "px" },
  timerFontSize: { min: 36, max: 120, step: 1, unit: "px" },
  timerBackgroundOpacity: { min: 60, max: 100, step: 1, unit: "%" },
  overlayOpacity: { min: 0, max: 70, step: 1, unit: "%" },
  slideshowIntervalSec: { min: 10, max: 600, step: 10, unit: "秒" },
  workMinutes: { min: 1, max: 180, step: 1, unit: "分" },
  shortBreakMinutes: { min: 1, max: 60, step: 1, unit: "分" },
  longBreakMinutes: { min: 1, max: 120, step: 1, unit: "分" }
} as const;

export const defaultSettings: AppSettings = {
  version: 1,
  uiRevision: 3,
  showClock: true,
  showDate: true,
  showTimer: true,
  timerSetupCollapsed: false,
  showSeconds: false,
  use12Hour: false,
  clockFontSize: 104,
  dateFontSize: 20,
  timerFontSize: 60,
  timerBackgroundOpacity: 0.8,
  fontFamily: "system",
  colorPreset: "sky",
  textColor: "#17345f",
  accentColor: "#91bde8",
  matchBackgroundColors: false,
  overlayOpacity: 0.16,
  slideshowIntervalSec: 60,
  backgroundChoice: "slideshow",
  clockPosition: "bottom-left",
  datePosition: "bottom-left",
  timerPosition: "center",
  clockDatePosition: { x: 0.06, y: 0.74 },
  clockDateAlignment: "left",
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
