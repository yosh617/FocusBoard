import { useEffect, useRef, useState, type ReactNode } from "react";
import { colorPresets, dateFormatPresets, defaultSettings, describeFontSize, fontOptions, orientations, positionPresets, settingRanges, type AppSettings, type BackgroundChoice, type BackgroundFrame, type ColorPreset, type FontOption, type Orientation, type PositionPreset } from "../types/settings";
import type { CustomBackground } from "../utils/backgroundStorage";
import { MAX_BACKGROUND_FILE_SIZE, MAX_CUSTOM_BACKGROUNDS } from "../utils/backgroundStorage";
import { defaultBackgrounds } from "./BackgroundSlideshow";
import { ResetPanel } from "./ResetPanel";
import { downloadSettingsExport } from "../utils/settingsExport";
import { appVersion } from "../utils/appVersion";
import type { AdaptivePalette } from "../utils/adaptiveColor";

type Category = "background" | "display" | "timer" | "data";
type ResettableCategory = Exclude<Category, "data">;
type BackgroundFrameTarget = Exclude<BackgroundChoice, "slideshow">;
type Props = {
  open: boolean; settings: AppSettings; saveState: "saved" | "saving" | "failed";
  orientation: Orientation;
  onChange: (patch: Partial<AppSettings>) => void; onUndo: () => boolean; onClose: () => void;
  fullscreenSupported: boolean; onFullscreenToggle: (enabled: boolean) => Promise<void>;
  onResetSettings: () => void; onClearTimer: () => void; onMessage: (message: string) => void; onStartBackgroundEditing: () => void; adaptivePalette: AdaptivePalette;
  customBackgrounds: CustomBackground[]; onAddBackgrounds: (files: File[]) => Promise<CustomBackground[]>;
  onRemoveBackground: (id: string) => Promise<void>;
  onReorderBackgrounds: (ids: string[]) => Promise<void>;
};

