import { useEffect, useId, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type ColorPickerMode = "grid" | "spectrum" | "sliders";

export type ColorPickerSavedColor = {
  label: string;
  color: string;
};

export type ColorPickerProps = {
  /** The color represented by the picker. Hex colors are emitted from onChange. */
  value: string;
  onChange: (color: string) => void;
  /** Which of the three Apple-style tabs are shown. */
  modes?: ColorPickerMode[];
  defaultMode?: ColorPickerMode;
  mode?: ColorPickerMode;
  onModeChange?: (mode: ColorPickerMode) => void;
  /** Colors shown in the saved-colors row. Strings are kept for backwards compatibility. */
  savedColors?: Array<string | ColorPickerSavedColor>;
  onAddSavedColor?: (color: string) => void;
  onRemoveSavedColor?: (color: string, index: number) => void;
  /** Opacity is a 0..1 value. The opacity row is omitted when these props are absent. */
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

type Rgb = { red: number; green: number; blue: number };
type Hsl = { h: number; s: number; l: number };

const DEFAULT_SAVED_COLORS: ColorPickerSavedColor[] = [
  { label: "黒", color: "#000000" },
  { label: "ブルー", color: "#007aff" },
  { label: "グリーン", color: "#34c759" },
  { label: "イエロー", color: "#ffcc00" },
  { label: "レッド", color: "#ff3b30" },
  { label: "シアン", color: "#32ade6" },
  { label: "パープル", color: "#af52de" },
  { label: "インディゴ", color: "#5856d6" },
  { label: "ピンク", color: "#ff2d55" }
];
const GRID_COLUMNS = 12;
const GRID_ROWS = 9;
const GRID_COLORS = Array.from({ length: GRID_ROWS }, (_, row) => Array.from({ length: GRID_COLUMNS }, (_, column) => {
  if (row === 0) {
    const lightness = 100 - column * (100 / (GRID_COLUMNS - 1));
    return hslToHex({ h: 0, s: 0, l: lightness });
  }
  const hue = column * 30;
  const lightness = 15 + (row - 1) * 10;
  return hslToHex({ h: hue, s: 82, l: lightness });
})).flat();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value: string): string {
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return "#000000";
  const digits = match[1].length === 3 ? match[1].split("").map((digit) => `${digit}${digit}`).join("") : match[1];
  return `#${digits.toLowerCase()}`;
}

function isHex(value: string): boolean {
  return /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function hexToRgb(value: string): Rgb {
  const hex = normalizeHex(value).slice(1);
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHex({ red, green, blue }: Rgb): string {
  return `#${[red, green, blue].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl({ red, green, blue }: Rgb): Hsl {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const difference = max - min;
  const l = (max + min) / 2;
  if (difference === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = difference / (1 - Math.abs(2 * l - 1));
  let h = max === r ? (g - b) / difference % 6 : max === g ? (b - r) / difference + 2 : (r - g) / difference + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const second = chroma * (1 - Math.abs(section % 2 - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] = section < 1 ? [chroma, second, 0] : section < 2 ? [second, chroma, 0] : section < 3 ? [0, chroma, second] : section < 4 ? [0, second, chroma] : section < 5 ? [second, 0, chroma] : [chroma, 0, second];
  return rgbToHex({ red: (red + match) * 255, green: (green + match) * 255, blue: (blue + match) * 255 });
}

function modeLabel(mode: ColorPickerMode): string {
  return mode === "grid" ? "グリッド" : mode === "spectrum" ? "スペクトラム" : "スライダー";
}

function colorName(color: string): string {
  return color.toUpperCase();
}

function savedColorOption(option: string | ColorPickerSavedColor): ColorPickerSavedColor {
  if (typeof option === "string") {
    const color = normalizeHex(option);
    return { label: colorName(color), color };
  }
  const color = normalizeHex(option.color);
  return { label: option.label.trim() || colorName(color), color };
}

function Spectrum({ hsl, disabled, onChange }: { hsl: Hsl; disabled: boolean; onChange: (color: string) => void }) {
  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = Number.isFinite(bounds.left) ? bounds.left : 0;
    const top = Number.isFinite(bounds.top) ? bounds.top : 0;
    const width = bounds.width || 1;
    const height = bounds.height || 1;
    const clientX = Number.isFinite(event.clientX) ? event.clientX : left;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : top;
    const saturation = clamp(((clientX - left) / width) * 100, 0, 100);
    const lightness = clamp(100 - ((clientY - top) / height) * 100, 0, 100);
    onChange(hslToHex({ ...hsl, s: saturation, l: lightness }));
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const amount = event.shiftKey ? 10 : 5;
    let nextSaturation = hsl.s;
    let nextLightness = hsl.l;
    if (event.key === "ArrowLeft") nextSaturation -= amount;
    else if (event.key === "ArrowRight") nextSaturation += amount;
    else if (event.key === "ArrowDown") nextLightness -= amount;
    else if (event.key === "ArrowUp") nextLightness += amount;
    else return;
    event.preventDefault();
    onChange(hslToHex({ ...hsl, s: clamp(nextSaturation, 0, 100), l: clamp(nextLightness, 0, 100) }));
  };
  const hueStyle = `hsl(${hsl.h} 100% 50%)`;
  const markerStyle = { left: `${hsl.s}%`, top: `${100 - hsl.l}%` } as CSSProperties;
  return <div className="color-picker__spectrum-panel">
    <div
      className="color-picker__spectrum"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="彩度と明度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={hsl.s}
      aria-valuetext={`彩度 ${hsl.s}%、明度 ${hsl.l}%`}
      aria-disabled={disabled}
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueStyle}` }}
      onPointerDown={updateFromPointer}
      onKeyDown={handleKeyDown}
    ><i className="color-picker__spectrum-marker" style={markerStyle} aria-hidden="true" /></div>
    <label className="color-picker__hue">
      <span>色相</span>
      <input type="range" min="0" max="360" step="1" value={hsl.h} disabled={disabled} aria-label="色相" onChange={(event) => onChange(hslToHex({ ...hsl, h: Number(event.target.value) }))} />
    </label>
  </div>;
}

function ColorGrid({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (color: string) => void }) {
  const moveSelection = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const movement = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? GRID_COLUMNS : event.key === "ArrowUp" ? -GRID_COLUMNS : event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : 0;
    if (movement === 0) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = movement === -Infinity ? 0 : movement === Infinity ? buttons.length - 1 : clamp(currentIndex + movement, 0, buttons.length - 1);
    buttons[nextIndex]?.focus();
    buttons[nextIndex]?.click();
  };
  const selectedIndex = GRID_COLORS.indexOf(normalizeHex(value));
  return <div className="color-picker__grid" role="grid" aria-label="色のグリッド" onKeyDown={moveSelection}>
    {GRID_COLORS.map((color, index) => <button
      key={`${color}-${index}`}
      type="button"
      role="gridcell"
      aria-label={colorName(color)}
      aria-selected={index === selectedIndex}
      tabIndex={index === (selectedIndex >= 0 ? selectedIndex : 0) ? 0 : -1}
      className={`color-picker__grid-cell${index === selectedIndex ? " is-selected" : ""}`}
      style={{ "--color-picker-swatch": color } as CSSProperties}
      disabled={disabled}
      onClick={() => onChange(color)}
    />)}
  </div>;
}

