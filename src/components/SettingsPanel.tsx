import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { colorPresets, dateFormatPresets, defaultSettings, describeFontSize, fontOptions, orientations, settingRanges, taskThemePresets, type AppSettings, type BackgroundChoice, type BackgroundFrame, type ColorPreset, type FontOption, type Orientation, type PositionPreset, type TaskThemePreset } from "../types/settings";
import type { CustomBackground } from "../utils/backgroundStorage";
import { defaultBackgrounds } from "./BackgroundSlideshow";
import { ResetPanel } from "./ResetPanel";
import { downloadSettingsExport } from "../utils/settingsExport";
import { appVersion } from "../utils/appVersion";
import type { AdaptivePalette } from "../utils/adaptiveColor";
import { AppSelect } from "./ui/AppSelect";

type Category = "background" | "display" | "timer" | "data";
type ResettableCategory = Exclude<Category, "data">;
type BackgroundFrameTarget = Exclude<BackgroundChoice, "slideshow">;
type Props = {
  open: boolean; settings: AppSettings; saveState: "saved" | "saving" | "failed";
  orientation: Orientation;
  onChange: (patch: Partial<AppSettings>) => void; onUndo: () => boolean; onClose: () => void; onOpenTasks: () => void;
  fullscreenSupported: boolean; onFullscreenToggle: (enabled: boolean) => Promise<void>;
  onResetSettings: () => void; onClearTimer: () => void; onMessage: (message: string) => void; onStartBackgroundEditing: () => void; adaptivePalette: AdaptivePalette;
  customBackgrounds: CustomBackground[]; onAddBackgrounds: (files: File[]) => Promise<CustomBackground[]>;
  onRemoveBackground: (id: string) => Promise<void>;
  onReorderBackgrounds: (ids: string[]) => Promise<void>;
};

