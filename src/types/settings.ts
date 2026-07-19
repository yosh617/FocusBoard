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
export const orientations = ["portrait", "landscape"] as const;
export type Orientation = (typeof orientations)[number];
export type ClockDateAlignment = "left" | "center" | "right";
export type FreePosition = { x: number; y: number };
export type OrientationPositions = Record<Orientation, FreePosition>;
export type OrientationPositionPresets = Record<Orientation, PositionPreset>;
export type BackgroundFrame = { scale: number; position: FreePosition };
export type BackgroundFrames = Record<string, BackgroundFrame>;
export type ClockBackgroundSetting = { positions: OrientationPositions; color: string; matchColors: boolean };
export type ClockBackgroundSettings = Record<string, ClockBackgroundSetting>;
export type DateFormat = string;

export const dateFormatPresets = [
  { value: "yyyy/mm/dd weekday", label: "yyyy/mm/dd 曜日" },
  { value: "mm/dd weekday", label: "mm/dd 曜日" },
  { value: "yyyy年m月d日 weekday", label: "yyyy年m月d日 曜日" },
  { value: "mm月dd日 weekday", label: "mm月dd日 曜日" },
  { value: "weekday", label: "曜日だけ" }
] as const;

export const defaultDateFormat = "yyyy年m月d日 weekday";

export function isDateFormat(value: unknown): value is DateFormat {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 40
    && /^[a-zA-Z0-9年月日/ .(),-]+$/.test(value)
    && /yyyy|yy|mm|m|dd|d|weekdayShort|weekday/.test(value);
}

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
  version: 2;
  uiRevision: 5;
  showClock: boolean;
  showDate: boolean;
  showTimer: boolean;
  fullscreen: boolean;
  timerSetupCollapsed: boolean;
  showSeconds: boolean;
  use12Hour: boolean;
  dateFormat: DateFormat;
  clockFontSize: number;
  dateFontSize: number;
  timerFontSize: number;
  timerBackgroundOpacity: number;
  fontFamily: string;
  colorPreset: ColorPreset;
  clockColor: string;
  timerColor: string;
  matchClockBackgroundColors: boolean;
  matchTimerBackgroundColors: boolean;
  /** @deprecated Used only when migrating settings created before separate auto-color switches. */
  matchBackgroundColors: boolean;
  overlayOpacity: number;
  backgroundScale: number;
  backgroundPosition: FreePosition;
  backgroundFrames: BackgroundFrames;
  clockBackgroundSettings: ClockBackgroundSettings;
  hiddenBackgroundIds: string[];
  slideshowIntervalSec: number;
  backgroundChoice: BackgroundChoice;
  clockPosition: PositionPreset;
  datePosition: PositionPreset;
  timerPosition: PositionPreset;
  timerPositions: OrientationPositionPresets;
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
  backgroundScale: { min: 100, max: 220, step: 1, unit: "%" },
  slideshowIntervalSec: { min: 10, max: 600, step: 10, unit: "秒" },
  workMinutes: { min: 1, max: 180, step: 1, unit: "分" },
  shortBreakMinutes: { min: 1, max: 60, step: 1, unit: "分" },
  longBreakMinutes: { min: 1, max: 120, step: 1, unit: "分" }
} as const;

export const defaultSettings: AppSettings = {
  version: 2,
  uiRevision: 5,
  showClock: true,
  showDate: true,
  showTimer: true,
  fullscreen: false,
  timerSetupCollapsed: false,
  showSeconds: false,
  use12Hour: false,
  dateFormat: defaultDateFormat,
  clockFontSize: 104,
  dateFontSize: 20,
  timerFontSize: 60,
  timerBackgroundOpacity: 0.8,
  fontFamily: "system",
  colorPreset: "sky",
  clockColor: "#17345f",
  timerColor: "#91bde8",
  matchClockBackgroundColors: true,
  matchTimerBackgroundColors: false,
  matchBackgroundColors: false,
  overlayOpacity: 0.16,
  backgroundScale: 100,
  backgroundPosition: { x: 0.5, y: 0.5 },
  backgroundFrames: {},
  clockBackgroundSettings: {},
  hiddenBackgroundIds: [],
  slideshowIntervalSec: 60,
  backgroundChoice: "slideshow",
  clockPosition: "bottom-left",
  datePosition: "bottom-left",
  timerPosition: "center",
  timerPositions: { portrait: "center", landscape: "center" },
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

export function describeFontSize(value: number, initial: number, min: number, max: number) {
  const smallThreshold = initial - (initial - min) * .5;
  const largeThreshold = initial + (max - initial) * .5;
  if (value < smallThreshold) return "小さめ";
  if (value > largeThreshold) return "大きめ";
  return "標準";
}