function Sliders({ value, rgb, disabled, onChange }: { value: string; rgb: Rgb; disabled: boolean; onChange: (color: string) => void }) {
  const channels: { key: keyof Rgb; label: string; english: string }[] = [
    { key: "red", label: "赤", english: "Red" },
    { key: "green", label: "緑", english: "Green" },
    { key: "blue", label: "青", english: "Blue" }
  ];
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const channelTrack = (key: keyof Rgb): CSSProperties => {
    const start = { ...rgb, [key]: 0 };
    const end = { ...rgb, [key]: 255 };
    return { "--color-picker-track": `linear-gradient(to right, ${rgbToHex(start)}, ${rgbToHex(end)})` } as CSSProperties;
  };
  return <div className="color-picker__sliders">
    {channels.map(({ key, label, english }) => <label className={`color-picker__channel color-picker__channel--${key}`} key={key}>
      <span className="color-picker__channel-heading"><span>{label} <small>({english})</small></span><output>{rgb[key]}</output></span>
      <input type="range" min="0" max="255" step="1" value={rgb[key]} style={channelTrack(key)} disabled={disabled} aria-label={`${english} / ${label}`} onChange={(event) => onChange(rgbToHex({ ...rgb, [key]: Number(event.target.value) }))} />
    </label>)}
    <label className="color-picker__hex"><span>Hex Color</span><input type="text" value={draft} maxLength={7} spellCheck={false} disabled={disabled} aria-label="Hex Color" onChange={(event) => { const next = event.target.value; setDraft(next.toUpperCase()); if (isHex(next)) onChange(normalizeHex(next)); }} onBlur={() => setDraft(value.toUpperCase())} /></label>
  </div>;
}