const categories: { id: Category; label: string }[] = [
  { id: "background", label: "背景" }, { id: "display", label: "表示" }, { id: "timer", label: "タイマー" }, { id: "data", label: "保存・リセット" }
];
const positionLabels: Record<PositionPreset, string> = { "top-left": "左上", top: "上", "top-right": "右上", left: "左", center: "中央", right: "右", "bottom-left": "左下", bottom: "下", "bottom-right": "右下" };
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
  return <details className="settings-disclosure"><summary>{label}</summary><div className="settings-disclosure__body">{children}</div></details>;
}
function Range({ id, label, value, min, max, step, unit, initial, formatValue, rangeText, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; unit: string; initial: number; formatValue?: (value: number) => string; rangeText?: string; onChange: (value: number) => void }) {
  const input = (next: string) => { const value = Number(next); if (Number.isFinite(value)) onChange(Math.min(max, Math.max(min, value))); };
  return <div className="setting-control range-control"><label htmlFor={id}>{label}<output>{formatValue ? formatValue(value) : `${value}${unit}`}</output></label><div className="range-control__inputs"><input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} onChange={(event) => input(event.target.value)} /><input className="number-input" aria-label={`${label}の数値`} type="number" min={min} max={max} step={step} value={value} onChange={(event) => input(event.target.value)} />{unit && <span>{unit}</span>}<button type="button" className="reset-value" aria-label={`${label}を初期値に戻す`} onClick={() => onChange(initial)}>戻す</button></div><small>{rangeText ?? `範囲: ${min}〜${max}${unit}`}</small></div>;
}
function ColorSetting({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <div className={`color-setting${disabled ? " color-setting--disabled" : ""}`}><div className="color-setting__heading"><label htmlFor={id}>{label}</label><output>{value.toUpperCase()}</output></div><input id={id} type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
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
      <span style={{ color: value }}>12:34</span><small>実際の背景上でプレビュー</small>
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
  </div><small>矢印キーでも移動できます。</small></div>;
}

type BackgroundFrameOption = { value: BackgroundFrameTarget; label: string; imageUrl: string };
type BackgroundSettingsProps = {
  settings: AppSettings;
  frame: BackgroundFrame;
  customBackgrounds: CustomBackground[];
  customSize: number;
  frameOptions: BackgroundFrameOption[];
  frameTarget: BackgroundFrameTarget;
  onFrameTargetChange: (target: BackgroundFrameTarget) => void;
  onStartBackgroundEditing: () => void;
  onChange: (patch: Partial<AppSettings>) => void;
  uploads: (files: FileList | null) => Promise<void>;
  move: (index: number, amount: number) => void;
  onRemoveBackground: (id: string) => Promise<void>;
};

function BackgroundSettings({ settings, frame, customBackgrounds, customSize, frameOptions, frameTarget, onFrameTargetChange, onStartBackgroundEditing, onChange, uploads, move, onRemoveBackground }: BackgroundSettingsProps) {
  const hiddenBackgroundIds = new Set(settings.hiddenBackgroundIds);
  const builtInOptions = defaultBackgrounds.map((path, index) => ({ value: `bg${index + 1}` as BackgroundChoice, label: builtInBackgroundLabels[index], imageUrl: `${import.meta.env.BASE_URL}${path}` }));
  const sourceOptions: { value: BackgroundChoice; label: string; imageUrl?: string }[] = [
    { value: "slideshow", label: "自動切替" },
    ...builtInOptions.filter((option) => !hiddenBackgroundIds.has(option.value)),
    ...customBackgrounds.map((item) => ({ value: `custom:${item.id}` as BackgroundChoice, label: item.name, imageUrl: item.url }))
  ];
  const hiddenBuiltInOptions = builtInOptions.filter((option) => hiddenBackgroundIds.has(option.value));
  const selectedOption = sourceOptions.find((option) => option.value === settings.backgroundChoice) ?? sourceOptions[0];
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
      <div className="background-settings-heading"><div><span className="background-settings-kicker">STEP 1</span><h4 id="background-source-heading">背景を選ぶ・追加する</h4><p>使いたい背景を選ぶと、すぐに画面へ反映されます。</p></div><span className="background-settings-count">{customBackgrounds.length}枚追加</span></div>
      <div className="background-current" aria-live="polite">
        <span className={`background-current__preview${selectedOption?.value === "slideshow" ? " background-option__preview--auto" : ""}`} style={selectedOption?.imageUrl ? { backgroundImage: `url(${selectedOption.imageUrl})` } : undefined} />
        <div><span>現在の背景</span><strong>{selectedOption?.label ?? "自動切替"}</strong><small>{selectedOption?.value === "slideshow" ? "時間ごとに自動で切り替わります" : "下の画像から変更・調整できます"}</small></div>
      </div>
      <div className="background-picker-heading"><strong>背景の一覧</strong><span>タップで選択・設定</span></div>
      <div className="background-picker" role="radiogroup" aria-label="背景を選択">
        {sourceOptions.map((option) => <div className="background-option-wrap" key={option.value}>
          <button type="button" role="radio" aria-checked={settings.backgroundChoice === option.value} aria-expanded={option.value !== "slideshow" && settings.backgroundChoice === option.value ? frameSettingsOpen : undefined} aria-controls={option.value !== "slideshow" ? "background-frame-settings" : undefined} title={option.value === "slideshow" ? "背景を自動切替にする" : `${option.label}の設定を開く`} className={`background-option${settings.backgroundChoice === option.value ? " background-option--active" : ""}`} onClick={() => selectBackground(option)}>
            <span className={`background-option__preview${option.value === "slideshow" ? " background-option__preview--auto" : ""}`} style={option.imageUrl ? { backgroundImage: `url(${option.imageUrl})` } : undefined}>{settings.backgroundChoice === option.value && <span className="background-option__selected-badge">選択中</span>}</span>
            <span className="background-option__label">{option.label}</span>
          </button>
          {option.value.startsWith("custom:") ? <button type="button" className="background-option__delete" aria-label={`${option.label}を削除`} title="この画像を削除" onClick={() => removeBackground(option.value.slice("custom:".length), option.label)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5M14 11v5" /></svg></button> : option.value !== "slideshow" && <button type="button" className="background-option__visibility" aria-label={`${option.label}を非表示`} title="この画像を非表示" onClick={() => setBackgroundVisibility(option.value, false)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.8 7 10 7-.4 1.2-1.1 2.3-2 3.2M6.2 6.2C4.5 7.3 3.3 8.9 2 12c1.2 3.7 4.8 7 10 7 1.1 0 2.1-.2 3-.5" /></svg></button>}
        </div>)}
      </div>
      <label className="background-upload" htmlFor="background-upload"><span className="background-upload__icon" aria-hidden="true">＋</span><span><strong>写真／ファイルから追加</strong><small>端末内の画像を背景に使えます</small></span></label>
      <input id="background-upload" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { void uploads(event.target.files); event.target.value = ""; }} />
      <p className="settings-help">JPEG、PNG、WebP、GIF。1枚 {(MAX_BACKGROUND_FILE_SIZE / 1024 / 1024).toFixed(0)}MB以下、最大{MAX_CUSTOM_BACKGROUNDS}枚。</p>
      {hiddenBuiltInOptions.length > 0 && <details className="background-library"><summary>非表示の初期画像を管理する</summary><p className="settings-help">非表示にした初期画像を再表示できます。</p><div className="background-manager" aria-label="非表示の初期画像">{hiddenBuiltInOptions.map((option) => <article className="background-manager__item--hidden" key={option.value}><span>{option.label}<small>非表示中</small></span><div><button type="button" aria-label={`${option.label}を表示`} onClick={() => setBackgroundVisibility(option.value, true)}>表示</button></div></article>)}</div></details>}
      {customBackgrounds.length > 0 && <details className="background-library"><summary>追加画像を管理する</summary><p className="settings-help">{(customSize / 1024 / 1024).toFixed(1)}MB使用中。矢印で表示順を変更できます。</p><div className="background-manager" aria-label="追加した背景画像">{customBackgrounds.map((item, index) => { return <article key={item.id}><img src={item.url} alt="" /><span>{item.name}</span><div><button type="button" aria-label={`${item.name}を削除`} onClick={() => removeBackground(item.id, item.name)}>削除</button><button type="button" aria-label={`${item.name}を前へ`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`${item.name}を後へ`} disabled={index === customBackgrounds.length - 1} onClick={() => move(index, 1)}>↓</button></div></article>; })}</div></details>}
      {frameSettingsOpen && settings.backgroundChoice !== "slideshow" && <section id="background-frame-settings" className="background-frame-settings" aria-labelledby="background-frame-heading">
        <div className="background-frame-settings__heading"><div><h4 id="background-frame-heading">この背景を設定</h4><p>プレビューを見ながら、背景の位置と拡大を調整できます。</p></div></div>
        <div className="background-frame-current" aria-live="polite"><span className="background-frame-current__preview" style={{ backgroundImage: `url(${frameOptions.find((option) => option.value === frameTarget)?.imageUrl ?? frameOptions[0]?.imageUrl})` }} /><div><small>調整対象</small><strong>{frameOptions.find((option) => option.value === frameTarget)?.label ?? "モーニング"}</strong></div></div>
        <div className="settings-callout background-frame-settings__guide"><strong>プレビューを直接動かせます</strong><span>「この背景を調整」を押すと、iPadでは小さなツールバーを残したまま、スマホでは全画面で背景をドラッグ・ピンチできます。PCではホイールや矢印キーも使えます。</span></div>
        <button className="primary-button background-frame-settings__close" type="button" onClick={onStartBackgroundEditing}>この背景を調整</button>
        <details className="background-advanced"><summary>位置と拡大</summary><div className="background-advanced__content"><Range id="background-scale" label="背景の拡大" value={frame.scale} {...settingRanges.backgroundScale} initial={defaultSettings.backgroundScale} onChange={(backgroundScale) => onChange({ backgroundScale })} /><Range id="background-position-x" label="背景の左右位置" value={Math.round(frame.position.x * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.backgroundPosition.x * 100} onChange={(value) => onChange({ backgroundPosition: { ...frame.position, x: value / 100 } })} /><Range id="background-position-y" label="背景の上下位置" value={Math.round(frame.position.y * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.backgroundPosition.y * 100} onChange={(value) => onChange({ backgroundPosition: { ...frame.position, y: value / 100 } })} /></div></details>
      </section>}
    </section>
    <section className="background-global-settings" aria-labelledby="background-global-heading"><div className="background-settings-heading"><div><h4 id="background-global-heading">画面全体の設定</h4><p>画像の上に重ねる色と、自動切替の間隔を設定します。</p></div></div><Range id="overlay" label="背景を暗くする" value={Math.round(settings.overlayOpacity * 100)} {...settingRanges.overlayOpacity} initial={Math.round(defaultSettings.overlayOpacity * 100)} onChange={(value) => onChange({ overlayOpacity: value / 100 })} />{settings.backgroundChoice === "slideshow" && <Range id="slideshow" label="背景切り替え時間" value={settings.slideshowIntervalSec} {...settingRanges.slideshowIntervalSec} initial={defaultSettings.slideshowIntervalSec} onChange={(slideshowIntervalSec) => onChange({ slideshowIntervalSec })} />}</section>
  </>;
}

export function SettingsPanel({ open, settings, orientation, saveState, onChange: applySettings, onUndo, onClose, onStartBackgroundEditing, fullscreenSupported, onFullscreenToggle, onResetSettings, onClearTimer, onMessage, adaptivePalette, customBackgrounds, onAddBackgrounds, onRemoveBackground, onReorderBackgrounds }: Props) {
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
  const customSize = customBackgrounds.reduce((total, item) => total + item.blob.size, 0);
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
    <header className="settings-header"><div><p className="eyebrow">FOCUSBOARD</p><h2 id="settings-title">設定</h2></div><div className={`save-state save-state--${saveState}`} role="status">{saveState === "saving" ? "保存中" : saveState === "failed" ? "保存失敗" : "保存済み"}</div><button className="icon-button" type="button" aria-label="設定を閉じる" title="設定を閉じる" onClick={onClose} ref={closeRef}>×</button></header>
    <nav className="settings-tabs" aria-label="設定カテゴリー" role="tablist">{categories.map((item) => <button id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={category === item.id} aria-controls="settings-category-panel" className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)} key={item.id}><SettingsCategoryIcon category={item.id} /><span>{item.label}</span></button>)}</nav>
    <div className="settings-content"><section id="settings-category-panel" className="settings-section" role="tabpanel" aria-labelledby={`settings-tab-${category}`} tabIndex={0}><div className="section-heading"><h3 id="category-title">{sectionTitle}</h3>{category !== "data" && <button className="text-button" type="button" onClick={() => resetSection(resetPatches[category])}>初期値に戻す</button>}</div>
      {category === "background" && <BackgroundSettings settings={settings} frame={backgroundFrame} customBackgrounds={customBackgrounds} customSize={customSize} frameOptions={frameOptions} frameTarget={frameTarget} onFrameTargetChange={(target) => { setFrameTarget(target); onChange({ backgroundChoice: target }); }} onStartBackgroundEditing={onStartBackgroundEditing} onChange={onChange} uploads={uploads} move={move} onRemoveBackground={onRemoveBackground} />}
      {category === "display" && <><Toggle id="show-clock" label="時計を表示" checked={settings.showClock} onChange={(showClock) => onChange({ showClock })} /><Toggle id="show-date" label="日付を表示" checked={settings.showDate} onChange={(showDate) => onChange({ showDate })} /><Toggle id="fullscreen" label="全画面表示" checked={settings.fullscreen} disabled={!fullscreenSupported} onChange={(fullscreen) => { void onFullscreenToggle(fullscreen); }} /><p className="settings-help">表示するものは、画面にすぐ反映されます。</p><Disclosure label="カラーテーマ"><p className="settings-help">時計・日付・タイマーの色をまとめて変更します。</p><div className="choice-grid" role="radiogroup" aria-label="カラーテーマ">{(Object.entries(colorPresets) as [Exclude<ColorPreset, "custom">, typeof colorPresets.sky][]).map(([id, preset]) => <button type="button" role="radio" aria-checked={settings.colorPreset === id} className={settings.colorPreset === id ? "is-selected" : ""} onClick={() => applyTheme(id)} key={id}><i style={{ background: preset.accent }} />{preset.label}</button>)}<button type="button" role="radio" aria-checked={settings.colorPreset === "custom"} className={settings.colorPreset === "custom" ? "is-selected" : ""} onClick={() => onChange({ colorPreset: "custom" })}>カスタム</button></div></Disclosure></>}
      {category === "display" && <Disclosure label="時計・日付の見やすさ"><div className="color-setting-group"><h4>時計・日付の色</h4><p>背景ごとに色と自動調整を設定できます。</p><div className="clock-color-preview" style={{ backgroundImage: `linear-gradient(rgba(241,247,255,${settings.overlayOpacity}), rgba(241,247,255,${settings.overlayOpacity})), url(${frameOptions.find((option) => option.value === clockTarget)?.imageUrl ?? frameOptions[0]?.imageUrl ?? ""})` }}><span style={{ color: clockBackgroundSetting.matchColors ? adaptivePalette.text : clockBackgroundSetting.color }}>12:34</span><small>現在の背景でプレビュー</small></div><Toggle id="match-clock-colors" label="自動調整" checked={clockBackgroundSetting.matchColors} onChange={(matchClockBackgroundColors) => { if (clockTarget) updateClockSetting({ matchColors: matchClockBackgroundColors }); else onChange({ matchClockBackgroundColors }); }} />{clockBackgroundSetting.matchColors ? <small className="color-setting-group__note">明るい文字／暗い文字を背景に合わせて自動調整します。{adaptivePalette.textContrast < 4.5 ? "読みやすさが不足するため補正を推奨します。" : "読みやすさを確認済みです。"}</small> : <ClockColorChoices value={clockBackgroundSetting.color} themeColor={settings.colorPreset !== "custom" ? colorPresets[settings.colorPreset].text : defaultSettings.clockColor} backgroundImage={frameOptions.find((option) => option.value === clockTarget)?.imageUrl} overlayOpacity={settings.overlayOpacity} onChange={(color) => { updateClockSetting({ color }); onChange({ colorPreset: "custom" }); }} />}<Disclosure label="背景ごとの設定"><label className="background-frame-settings__target" htmlFor="clock-background-target">設定する背景<select id="clock-background-target" value={clockTarget} onChange={(event) => setClockTarget(event.target.value as BackgroundFrameTarget | "")}><option value="">背景を選択</option>{frameOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><div className="orientation-picker"><span className="setting-label">設定する画面の向き</span><div role="radiogroup" aria-label="設定する画面の向き">{orientations.map((item) => <button type="button" role="radio" aria-checked={positionOrientation === item} className={positionOrientation === item ? "is-selected" : ""} onClick={() => setPositionOrientation(item)} key={item}>{orientationLabels[item]}</button>)}</div><small>現在は{orientationLabels[orientation]}です。向きを変えたときも別の位置を保てます。</small></div><Range id="clock-position-x" label="時計の左右位置" value={Math.round(clockPosition.x * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.clockDatePosition.x * 100} onChange={(value) => updateClockPosition({ ...clockPosition, x: value / 100 })} /><Range id="clock-position-y" label="時計の上下位置" value={Math.round(clockPosition.y * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.clockDatePosition.y * 100} onChange={(value) => updateClockPosition({ ...clockPosition, y: value / 100 })} /></Disclosure></div><Disclosure label="表示形式とサイズ"><Toggle id="use-12-hour" label="12時間表示" checked={settings.use12Hour} onChange={(use12Hour) => onChange({ use12Hour })} /><Toggle id="show-seconds" label="秒を表示" checked={settings.showSeconds} onChange={(showSeconds) => onChange({ showSeconds })} /><div className="setting-control"><label htmlFor="date-format-preset">日付の形式</label><select id="date-format-preset" value={dateFormatPresets.some((preset) => preset.value === settings.dateFormat) ? settings.dateFormat : "custom"} onChange={(event) => onChange({ dateFormat: event.target.value === "custom" ? customDateFormatExample : event.target.value })}><option value="custom">カスタム</option>{dateFormatPresets.map((preset) => <option value={preset.value} key={preset.value}>{preset.label}</option>)}</select>{!dateFormatPresets.some((preset) => preset.value === settings.dateFormat) && <><label className="sub-label" htmlFor="date-format">カスタム形式</label><input id="date-format" className="text-input" type="text" value={settings.dateFormat} maxLength={40} onChange={(event) => onChange({ dateFormat: event.target.value })} /><small>yyyy / yy、mm / m、dd / d、weekday（曜日）、weekdayShort（短い曜日）が使えます。</small></>}</div><Range id="clock-size" label="時計サイズ" value={settings.clockFontSize} {...settingRanges.clockFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.clockFontSize, settingRanges.clockFontSize.min, settingRanges.clockFontSize.max)} rangeText="小さめから大きめまで調整できます。" initial={defaultSettings.clockFontSize} onChange={(clockFontSize) => onChange({ clockFontSize })} /><Range id="date-size" label="日付サイズ" value={settings.dateFontSize} {...settingRanges.dateFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.dateFontSize, settingRanges.dateFontSize.min, settingRanges.dateFontSize.max)} rangeText="小さめから大きめまで調整できます。" initial={defaultSettings.dateFontSize} onChange={(dateFontSize) => onChange({ dateFontSize })} /><p className="settings-help">時計と日付は画面上でドラッグして移動できます。</p></Disclosure></Disclosure>}
      {category === "display" && <div className="setting-control"><span className="setting-label">フォント</span><div className="choice-grid" role="radiogroup">{fonts.map((font) => <button type="button" role="radio" aria-checked={settings.fontFamily === font.value} className={settings.fontFamily === font.value ? "is-selected" : ""} style={{ fontFamily: fontOptions[font.value] }} onClick={() => onChange({ fontFamily: font.value })} key={font.value}>{font.label}</button>)}</div></div>}
      {category === "timer" && <><Toggle id="show-timer" label="タイマーを表示" checked={settings.showTimer} onChange={(showTimer) => onChange({ showTimer })} /><div className="color-setting-group"><h4>タイマー</h4><p>進捗表示と操作ボタンの色を設定します。</p><Toggle id="match-timer-colors" label="背景に合わせて自動調整" checked={settings.matchTimerBackgroundColors} onChange={(matchTimerBackgroundColors) => onChange({ matchTimerBackgroundColors })} />{settings.matchTimerBackgroundColors ? <small className="color-setting-group__note">背景の明るさと色から、タイマーを見やすく調整します。</small> : <ColorSetting id="timer-color" label="タイマーのアクセント色" value={settings.timerColor} disabled={false} onChange={(timerColor) => onChange({ timerColor, colorPreset: "custom" })} />}</div><Disclosure label="タイマーの表示と配置"><Range id="timer-size" label="タイマーサイズ" value={settings.timerFontSize} {...settingRanges.timerFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.timerFontSize, settingRanges.timerFontSize.min, settingRanges.timerFontSize.max)} rangeText="小さめから大きめまで調整できます。" initial={defaultSettings.timerFontSize} onChange={(timerFontSize) => onChange({ timerFontSize })} /><Range id="timer-opacity" label="タイマー背景の不透明度" value={Math.round(settings.timerBackgroundOpacity * 100)} {...settingRanges.timerBackgroundOpacity} initial={Math.round(defaultSettings.timerBackgroundOpacity * 100)} onChange={(value) => onChange({ timerBackgroundOpacity: value / 100 })} /><div className="orientation-picker"><span className="setting-label">設定する画面の向き</span><div role="radiogroup" aria-label="タイマーを設定する画面の向き">{orientations.map((item) => <button type="button" role="radio" aria-checked={positionOrientation === item} className={positionOrientation === item ? "is-selected" : ""} onClick={() => setPositionOrientation(item)} key={item}>{orientationLabels[item]}</button>)}</div><small>現在は{orientationLabels[orientation]}です。</small></div><PositionGrid label="開始前タイマーの配置" value={settings.timerPositions[positionOrientation]} onChange={(timerPosition) => onChange({ timerPosition, timerPositions: { ...settings.timerPositions, [positionOrientation]: timerPosition } })} /></Disclosure></>}
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