const categories: { id: Category; label: string }[] = [
  { id: "background", label: "背景" }, { id: "display", label: "表示" }, { id: "timer", label: "タイマー" }, { id: "data", label: "データ" }
];
const positionLabels: Record<PositionPreset, string> = {
  "top-left": "左上",
  top: "上",
  "top-right": "右上",
  left: "左",
  center: "中央",
  right: "右",
  "bottom-left": "左下",
  bottom: "下",
  "bottom-right": "右下"
};
const positionGrid: PositionPreset[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
const fonts: { value: FontOption; label: string }[] = [{ value: "system", label: "システム" }, { value: "rounded", label: "丸ゴシック" }, { value: "serif", label: "明朝" }, { value: "mono", label: "等幅" }];
const customDateFormatExample = "yyyy/mm/dd (weekdayShort)";
const builtInBackgroundLabels = ["モーニング", "ラベンダー", "スカイ"];
const orientationLabels: Record<Orientation, string> = { portrait: "縦向き", landscape: "横向き" };

function SettingsCategoryIcon({ category }: { category: Category }) {
  if (category === "background") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="8" cy="9" r="1.3" /><path d="m5.5 17 4.5-4.5 3 3 2.2-2.2 3.3 3.7" /></svg>;
  if (category === "display") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="13" rx="2" /><path d="M9 20h6M12 17.5V20" /></svg>;
  if (category === "timer") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7" /><path d="M9 3h6M12 6V3m0 7v4l2.5 1.5" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4zM7 7.5V5h10v2.5M8 12h8M8 15h5" /></svg>;
}

function Toggle({ id, label, checked, disabled = false, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <div className="setting-row"><label htmlFor={id}>{label}</label><input id={id} className="toggle" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></div>;
}
function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return <details className="settings-disclosure" style={{ overflow: "visible" }}><summary>{label}</summary><div className="settings-disclosure__body">{children}</div></details>;
}
function Range({ id, label, value, min, max, step, unit, initial, formatValue, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; unit: string; initial: number; formatValue?: (value: number) => string; onChange: (value: number) => void }) {
  const input = (next: string) => {
    const parsed = Number(next);
    if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
  };
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const rangeStyle = { "--range-progress": `${progress}%` } as CSSProperties;
  return <div className="setting-control range-control"><label htmlFor={id}>{label}<output>{formatValue ? formatValue(value) : `${value}${unit}`}</output></label><div className="range-control__inputs"><input id={id} className="settings-range" type="range" min={min} max={max} step={step} value={value} style={rangeStyle} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} onChange={(event) => input(event.target.value)} /><input className="number-input" aria-label={`${label}の数値`} type="number" min={min} max={max} step={step} value={value} onChange={(event) => input(event.target.value)} />{unit && <span>{unit}</span>}<button type="button" className="reset-value" aria-label={`${label}を初期値に戻す`} onClick={() => onChange(initial)}>戻す</button></div></div>;
}
function ColorSetting({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <div className={`color-setting${disabled ? " color-setting--disabled" : ""}`}><div className="color-setting__heading"><label htmlFor={id}>{label}</label><output>{value.toUpperCase()}</output></div><input id={id} type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

type HslColor = { h: number; s: number; l: number };
type TimerColorMode = "grid" | "sliders";

const timerAccentPresets = [
  { id: "red", label: "レッド", accent: "#ff3b30" },
  { id: "orange", label: "オレンジ", accent: "#ff9500" },
  { id: "yellow", label: "イエロー", accent: "#ffcc00" },
  { id: "green", label: "グリーン", accent: "#34c759" },
  { id: "mint", label: "ミント", accent: "#00c7be" },
  { id: "cyan", label: "シアン", accent: "#32ade6" },
  { id: "blue", label: "ブルー", accent: "#007aff" },
  { id: "indigo", label: "インディゴ", accent: "#5856d6" },
  { id: "purple", label: "パープル", accent: "#af52de" },
  { id: "pink", label: "ピンク", accent: "#ff2d55" },
  { id: "sky", label: "スカイ", accent: colorPresets.sky.accent },
  { id: "lavender", label: "ラベンダー", accent: colorPresets.lavender.accent }
] as const;

function normalizeHex(value: string): string {
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return colorPresets.sky.accent;
  const digits = match[1].length === 3 ? match[1].split("").map((digit) => `${digit}${digit}`).join("") : match[1];
  return `#${digits.toLowerCase()}`;
}

function hexToHsl(value: string): HslColor {
  const hex = normalizeHex(value).slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const difference = max - min;
  if (difference === 0) return { h: 0, s: 0, l: Math.round(lightness * 100) };
  const saturation = difference / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === red) hue = ((green - blue) / difference) % 6;
  else if (max === green) hue = (blue - red) / difference + 2;
  else hue = (red - green) / difference + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return { h: hue, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

function hslToHex({ h, s, l }: HslColor): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const lightness = Math.min(100, Math.max(0, l)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const second = chroma * (1 - Math.abs((section % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] = section < 1
    ? [chroma, second, 0]
    : section < 2
      ? [second, chroma, 0]
      : section < 3
        ? [0, chroma, second]
        : section < 4
          ? [0, second, chroma]
          : section < 5
            ? [second, 0, chroma]
            : [chroma, 0, second];
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function TimerAccentColorSetting({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const currentHex = normalizeHex(value);
  const [mode, setMode] = useState<TimerColorMode>("grid");
  const [hsl, setHsl] = useState<HslColor>(() => hexToHsl(currentHex));
  useEffect(() => setHsl(hexToHsl(currentHex)), [currentHex]);

  const selectColor = (nextHex: string) => {
    const normalized = normalizeHex(nextHex);
    setHsl(hexToHsl(normalized));
    onChange(normalized);
  };
  const updateChannel = (channel: keyof HslColor, nextValue: string) => {
    const nextHsl = { ...hsl, [channel]: Number(nextValue) };
    setHsl(nextHsl);
    onChange(hslToHex(nextHsl));
  };
  const moveGridSelection = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const movement = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!movement) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    buttons[(currentIndex + movement + buttons.length) % buttons.length]?.click();
    buttons[(currentIndex + movement + buttons.length) % buttons.length]?.focus();
  };
  const sliderOptions: { channel: keyof HslColor; label: string; max: number; unit: string }[] = [
    { channel: "h", label: "色相", max: 360, unit: "°" },
    { channel: "s", label: "彩度", max: 100, unit: "%" },
    { channel: "l", label: "明度", max: 100, unit: "%" }
  ];
  const sliderStyle = (channel: keyof HslColor): CSSProperties => {
    if (channel === "h") {
      return { "--timer-color-picker-track": "linear-gradient(to right, #ff3b30 0%, #ff9500 16%, #ffcc00 32%, #34c759 48%, #00c7be 64%, #007aff 78%, #5856d6 90%, #ff2d55 100%)" } as CSSProperties;
    }
    if (channel === "s") {
      return {
        "--picker-hue": `${hsl.h}`,
        "--timer-color-picker-track": `linear-gradient(to right, ${hslToHex({ h: hsl.h, s: 0, l: hsl.l })}, ${hslToHex({ h: hsl.h, s: 100, l: hsl.l })})`
      } as CSSProperties;
    }
    return {
      "--picker-hue": `${hsl.h}`,
      "--picker-saturation": `${hsl.s}%`,
      "--timer-color-picker-track": `linear-gradient(to right, #000, ${hslToHex({ h: hsl.h, s: hsl.s, l: 50 })}, #fff)`
    } as CSSProperties;
  };

  return <div className="timer-color-picker" data-mode={mode === "grid" ? "grid" : "sliders"}>
    <div className="timer-color-picker__preview" role="img" aria-label={`現在のタイマーアクセント色 ${currentHex.toUpperCase()}`}>
      <span className="timer-color-picker__sample" style={{ "--timer-color": currentHex } as CSSProperties} aria-hidden="true" />
      <div><strong>タイマー</strong><output className="timer-color-picker__value" aria-live="polite">{currentHex.toUpperCase()}</output></div>
      <label><span className="visually-hidden">タイマーのアクセント色</span><input id="timer-color-hex" className="timer-color-picker__native" type="color" value={currentHex} onChange={(event) => selectColor(event.target.value)} /></label>
    </div>
    <div className="timer-color-picker__modes" role="group" aria-label="タイマーアクセント色の選択方法">
      <button className={`timer-color-picker__mode${mode === "grid" ? " is-active" : ""}`} type="button" aria-label="色をグリッドで選ぶ" aria-pressed={mode === "grid"} onClick={() => setMode("grid")}>グリッド</button>
      <button className={`timer-color-picker__mode${mode === "sliders" ? " is-active" : ""}`} type="button" aria-label="色をスライダーで調整" aria-pressed={mode === "sliders"} onClick={() => setMode("sliders")}>スライダー</button>
    </div>
    {mode === "grid" ? <div className="timer-color-picker__grid" role="radiogroup" aria-label="タイマーアクセント色" onKeyDown={moveGridSelection}>
      {timerAccentPresets.map((preset) => {
        const selected = currentHex === preset.accent.toLowerCase();
        return <button className={`timer-color-picker__swatch${selected ? " is-selected" : ""}`} type="button" role="radio" aria-label={preset.label} aria-checked={selected} style={{ "--swatch-color": preset.accent } as CSSProperties} onClick={() => selectColor(preset.accent)} key={preset.id} />;
      })}
    </div> : <div aria-label="タイマーアクセント色の調整">
      {sliderOptions.map(({ channel, label, max, unit }) => <label className="timer-color-picker__slider" data-channel={channel === "h" ? "hue" : channel === "s" ? "saturation" : "lightness"} htmlFor={`timer-color-${channel}`} key={channel}>
        <span className="timer-color-picker__slider-label"><span>{label}</span><output>{hsl[channel]}{unit}</output></span>
        <input className="timer-color-picker__range" id={`timer-color-${channel}`} style={sliderStyle(channel)} type="range" min="0" max={max} step="1" value={hsl[channel]} aria-label={`タイマーアクセント色の${label}`} onChange={(event) => updateChannel(channel, event.target.value)} />
      </label>)}
    </div>}
  </div>;
}

function ClockColorChoices({ value, themeColor, backgroundImage, overlayOpacity, onChange }: { value: string; themeColor: string; backgroundImage?: string; overlayOpacity: number; onChange: (value: string) => void }) {
  const choices = [
    { value: "#ffffff", label: "白", id: "white" },
    { value: "#000000", label: "黒", id: "black" },
    { value: themeColor, label: "テーマ色", id: "theme" },
    { value, label: "カスタム色", id: "custom" }
  ];
  const selected = value.toLowerCase();
  const selectedId = selected === "#ffffff" ? "white" : selected === "#000000" ? "black" : selected === themeColor.toLowerCase() ? "theme" : "custom";
  return <div className="clock-color-settings">
    <div className="clock-color-preview" style={backgroundImage ? { backgroundImage: `linear-gradient(rgba(241,247,255,${overlayOpacity}), rgba(241,247,255,${overlayOpacity})), url(${backgroundImage})` } : undefined}>
      <span style={{ color: value }}>12:34</span>
    </div>
    <div className="clock-color-choices" role="radiogroup" aria-label="時計・日付の手動色">
      {choices.map((choice) => <button type="button" role="radio" aria-label={choice.label} aria-checked={selectedId === choice.id} className={`clock-color-choice${selectedId === choice.id ? " is-selected" : ""}`} onClick={() => onChange(choice.value)} key={choice.id}>
        <span className="clock-color-choice__sample" style={{ color: choice.value }} aria-hidden="true">A</span><span aria-hidden="true">{choice.label}</span>
      </button>)}
    </div>
    <Disclosure label="カラーコード（詳細）"><ColorSetting id="clock-color" label="時計・日付の色" value={value} disabled={false} onChange={onChange} /></Disclosure>
  </div>;
}
function PositionGrid({ label, value, onChange }: { label: string; value: PositionPreset; onChange: (value: PositionPreset) => void }) {
  const [focus, setFocus] = useState(value);
  return <div className="setting-control"><span className="setting-label">{label}</span><div className="position-grid" role="radiogroup" aria-label={label} onKeyDown={(event) => { const index = positionGrid.indexOf(focus); const movement = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 3 : event.key === "ArrowUp" ? -3 : 0; if (!movement) return; event.preventDefault(); const next = positionGrid[(index + movement + 9) % 9]; setFocus(next); onChange(next); document.getElementById(`position-${next}`)?.focus(); }}>
    {positionGrid.map((position) => <button id={`position-${position}`} type="button" role="radio" aria-label={positionLabels[position]} aria-checked={value === position} className={`position-grid__cell${value === position ? " is-selected" : ""}`} onFocus={() => setFocus(position)} onClick={() => onChange(position)} key={position}><i aria-hidden="true" /></button>)}
  </div></div>;
}

type BackgroundFrameOption = { value: BackgroundFrameTarget; label: string; imageUrl: string };
type BackgroundSettingsProps = {
  settings: AppSettings;
  frame: BackgroundFrame;
  customBackgrounds: CustomBackground[];
  frameOptions: BackgroundFrameOption[];
  frameTarget: BackgroundFrameTarget;
  onFrameTargetChange: (target: BackgroundFrameTarget) => void;
  onStartBackgroundEditing: () => void;
  onChange: (patch: Partial<AppSettings>) => void;
  uploads: (files: FileList | null) => Promise<void>;
  move: (index: number, amount: number) => void;
  onRemoveBackground: (id: string) => Promise<void>;
};

function BackgroundSettings({ settings, frame, customBackgrounds, frameOptions, frameTarget, onFrameTargetChange, onStartBackgroundEditing, onChange, uploads, move, onRemoveBackground }: BackgroundSettingsProps) {
  const hiddenBackgroundIds = new Set(settings.hiddenBackgroundIds);
  const builtInOptions = defaultBackgrounds.map((path, index) => ({ value: `bg${index + 1}` as BackgroundChoice, label: builtInBackgroundLabels[index], imageUrl: `${import.meta.env.BASE_URL}${path}` }));
  const sourceOptions: { value: BackgroundChoice; label: string; imageUrl?: string }[] = [
    { value: "slideshow", label: "自動切替" },
    ...builtInOptions.filter((option) => !hiddenBackgroundIds.has(option.value)),
    ...customBackgrounds.map((item) => ({ value: `custom:${item.id}` as BackgroundChoice, label: item.name, imageUrl: item.url }))
  ];
  const hiddenBuiltInOptions = builtInOptions.filter((option) => hiddenBackgroundIds.has(option.value));
  const [frameSettingsOpen, setFrameSettingsOpen] = useState(settings.backgroundChoice !== "slideshow");
  useEffect(() => {
    if (settings.backgroundChoice !== "slideshow") setFrameSettingsOpen(true);
  }, [settings.backgroundChoice]);
  const selectBackground = (option: { value: BackgroundChoice }) => {
    if (option.value === "slideshow") {
      setFrameSettingsOpen(false);
      onChange({ backgroundChoice: option.value });
      return;
    }
    setFrameSettingsOpen(true);
    onFrameTargetChange(option.value);
  };
  const setBackgroundVisibility = (id: string, visible: boolean) => {
    const hiddenIds = visible
      ? settings.hiddenBackgroundIds.filter((hiddenId) => hiddenId !== id)
      : [...new Set([...settings.hiddenBackgroundIds, id])];
    const patch: Partial<AppSettings> = { hiddenBackgroundIds: hiddenIds };
    if (!visible && (settings.backgroundChoice === id || settings.backgroundChoice === `custom:${id}`)) patch.backgroundChoice = "slideshow";
    onChange(patch);
  };
  const removeBackground = (id: string, label: string) => {
    if (window.confirm(`${label}を削除しますか？\nこの操作は元に戻せません。`)) void onRemoveBackground(id);
  };

  return <>
    <section className="background-source-settings" aria-labelledby="background-source-heading">
      <div className="background-settings-heading"><div><h4 id="background-source-heading">背景を選ぶ・追加する</h4></div>{customBackgrounds.length > 0 && <span className="background-settings-count">{customBackgrounds.length}枚追加</span>}</div>
      <div className="background-picker" role="radiogroup" aria-label="背景を選択">
        {sourceOptions.map((option) => <div className="background-option-wrap" key={option.value}>
          <button type="button" role="radio" aria-checked={settings.backgroundChoice === option.value} aria-expanded={option.value !== "slideshow" && settings.backgroundChoice === option.value ? frameSettingsOpen : undefined} aria-controls={option.value !== "slideshow" ? "background-frame-settings" : undefined} title={option.value === "slideshow" ? "背景を自動切替にする" : `${option.label}の設定を開く`} className={`background-option${settings.backgroundChoice === option.value ? " background-option--active" : ""}`} onClick={() => selectBackground(option)}>
            <span className={`background-option__preview${option.value === "slideshow" ? " background-option__preview--auto" : ""}`} style={option.imageUrl ? { backgroundImage: `url(${option.imageUrl})` } : undefined}>{settings.backgroundChoice === option.value && <span className="background-option__selected-badge">選択中</span>}</span>
            <span className="background-option__label">{option.label}</span>
          </button>
          {option.value.startsWith("custom:") ? <button type="button" className="background-option__delete" aria-label={`${option.label}を削除`} title="この画像を削除" onClick={() => removeBackground(option.value.slice("custom:".length), option.label)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5M14 11v5" /></svg></button> : option.value !== "slideshow" && <button type="button" className="background-option__visibility" aria-label={`${option.label}を非表示`} title="この画像を非表示" onClick={() => setBackgroundVisibility(option.value, false)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.8 7 10 7-.4 1.2-1.1 2.3-2 3.2M6.2 6.2C4.5 7.3 3.3 8.9 2 12c1.2 3.7 4.8 7 10 7 1.1 0 2.1-.2 3-.5" /></svg></button>}
        </div>)}
      </div>
      <label className="background-upload" htmlFor="background-upload"><span className="background-upload__icon" aria-hidden="true">＋</span><span><strong>写真／ファイルから追加</strong></span></label>
      <input id="background-upload" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { void uploads(event.target.files); event.target.value = ""; }} />
      {hiddenBuiltInOptions.length > 0 && <details className="background-library"><summary>非表示の初期画像を管理する</summary><div className="background-manager" aria-label="非表示の初期画像">{hiddenBuiltInOptions.map((option) => <article className="background-manager__item--hidden" key={option.value}><span>{option.label}<small>非表示中</small></span><div><button type="button" aria-label={`${option.label}を表示`} onClick={() => setBackgroundVisibility(option.value, true)}>表示</button></div></article>)}</div></details>}
      {customBackgrounds.length > 0 && <details className="background-library"><summary>追加画像を管理する</summary><div className="background-manager" aria-label="追加した背景画像">{customBackgrounds.map((item, index) => { return <article key={item.id}><img src={item.url} alt="" /><span>{item.name}</span><div><button type="button" aria-label={`${item.name}を削除`} onClick={() => removeBackground(item.id, item.name)}>削除</button><button type="button" aria-label={`${item.name}を前へ`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`${item.name}を後へ`} disabled={index === customBackgrounds.length - 1} onClick={() => move(index, 1)}>↓</button></div></article>; })}</div></details>}
      {frameSettingsOpen && settings.backgroundChoice !== "slideshow" && <section id="background-frame-settings" className="background-frame-settings" aria-labelledby="background-frame-heading">
        <div className="background-frame-settings__heading"><div><h4 id="background-frame-heading">この背景を設定</h4></div></div>
        <div className="background-frame-current" aria-live="polite"><span className="background-frame-current__preview" style={{ backgroundImage: `url(${frameOptions.find((option) => option.value === frameTarget)?.imageUrl ?? frameOptions[0]?.imageUrl})` }} /><div><strong>{frameOptions.find((option) => option.value === frameTarget)?.label ?? "モーニング"}</strong></div></div>
        <button className="primary-button background-frame-settings__close" type="button" onClick={onStartBackgroundEditing}>この背景を調整</button>
        <details className="background-advanced"><summary>位置と拡大</summary><div className="background-advanced__content"><Range id="background-scale" label="背景の拡大" value={frame.scale} {...settingRanges.backgroundScale} initial={defaultSettings.backgroundScale} onChange={(backgroundScale) => onChange({ backgroundScale })} /><Range id="background-position-x" label="背景の左右位置" value={Math.round(frame.position.x * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.backgroundPosition.x * 100} onChange={(value) => onChange({ backgroundPosition: { ...frame.position, x: value / 100 } })} /><Range id="background-position-y" label="背景の上下位置" value={Math.round(frame.position.y * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.backgroundPosition.y * 100} onChange={(value) => onChange({ backgroundPosition: { ...frame.position, y: value / 100 } })} /></div></details>
      </section>}
    </section>
    <section className="background-global-settings" aria-labelledby="background-global-heading"><div className="background-settings-heading"><div><h4 id="background-global-heading">画面全体</h4></div></div><Range id="overlay" label="背景を暗くする" value={Math.round(settings.overlayOpacity * 100)} {...settingRanges.overlayOpacity} initial={Math.round(defaultSettings.overlayOpacity * 100)} onChange={(value) => onChange({ overlayOpacity: value / 100 })} />{settings.backgroundChoice === "slideshow" && <Range id="slideshow" label="背景切り替え時間" value={settings.slideshowIntervalSec} {...settingRanges.slideshowIntervalSec} initial={defaultSettings.slideshowIntervalSec} onChange={(slideshowIntervalSec) => onChange({ slideshowIntervalSec })} />}</section>
  </>;
}

export function SettingsPanel({ open, settings, orientation, saveState, onChange: applySettings, onUndo, onClose, onOpenTasks, onStartBackgroundEditing, fullscreenSupported, onFullscreenToggle, onResetSettings, onClearTimer, onMessage, adaptivePalette, customBackgrounds, onAddBackgrounds, onRemoveBackground, onReorderBackgrounds }: Props) {
  const drawerRef = useRef<HTMLElement>(null); const closeRef = useRef<HTMLButtonElement>(null); const [category, setCategory] = useState<Category>("background"); const [frameTarget, setFrameTarget] = useState<BackgroundFrameTarget>("bg1"); const [clockTarget, setClockTarget] = useState<BackgroundFrameTarget | "">(""); const [positionOrientation, setPositionOrientation] = useState<Orientation>(orientation);
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; closeRef.current?.focus(); const keys = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); if (event.key !== "Tab" || !drawerRef.current) return; const nodes = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])')].filter((node) => !node.closest("details:not([open])")); const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }; document.addEventListener("keydown", keys); return () => { document.removeEventListener("keydown", keys); previous?.focus(); }; }, [open, onClose]);
  useEffect(() => { if (settings.backgroundChoice !== "slideshow") setFrameTarget(settings.backgroundChoice); }, [settings.backgroundChoice]);
  useEffect(() => { setClockTarget(settings.backgroundChoice === "slideshow" ? "" : settings.backgroundChoice); }, [settings.backgroundChoice]);
  useEffect(() => {
    if (frameTarget.startsWith("custom:") && !customBackgrounds.some((item) => `custom:${item.id}` === frameTarget)) setFrameTarget("bg1");
  }, [customBackgrounds, frameTarget]);
  useEffect(() => {
    if (clockTarget.startsWith("custom:") && !customBackgrounds.some((item) => `custom:${item.id}` === clockTarget)) setClockTarget("");
  }, [customBackgrounds, clockTarget]);
  useEffect(() => setPositionOrientation(orientation), [orientation]);
  if (!open) return null;
  const uploads = async (files: FileList | null) => { if (!files?.length) return; const created = await onAddBackgrounds([...files]); if (created[0]) { const target = `custom:${created[0].id}` as BackgroundFrameTarget; setFrameTarget(target); onChange({ backgroundChoice: target }); } };
  const resetSection = (patch: Partial<AppSettings>) => { onChange(patch); onMessage("この項目を初期値に戻しました。"); };
  const exportSettings = () => { onMessage(downloadSettingsExport(settings) ? "設定をJSONファイルに保存しました。" : "設定をエクスポートできませんでした。"); };
  const frameOptions: BackgroundFrameOption[] = [
    ...builtInBackgroundLabels.map((label, index) => ({ value: `bg${index + 1}` as BackgroundFrameTarget, label, imageUrl: `${import.meta.env.BASE_URL}${defaultBackgrounds[index]}` })),
    ...customBackgrounds.map((item) => ({ value: `custom:${item.id}` as BackgroundFrameTarget, label: item.name, imageUrl: item.url }))
  ];
  const backgroundFrame: BackgroundFrame = settings.backgroundFrames[frameTarget] ?? (Object.keys(settings.backgroundFrames).length === 0
    ? { scale: settings.backgroundScale, position: settings.backgroundPosition }
    : defaultSettings.backgroundFrames[frameTarget] ?? { scale: defaultSettings.backgroundScale, position: defaultSettings.backgroundPosition });
  const clockBackgroundSetting = clockTarget ? settings.clockBackgroundSettings[clockTarget] ?? { positions: { portrait: defaultSettings.clockDatePosition, landscape: defaultSettings.clockDatePosition }, color: settings.clockColor, matchColors: settings.matchClockBackgroundColors } : { positions: { portrait: defaultSettings.clockDatePosition, landscape: defaultSettings.clockDatePosition }, color: settings.clockColor, matchColors: settings.matchClockBackgroundColors };
  const clockPosition = clockBackgroundSetting.positions[positionOrientation];
  const updateClockSetting = (patch: Partial<typeof clockBackgroundSetting>) => {
    if (!clockTarget) {
      if (patch.color) applySettings({ clockColor: patch.color });
      return;
    }
    const next = { ...clockBackgroundSetting, ...patch };
    applySettings({
      clockBackgroundSettings: { ...settings.clockBackgroundSettings, [clockTarget]: next }
    });
  };
  const updateClockPosition = (position: { x: number; y: number }) => {
    if (!clockTarget) return;
    applySettings({ clockBackgroundSettings: { ...settings.clockBackgroundSettings, [clockTarget]: { ...clockBackgroundSetting, positions: { ...clockBackgroundSetting.positions, [positionOrientation]: position } } } });
  };
  const applyTheme = (id: Exclude<ColorPreset, "custom">) => {
    const preset = colorPresets[id];
    const clockBackgroundSettings = Object.fromEntries(Object.entries(settings.clockBackgroundSettings).map(([key, setting]) => [key, { ...setting, color: preset.text }]));
    applySettings({ colorPreset: id, clockColor: preset.text, timerColor: preset.accent, clockBackgroundSettings });
  };
  const resetPatches: Record<ResettableCategory, Partial<AppSettings>> = {
    background: {
      backgroundChoice: defaultSettings.backgroundChoice,
      overlayOpacity: defaultSettings.overlayOpacity,
      backgroundScale: defaultSettings.backgroundScale,
      backgroundPosition: defaultSettings.backgroundPosition,
      backgroundFrames: defaultSettings.backgroundFrames,
      hiddenBackgroundIds: defaultSettings.hiddenBackgroundIds,
      slideshowIntervalSec: defaultSettings.slideshowIntervalSec
    },
    display: {
      showClock: defaultSettings.showClock,
      showDate: defaultSettings.showDate,
      taskLauncherVisibility: defaultSettings.taskLauncherVisibility,
      taskTheme: defaultSettings.taskTheme,
      fullscreen: defaultSettings.fullscreen,
      fontFamily: defaultSettings.fontFamily,
      colorPreset: defaultSettings.colorPreset,
      use12Hour: defaultSettings.use12Hour,
      showSeconds: defaultSettings.showSeconds,
      clockFontSize: defaultSettings.clockFontSize,
      dateFontSize: defaultSettings.dateFontSize,
      clockColor: defaultSettings.clockColor,
      clockDatePosition: defaultSettings.clockDatePosition,
      clockBackgroundSettings: defaultSettings.clockBackgroundSettings,
      matchClockBackgroundColors: defaultSettings.matchClockBackgroundColors,
      matchBackgroundColors: defaultSettings.matchBackgroundColors
    },
    timer: {
      showTimer: defaultSettings.showTimer,
      timerFontSize: defaultSettings.timerFontSize,
      timerBackgroundOpacity: defaultSettings.timerBackgroundOpacity,
      timerPosition: defaultSettings.timerPosition,
      timerPositions: defaultSettings.timerPositions,
      timerColor: defaultSettings.timerColor,
      matchTimerBackgroundColors: defaultSettings.matchTimerBackgroundColors,
      workMinutes: defaultSettings.workMinutes,
      shortBreakMinutes: defaultSettings.shortBreakMinutes,
      longBreakMinutes: defaultSettings.longBreakMinutes,
      soundEnabled: defaultSettings.soundEnabled
    }
  };
  const onChange = (patch: Partial<AppSettings>) => {
    if (category === "background" && !("backgroundFrames" in patch) && ("backgroundScale" in patch || "backgroundPosition" in patch)) {
      const next: BackgroundFrame = {
        scale: patch.backgroundScale ?? backgroundFrame.scale,
        position: patch.backgroundPosition ?? backgroundFrame.position
      };
      applySettings({ ...patch, backgroundScale: next.scale, backgroundPosition: next.position, backgroundFrames: { ...settings.backgroundFrames, [frameTarget]: next } });
      return;
    }
    applySettings(patch);
  };
  const move = (index: number, amount: number) => { const next = [...customBackgrounds]; const target = index + amount; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; void onReorderBackgrounds(next.map((item) => item.id)); };
  const sectionTitle = categories.find((item) => item.id === category)?.label;

  return <div className="drawer-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}><aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={drawerRef}>
    <span className="settings-sheet-handle" aria-hidden="true" />
    <header className="settings-header"><div><h2 id="settings-title">設定</h2></div><div className={`save-state save-state--${saveState}`} role="status">{saveState === "saving" ? "保存中" : saveState === "failed" ? "保存失敗" : "保存済み"}</div><div className="settings-header__actions"><button className="panel-switch-button" type="button" aria-label="タスクを開く" onClick={() => onOpenTasks()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h10M9 12h10M9 18h10M4 6h.01M4 12h.01M4 18h.01" /></svg><span>タスク</span></button><button className="icon-button" type="button" aria-label="設定を閉じる" title="設定を閉じる" onClick={onClose} ref={closeRef}>×</button></div></header>
    <nav className="settings-tabs" aria-label="設定カテゴリー" role="tablist">{categories.map((item) => <button id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={category === item.id} aria-controls="settings-category-panel" className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)} key={item.id}><SettingsCategoryIcon category={item.id} /><span>{item.label}</span></button>)}</nav>
    <div className="settings-content"><section id="settings-category-panel" className="settings-section" role="tabpanel" aria-labelledby={`settings-tab-${category}`} tabIndex={0}><div className="section-heading"><h3 id="category-title" className="visually-hidden">{sectionTitle}</h3>{category !== "data" && <button className="text-button" type="button" onClick={() => resetSection(resetPatches[category])}>初期値に戻す</button>}</div>
      {category === "background" && <BackgroundSettings settings={settings} frame={backgroundFrame} customBackgrounds={customBackgrounds} frameOptions={frameOptions} frameTarget={frameTarget} onFrameTargetChange={(target) => { setFrameTarget(target); onChange({ backgroundChoice: target }); }} onStartBackgroundEditing={onStartBackgroundEditing} onChange={onChange} uploads={uploads} move={move} onRemoveBackground={onRemoveBackground} />}
      {category === "display" && <><Toggle id="show-clock" label="時計を表示" checked={settings.showClock} onChange={(showClock) => onChange({ showClock })} /><Toggle id="show-date" label="日付を表示" checked={settings.showDate} onChange={(showDate) => onChange({ showDate })} /><Toggle id="fullscreen" label="全画面表示" checked={settings.fullscreen} disabled={!fullscreenSupported} onChange={(fullscreen) => { void onFullscreenToggle(fullscreen); }} /><Disclosure label="タスク画面"><section className="setting-control task-theme-setting" aria-labelledby="task-theme-label"><span id="task-theme-label" className="setting-label">テーマ</span><div className="task-theme-grid" role="radiogroup" aria-labelledby="task-theme-label">{(Object.entries(taskThemePresets) as [TaskThemePreset, typeof taskThemePresets.coral][]).map(([id, preset]) => <button type="button" role="radio" aria-checked={settings.taskTheme === id} className={settings.taskTheme === id ? "is-selected" : ""} onClick={() => onChange({ taskTheme: id })} key={id}><span className="task-theme-option__swatch" style={{ background: preset.primary, color: preset.text }}>Aa</span><span><strong>{preset.label}</strong></span><span className="task-theme-option__preview" style={{ background: preset.primary, color: preset.text }}>開始</span></button>)}</div></section><div className="setting-control"><span id="task-card-visibility-label" className="setting-label">メイン画面のタスクカード</span><div className="choice-grid" role="radiogroup" aria-labelledby="task-card-visibility-label" aria-describedby="task-card-visibility-description"><button type="button" role="radio" aria-checked={settings.taskLauncherVisibility === "always"} className={settings.taskLauncherVisibility === "always" ? "is-selected" : ""} onClick={() => onChange({ taskLauncherVisibility: "always" })}>常に表示</button><button type="button" role="radio" aria-checked={settings.taskLauncherVisibility === "background-tap"} className={settings.taskLauncherVisibility === "background-tap" ? "is-selected" : ""} onClick={() => onChange({ taskLauncherVisibility: "background-tap" })}>背景タップ時のみ</button></div><small id="task-card-visibility-description">背景タップ後に詳細カードを数秒表示します。タスクボタンは常に使えます。</small></div></Disclosure><Disclosure label="カラーテーマ"><div className="choice-grid" role="radiogroup" aria-label="カラーテーマ">{(Object.entries(colorPresets) as [Exclude<ColorPreset, "custom">, typeof colorPresets.sky][]).map(([id, preset]) => <button type="button" role="radio" aria-checked={settings.colorPreset === id} className={settings.colorPreset === id ? "is-selected" : ""} onClick={() => applyTheme(id)} key={id}><i style={{ background: preset.accent }} />{preset.label}</button>)}<button type="button" role="radio" aria-checked={settings.colorPreset === "custom"} className={settings.colorPreset === "custom" ? "is-selected" : ""} onClick={() => onChange({ colorPreset: "custom" })}>カスタム</button></div></Disclosure></>}
      {category === "display" && <Disclosure label="時計・日付の見やすさ"><div className="color-setting-group"><h4>時計・日付の色</h4><p>背景ごとに色と自動調整を設定できます。</p><div className="clock-color-preview" style={{ backgroundImage: `linear-gradient(rgba(241,247,255,${settings.overlayOpacity}), rgba(241,247,255,${settings.overlayOpacity})), url(${frameOptions.find((option) => option.value === clockTarget)?.imageUrl ?? frameOptions[0]?.imageUrl ?? ""})` }}><span style={{ color: clockBackgroundSetting.matchColors ? adaptivePalette.text : clockBackgroundSetting.color }}>12:34</span><small>現在の背景でプレビュー</small></div><Toggle id="match-clock-colors" label="自動調整" checked={clockBackgroundSetting.matchColors} onChange={(matchClockBackgroundColors) => { if (clockTarget) updateClockSetting({ matchColors: matchClockBackgroundColors }); else onChange({ matchClockBackgroundColors }); }} />{clockBackgroundSetting.matchColors ? <small className="color-setting-group__note">明るい文字／暗い文字を背景に合わせて自動調整します。{adaptivePalette.textContrast < 4.5 ? "読みやすさが不足するため補正を推奨します。" : "読みやすさを確認済みです。"}</small> : <ClockColorChoices value={clockBackgroundSetting.color} themeColor={settings.colorPreset !== "custom" ? colorPresets[settings.colorPreset].text : defaultSettings.clockColor} backgroundImage={frameOptions.find((option) => option.value === clockTarget)?.imageUrl} overlayOpacity={settings.overlayOpacity} onChange={(color) => { updateClockSetting({ color }); onChange({ colorPreset: "custom" }); }} />}<Disclosure label="背景ごとの設定"><AppSelect id="clock-background-target" label="設定する背景" value={clockTarget} options={[{ value: "", label: "背景を選択" }, ...frameOptions.map((option) => ({ value: option.value, label: option.label }))]} onChange={(value) => setClockTarget(value as BackgroundFrameTarget | "")} /><div className="orientation-picker"><span className="setting-label">設定する画面の向き</span><div role="radiogroup" aria-label="設定する画面の向き">{orientations.map((item) => <button type="button" role="radio" aria-checked={positionOrientation === item} className={positionOrientation === item ? "is-selected" : ""} onClick={() => setPositionOrientation(item)} key={item}>{orientationLabels[item]}</button>)}</div><small>現在は{orientationLabels[orientation]}です。向きを変えたときも別の位置を保てます。</small></div><Range id="clock-position-x" label="時計の左右位置" value={Math.round(clockPosition.x * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.clockDatePosition.x * 100} onChange={(value) => updateClockPosition({ ...clockPosition, x: value / 100 })} /><Range id="clock-position-y" label="時計の上下位置" value={Math.round(clockPosition.y * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.clockDatePosition.y * 100} onChange={(value) => updateClockPosition({ ...clockPosition, y: value / 100 })} /></Disclosure></div><Disclosure label="表示形式とサイズ"><Toggle id="use-12-hour" label="12時間表示" checked={settings.use12Hour} onChange={(use12Hour) => onChange({ use12Hour })} /><Toggle id="show-seconds" label="秒を表示" checked={settings.showSeconds} onChange={(showSeconds) => onChange({ showSeconds })} /><div className="setting-control"><AppSelect id="date-format-preset" label="日付の形式" value={dateFormatPresets.some((preset) => preset.value === settings.dateFormat) ? settings.dateFormat : "custom"} options={[{ value: "custom", label: "カスタム" }, ...dateFormatPresets.map((preset) => ({ value: preset.value, label: preset.label }))]} onChange={(value) => onChange({ dateFormat: value === "custom" ? customDateFormatExample : value })} />{!dateFormatPresets.some((preset) => preset.value === settings.dateFormat) && <><label className="sub-label" htmlFor="date-format">カスタム形式</label><input id="date-format" className="text-input" type="text" value={settings.dateFormat} maxLength={40} onChange={(event) => onChange({ dateFormat: event.target.value })} /><small>yyyy / yy、mm / m、dd / d、weekday（曜日）、weekdayShort（短い曜日）が使えます。</small></>}</div><Range id="clock-size" label="時計サイズ" value={settings.clockFontSize} {...settingRanges.clockFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.clockFontSize, settingRanges.clockFontSize.min, settingRanges.clockFontSize.max)} initial={defaultSettings.clockFontSize} onChange={(clockFontSize) => onChange({ clockFontSize })} /><Range id="date-size" label="日付サイズ" value={settings.dateFontSize} {...settingRanges.dateFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.dateFontSize, settingRanges.dateFontSize.min, settingRanges.dateFontSize.max)} initial={defaultSettings.dateFontSize} onChange={(dateFontSize) => onChange({ dateFontSize })} /></Disclosure></Disclosure>}
      {category === "display" && <Disclosure label="フォント"><div className="setting-control"><span className="setting-label">表示フォント</span><div className="choice-grid" role="radiogroup" aria-label="表示フォント">{fonts.map((font) => <button type="button" role="radio" aria-checked={settings.fontFamily === font.value} className={settings.fontFamily === font.value ? "is-selected" : ""} style={{ fontFamily: fontOptions[font.value] }} onClick={() => onChange({ fontFamily: font.value })} key={font.value}>{font.label}</button>)}</div></div></Disclosure>}
      {category === "timer" && <><Toggle id="show-timer" label="タイマーを表示" checked={settings.showTimer} onChange={(showTimer) => onChange({ showTimer })} /><div className="color-setting-group"><h4>タイマー</h4><p>進捗表示と操作ボタンの色を設定します。</p><Toggle id="match-timer-colors" label="背景に合わせて自動調整" checked={settings.matchTimerBackgroundColors} onChange={(matchTimerBackgroundColors) => onChange({ matchTimerBackgroundColors })} />{settings.matchTimerBackgroundColors ? <small className="color-setting-group__note">背景の明るさと色から、タイマーを見やすく調整します。</small> : <TimerAccentColorSetting value={settings.timerColor} onChange={(timerColor) => onChange({ timerColor, colorPreset: "custom" })} />}</div><Disclosure label="タイマーの表示と配置"><Range id="timer-size" label="タイマーサイズ" value={settings.timerFontSize} {...settingRanges.timerFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.timerFontSize, settingRanges.timerFontSize.min, settingRanges.timerFontSize.max)} initial={defaultSettings.timerFontSize} onChange={(timerFontSize) => onChange({ timerFontSize })} /><Range id="timer-opacity" label="タイマー背景の不透明度" value={Math.round(settings.timerBackgroundOpacity * 100)} {...settingRanges.timerBackgroundOpacity} initial={Math.round(defaultSettings.timerBackgroundOpacity * 100)} onChange={(value) => onChange({ timerBackgroundOpacity: value / 100 })} /><div className="orientation-picker"><span className="setting-label">設定する画面の向き</span><div role="radiogroup" aria-label="タイマーを設定する画面の向き">{orientations.map((item) => <button type="button" role="radio" aria-checked={positionOrientation === item} className={positionOrientation === item ? "is-selected" : ""} onClick={() => setPositionOrientation(item)} key={item}>{orientationLabels[item]}</button>)}</div><small>現在は{orientationLabels[orientation]}です。</small></div><PositionGrid label="開始前タイマーの配置" value={settings.timerPositions[positionOrientation]} onChange={(timerPosition) => onChange({ timerPosition, timerPositions: { ...settings.timerPositions, [positionOrientation]: timerPosition } })} /></Disclosure></>}
      {category === "timer" && <Disclosure label="ポモドーロの詳細設定"><Range id="work" label="作業時間" value={settings.workMinutes} {...settingRanges.workMinutes} initial={defaultSettings.workMinutes} onChange={(workMinutes) => onChange({ workMinutes })} /><Range id="short-break" label="短い休憩" value={settings.shortBreakMinutes} {...settingRanges.shortBreakMinutes} initial={defaultSettings.shortBreakMinutes} onChange={(shortBreakMinutes) => onChange({ shortBreakMinutes })} /><Range id="long-break" label="長い休憩" value={settings.longBreakMinutes} {...settingRanges.longBreakMinutes} initial={defaultSettings.longBreakMinutes} onChange={(longBreakMinutes) => onChange({ longBreakMinutes })} /><Toggle id="sound" label="終了音" checked={settings.soundEnabled} onChange={(soundEnabled) => onChange({ soundEnabled })} /></Disclosure>}
      {category === "data" && <>
        <div className="data-summary" role="note">
          <span className="data-summary__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5h16v11H4zM7 7.5V5h10v2.5M8 12h8M8 15h5" /></svg></span>
          <div><strong>この端末に保存</strong><span>設定はLocalStorage、背景画像はIndexedDBに保存されます。外部へ送信されません。</span></div>
        </div>
        <div className="data-cards">
          <section className="data-card data-card--primary" aria-labelledby="data-export-heading">
            <div className="data-card__body"><span className="data-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 20h14" /></svg></span><div><h4 id="data-export-heading">設定をバックアップ</h4><p>時計・背景・タイマー設定をJSONで保存できます。背景画像と進行中のタイマー状態は含みません。</p></div></div>
            <button className="primary-button" type="button" onClick={exportSettings}>設定をエクスポート</button>
          </section>
          <section className="data-card" aria-labelledby="data-version-heading">
            <div className="data-card__body"><span className="data-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg></span><div><h4 id="data-version-heading">アプリ情報</h4><p>不具合の報告や確認に利用できます。</p></div></div>
            <output className="data-card__version">v{appVersion}</output>
            <button className="secondary-button" type="button" onClick={() => window.location.reload()}>アプリを再読み込み</button>
          </section>
        </div>
        <div className="data-undo"><div><strong>変更履歴</strong><span>直前の設定変更だけ元に戻せます。</span></div><button className="secondary-button" type="button" onClick={() => onUndo() ? onMessage("直前の変更を元に戻しました。") : onMessage("元に戻せる変更はありません。")}>元に戻す</button></div>
        <ResetPanel onResetSettings={onResetSettings} onClearTimer={onClearTimer} onMessage={onMessage} />
      </>}
    </section></div>
  </aside></div>;
}