export function ColorPicker({ value, onChange, modes = ["grid", "spectrum", "sliders"], defaultMode = modes[0] ?? "grid", mode, onModeChange, savedColors = DEFAULT_SAVED_COLORS, onAddSavedColor, onRemoveSavedColor, opacity, onOpacityChange, label = "色", id, disabled = false, className }: ColorPickerProps) {
  const generatedId = useId();
  const pickerId = id ?? `color-picker-${generatedId.replaceAll(":", "")}`;
  const currentHex = normalizeHex(value);
  const rgb = hexToRgb(currentHex);
  const hsl = rgbToHsl(rgb);
  const [internalMode, setInternalMode] = useState<ColorPickerMode>(modes.includes(defaultMode) ? defaultMode : modes[0] ?? "grid");
  const activeMode = mode && modes.includes(mode) ? mode : internalMode;
  const changeColor = (next: string) => { if (!disabled) onChange(normalizeHex(next)); };
  const selectMode = (next: ColorPickerMode) => { if (disabled) return; setInternalMode(next); onModeChange?.(next); };
  const showOpacity = opacity !== undefined && onOpacityChange !== undefined;
  const rootClassName = ["color-picker", disabled ? "color-picker--disabled" : "", className ?? ""].filter(Boolean).join(" ");
  return <section className={rootClassName} aria-label={label} data-mode={activeMode} style={{ "--color-picker-accent": currentHex, "--picker-hue": hsl.h } as CSSProperties}>
    <header className="color-picker__heading">
      <strong>{label}</strong>
    </header>
    <div className="color-picker__tabs" role="tablist" aria-label={`${label}の選択方法`} onKeyDown={(event) => {
      const movement = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : 0;
      if (!movement || modes.length === 0) return;
      event.preventDefault();
      const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
      const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = movement === -Infinity ? 0 : movement === Infinity ? tabs.length - 1 : (currentIndex + movement + tabs.length) % tabs.length;
      const next = modes[nextIndex];
      if (next) { selectMode(next); tabs[nextIndex]?.focus(); }
    }}>
      {modes.map((item) => <button key={item} id={`${pickerId}-tab-${item}`} type="button" role="tab" aria-selected={activeMode === item} aria-controls={`${pickerId}-panel-${item}`} className={activeMode === item ? "is-active" : ""} disabled={disabled} onClick={() => selectMode(item)}>{modeLabel(item)}</button>)}
    </div>
    <div id={`${pickerId}-panel-${activeMode}`} className="color-picker__panel" role="tabpanel" aria-labelledby={`${pickerId}-tab-${activeMode}`}>
      {activeMode === "grid" && <ColorGrid value={currentHex} disabled={disabled} onChange={changeColor} />}
      {activeMode === "spectrum" && <Spectrum hsl={hsl} disabled={disabled} onChange={changeColor} />}
      {activeMode === "sliders" && <Sliders value={currentHex} rgb={rgb} disabled={disabled} onChange={changeColor} />}
    </div>
    {showOpacity && <label className="color-picker__opacity" htmlFor={`${pickerId}-opacity`}>
      <span className="color-picker__opacity-heading"><span>不透明度</span><output>{Math.round(clamp(opacity, 0, 1) * 100)}%</output></span>
      <input id={`${pickerId}-opacity`} type="range" min="0" max="1" step="0.01" value={clamp(opacity, 0, 1)} disabled={disabled} aria-label="不透明度" onChange={(event) => onOpacityChange?.(Number(event.target.value))} />
    </label>}
    <div className="color-picker__current">
      <span className="color-picker__current-swatch">
        <span style={{ "--color-picker-current": currentHex } as CSSProperties} aria-hidden="true" />
      </span>
      <div className="color-picker__current-value"><span>選択中の色</span><output>{colorName(currentHex)}</output></div>
    </div>
    <div className="color-picker__saved" aria-label="保存色">
      <span className="color-picker__saved-label">保存色</span>
      <div className="color-picker__saved-colors">
        {savedColors.map((option, index) => { const { label: optionLabel, color } = savedColorOption(option); const accessibleLabel = typeof option === "string" ? `保存色 ${colorName(color)}` : `保存色 ${optionLabel} ${colorName(color)}`; return <button key={`${color}-${index}`} type="button" className={`color-picker__saved-color${color === currentHex ? " is-selected" : ""}`} style={{ "--color-picker-swatch": color } as CSSProperties} aria-label={accessibleLabel} title={`${optionLabel} (${colorName(color)})`} aria-pressed={color === currentHex} disabled={disabled} onClick={() => changeColor(color)} onContextMenu={(event) => { if (!onRemoveSavedColor) return; event.preventDefault(); onRemoveSavedColor(color, index); }} />; })}
        {onAddSavedColor && <button type="button" className="color-picker__add-saved" aria-label="現在の色を保存" disabled={disabled} onClick={() => onAddSavedColor(currentHex)}>+</button>}
      </div>
    </div>
  </section>;
}

export function ColorPickerDisclosure(props: ColorPickerProps) {
  const currentHex = normalizeHex(props.value);
  const label = props.label ?? "色";
  return <details className="color-picker-field">
    <summary>
      <span className="color-picker-field__swatch" style={{ "--color-picker-current": currentHex } as CSSProperties} aria-hidden="true" />
      <span className="color-picker-field__value"><strong>{label}</strong><output>{colorName(currentHex)}</output></span>
      <span className="color-picker-field__action">変更</span>
    </summary>
    <div className="color-picker-field__body"><ColorPicker {...props} label={label} /></div>
  </details>;
}
