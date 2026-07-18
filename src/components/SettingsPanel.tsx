import { useEffect, useRef, useState } from "react";
import { colorPresets, dateFormatPresets, defaultSettings, describeFontSize, fontOptions, positionPresets, settingRanges, type AppSettings, type BackgroundChoice, type BackgroundFrame, type ColorPreset, type FontOption, type PositionPreset } from "../types/settings";
import type { CustomBackground } from "../utils/backgroundStorage";
import { MAX_BACKGROUND_FILE_SIZE, MAX_CUSTOM_BACKGROUNDS } from "../utils/backgroundStorage";
import { defaultBackgrounds } from "./BackgroundSlideshow";
import { BackgroundFrameEditor } from "./BackgroundFrameEditor";
import { ResetPanel } from "./ResetPanel";
import { downloadSettingsExport } from "../utils/settingsExport";
import { appVersion } from "../utils/appVersion";

type Category = "display" | "background" | "clock" | "timer" | "pomodoro" | "accessibility" | "data";
type BackgroundFrameTarget = Exclude<BackgroundChoice, "slideshow">;
type Props = {
  open: boolean; settings: AppSettings; saveState: "saved" | "saving" | "failed";
  onChange: (patch: Partial<AppSettings>) => void; onUndo: () => boolean; onClose: () => void;
  fullscreenSupported: boolean; onFullscreenToggle: (enabled: boolean) => Promise<void>;
  onResetSettings: () => void; onClearTimer: () => void; onMessage: (message: string) => void;
  customBackgrounds: CustomBackground[]; onAddBackgrounds: (files: File[]) => Promise<CustomBackground[]>;
  onRemoveBackground: (id: string) => Promise<void>; onReorderBackgrounds: (ids: string[]) => Promise<void>;
};

const categories: { id: Category; label: string }[] = [
  { id: "display", label: "表示" }, { id: "background", label: "背景" }, { id: "clock", label: "時計と日付" },
  { id: "timer", label: "タイマー" }, { id: "pomodoro", label: "ポモドーロ" }, { id: "accessibility", label: "アクセシビリティ" }, { id: "data", label: "データ管理" }
];
const positionLabels: Record<PositionPreset, string> = { "top-left": "左上", top: "上", "top-right": "右上", left: "左", center: "中央", right: "右", "bottom-left": "左下", bottom: "下", "bottom-right": "右下" };
const positionGrid: PositionPreset[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
const fonts: { value: FontOption; label: string }[] = [{ value: "system", label: "システム" }, { value: "rounded", label: "丸ゴシック" }, { value: "serif", label: "明朝" }, { value: "mono", label: "等幅" }];
const customDateFormatExample = "yyyy/mm/dd (weekdayShort)";
const builtInBackgroundLabels = ["モーニング", "ラベンダー", "スカイ"];

function Toggle({ id, label, checked, disabled = false, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <div className="setting-row"><label htmlFor={id}>{label}</label><input id={id} className="toggle" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></div>;
}
function Range({ id, label, value, min, max, step, unit, initial, formatValue, rangeText, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; unit: string; initial: number; formatValue?: (value: number) => string; rangeText?: string; onChange: (value: number) => void }) {
  const input = (next: string) => { const value = Number(next); if (Number.isFinite(value)) onChange(Math.min(max, Math.max(min, value))); };
  return <div className="setting-control range-control"><label htmlFor={id}>{label}<output>{formatValue ? formatValue(value) : `${value}${unit}`}</output></label><div className="range-control__inputs"><input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} onChange={(event) => input(event.target.value)} /><input className="number-input" aria-label={`${label}の数値`} type="number" min={min} max={max} step={step} value={value} onChange={(event) => input(event.target.value)} />{unit && <span>{unit}</span>}<button type="button" className="reset-value" aria-label={`${label}を初期値に戻す`} onClick={() => onChange(initial)}>戻す</button></div><small>{rangeText ?? `範囲: ${min}〜${max}${unit}`}</small></div>;
}
function PositionGrid({ label, value, onChange }: { label: string; value: PositionPreset; onChange: (value: PositionPreset) => void }) {
  const [focus, setFocus] = useState(value);
  return <div className="setting-control"><span className="setting-label">{label}</span><div className="position-grid" role="radiogroup" aria-label={label} onKeyDown={(event) => { const index = positionGrid.indexOf(focus); const movement = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 3 : event.key === "ArrowUp" ? -3 : 0; if (!movement) return; event.preventDefault(); const next = positionGrid[(index + movement + 9) % 9]; setFocus(next); onChange(next); document.getElementById(`position-${next}`)?.focus(); }}>
    {positionGrid.map((position) => <button id={`position-${position}`} type="button" role="radio" aria-label={positionLabels[position]} aria-checked={value === position} className={`position-grid__cell${value === position ? " is-selected" : ""}`} onFocus={() => setFocus(position)} onClick={() => onChange(position)} key={position}><i aria-hidden="true" /></button>)}
  </div><small>矢印キーでも移動できます。</small></div>;
}

type BackgroundFrameOption = { value: BackgroundFrameTarget; label: string };
type BackgroundSettingsProps = {
  settings: AppSettings;
  customBackgrounds: CustomBackground[];
  customSize: number;
  frameOptions: BackgroundFrameOption[];
  frameTarget: BackgroundFrameTarget;
  backgroundFrame: BackgroundFrame;
  backgroundPreviewPath: string;
  onFrameTargetChange: (target: BackgroundFrameTarget) => void;
  onChange: (patch: Partial<AppSettings>) => void;
  uploads: (files: FileList | null) => Promise<void>;
  move: (index: number, amount: number) => void;
  onRemoveBackground: (id: string) => Promise<void>;
};

function BackgroundSettings({ settings, customBackgrounds, customSize, frameOptions, frameTarget, backgroundFrame, backgroundPreviewPath, onFrameTargetChange, onChange, uploads, move, onRemoveBackground }: BackgroundSettingsProps) {
  const sourceOptions: { value: BackgroundChoice; label: string; imageUrl?: string }[] = [
    { value: "slideshow", label: "自動切替" },
    ...defaultBackgrounds.map((path, index) => ({ value: `bg${index + 1}` as BackgroundChoice, label: builtInBackgroundLabels[index], imageUrl: `${import.meta.env.BASE_URL}${path}` })),
    ...customBackgrounds.map((item) => ({ value: `custom:${item.id}` as BackgroundChoice, label: item.name, imageUrl: item.url }))
  ];

  return <>
    <section className="background-source-settings" aria-labelledby="background-source-heading">
      <div className="background-settings-heading"><div><h4 id="background-source-heading">表示する背景</h4><p>固定表示する画像、または自動切替を選びます。</p></div><span className="background-settings-count">{customBackgrounds.length}枚追加済み</span></div>
      <div className="background-picker" role="radiogroup" aria-label="背景を選択">
        {sourceOptions.map((option) => <div className="background-option-wrap" key={option.value}>
          <button type="button" role="radio" aria-checked={settings.backgroundChoice === option.value} className={`background-option${settings.backgroundChoice === option.value ? " background-option--active" : ""}`} onClick={() => onChange({ backgroundChoice: option.value })}>
            <span className={`background-option__preview${option.value === "slideshow" ? " background-option__preview--auto" : ""}`} style={option.imageUrl ? { backgroundImage: `url(${option.imageUrl})` } : undefined} />
            <span className="background-option__label">{option.label}</span>
          </button>
          {option.value.startsWith("custom:") && <button type="button" className="background-option__delete" aria-label={`${option.label}を削除`} onClick={() => { if (window.confirm(`${option.label}を削除しますか？`)) void onRemoveBackground(option.value.slice("custom:".length)); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3m-9 0 1 14h8l1-14" /></svg></button>}
        </div>)}
      </div>
      <label className="background-upload" htmlFor="background-upload">端末から画像を追加</label>
      <input id="background-upload" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { void uploads(event.target.files); event.target.value = ""; }} />
      <p className="settings-help">JPEG、PNG、WebP、GIF。1枚 {(MAX_BACKGROUND_FILE_SIZE / 1024 / 1024).toFixed(0)}MB以下、最大{MAX_CUSTOM_BACKGROUNDS}枚。</p>
      {customBackgrounds.length > 0 && <details className="background-library"><summary>追加画像を管理する</summary><p className="settings-help">{(customSize / 1024 / 1024).toFixed(1)}MB使用中。矢印で表示順を変更できます。</p><div className="background-manager" aria-label="追加した背景画像">{customBackgrounds.map((item, index) => <article key={item.id}><img src={item.url} alt="" /><span>{item.name}</span><div><button type="button" aria-label={`${item.name}を前へ`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`${item.name}を後へ`} disabled={index === customBackgrounds.length - 1} onClick={() => move(index, 1)}>↓</button></div></article>)}</div></details>}
    </section>
    <section className="background-frame-settings" aria-labelledby="background-frame-heading">
      <div className="background-frame-settings__heading"><div><h4 id="background-frame-heading">画像ごとの表示</h4><p>調整する画像を選び、プレビュー上で移動・拡大できます。</p></div><label htmlFor="background-frame-target">調整する画像<select id="background-frame-target" aria-label="配置を調整する背景" value={frameTarget} onChange={(event) => onFrameTargetChange(event.target.value as BackgroundFrameTarget)}>{frameOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label></div>
      <BackgroundFrameEditor imageUrl={backgroundPreviewPath} imageName={frameOptions.find((option) => option.value === frameTarget)?.label ?? "背景画像"} position={backgroundFrame.position} scale={backgroundFrame.scale} onChange={(backgroundPosition, backgroundScale) => onChange({ backgroundPosition, backgroundScale })} />
      <details className="background-advanced"><summary>スライダーで微調整</summary><div className="background-advanced__content"><Range id="background-scale" label="背景の拡大" value={settings.backgroundScale} {...settingRanges.backgroundScale} initial={defaultSettings.backgroundScale} onChange={(backgroundScale) => onChange({ backgroundScale })} /><Range id="background-position-x" label="背景の左右位置" value={Math.round(settings.backgroundPosition.x * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.backgroundPosition.x * 100} onChange={(value) => onChange({ backgroundPosition: { ...settings.backgroundPosition, x: value / 100 } })} /><Range id="background-position-y" label="背景の上下位置" value={Math.round(settings.backgroundPosition.y * 100)} min={0} max={100} step={1} unit="%" initial={defaultSettings.backgroundPosition.y * 100} onChange={(value) => onChange({ backgroundPosition: { ...settings.backgroundPosition, y: value / 100 } })} /></div></details>
    </section>
    <section className="background-global-settings" aria-labelledby="background-global-heading"><div className="background-settings-heading"><div><h4 id="background-global-heading">画面全体の設定</h4><p>画像の上に重ねる色と、自動切替の間隔を設定します。</p></div></div><Range id="overlay" label="背景オーバーレイ" value={Math.round(settings.overlayOpacity * 100)} {...settingRanges.overlayOpacity} initial={Math.round(defaultSettings.overlayOpacity * 100)} onChange={(value) => onChange({ overlayOpacity: value / 100 })} />{settings.backgroundChoice === "slideshow" && <Range id="slideshow" label="背景切り替え時間" value={settings.slideshowIntervalSec} {...settingRanges.slideshowIntervalSec} initial={defaultSettings.slideshowIntervalSec} onChange={(slideshowIntervalSec) => onChange({ slideshowIntervalSec })} />}</section>
  </>;
}

export function SettingsPanel({ open, settings, saveState, onChange: applySettings, onUndo, onClose, fullscreenSupported, onFullscreenToggle, onResetSettings, onClearTimer, onMessage, customBackgrounds, onAddBackgrounds, onRemoveBackground, onReorderBackgrounds }: Props) {
  const drawerRef = useRef<HTMLElement>(null); const closeRef = useRef<HTMLButtonElement>(null); const [category, setCategory] = useState<Category>("display"); const [frameTarget, setFrameTarget] = useState<BackgroundFrameTarget>("bg1");
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; closeRef.current?.focus(); const keys = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); if (event.key !== "Tab" || !drawerRef.current) return; const nodes = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]; const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }; document.addEventListener("keydown", keys); return () => { document.removeEventListener("keydown", keys); previous?.focus(); }; }, [open, onClose]);
  useEffect(() => { if (settings.backgroundChoice !== "slideshow") setFrameTarget(settings.backgroundChoice); }, [settings.backgroundChoice]);
  useEffect(() => {
    if (frameTarget.startsWith("custom:") && !customBackgrounds.some((item) => `custom:${item.id}` === frameTarget)) setFrameTarget("bg1");
  }, [customBackgrounds, frameTarget]);
  useEffect(() => {
    const frame = settings.backgroundFrames[frameTarget];
    const fallback = Object.keys(settings.backgroundFrames).length === 0
      ? { scale: settings.backgroundScale, position: settings.backgroundPosition }
      : defaultSettings.backgroundFrames[frameTarget] ?? { scale: defaultSettings.backgroundScale, position: defaultSettings.backgroundPosition };
    const next = frame ?? fallback;
    if (settings.backgroundScale === next.scale && settings.backgroundPosition.x === next.position.x && settings.backgroundPosition.y === next.position.y) return;
    applySettings({ backgroundScale: next.scale, backgroundPosition: next.position });
  }, [applySettings, frameTarget, settings.backgroundFrames, settings.backgroundPosition, settings.backgroundScale]);
  if (!open) return null;
  const uploads = async (files: FileList | null) => { if (!files?.length) return; const created = await onAddBackgrounds([...files]); if (created[0]) { const target = `custom:${created[0].id}` as BackgroundFrameTarget; setFrameTarget(target); onChange({ backgroundChoice: target }); } };
  const resetSection = (patch: Partial<AppSettings>) => { onChange(category === "clock" ? { ...patch, dateFormat: defaultSettings.dateFormat } : category === "background" ? { ...patch, backgroundFrames: defaultSettings.backgroundFrames } : patch); onMessage("この項目を初期値に戻しました。"); };
  const exportSettings = () => { onMessage(downloadSettingsExport(settings) ? "設定をJSONファイルに保存しました。" : "設定をエクスポートできませんでした。"); };
  const customSize = customBackgrounds.reduce((total, item) => total + item.blob.size, 0);
  const frameOptions: { value: BackgroundFrameTarget; label: string }[] = [
    ...builtInBackgroundLabels.map((label, index) => ({ value: `bg${index + 1}` as BackgroundFrameTarget, label })),
    ...customBackgrounds.map((item) => ({ value: `custom:${item.id}` as BackgroundFrameTarget, label: item.name }))
  ];
  const backgroundFrame: BackgroundFrame = settings.backgroundFrames[frameTarget]
    ?? (Object.keys(settings.backgroundFrames).length === 0
      ? { scale: settings.backgroundScale, position: settings.backgroundPosition }
      : defaultSettings.backgroundFrames[frameTarget] ?? { scale: defaultSettings.backgroundScale, position: defaultSettings.backgroundPosition });
  const backgroundPreviewPath = frameTarget.startsWith("custom:")
    ? customBackgrounds.find((item) => `custom:${item.id}` === frameTarget)?.url ?? `${import.meta.env.BASE_URL}${defaultBackgrounds[0]}`
    : `${import.meta.env.BASE_URL}${defaultBackgrounds[Number(frameTarget.slice(2)) - 1] ?? defaultBackgrounds[0]}`;
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
    <header className="settings-header"><div><p className="eyebrow">FOCUSBOARD</p><h2 id="settings-title">設定</h2></div><div className={`save-state save-state--${saveState}`} role="status">{saveState === "saving" ? "保存中" : saveState === "failed" ? "保存失敗" : "自動保存済み"}</div><button className="icon-button" type="button" aria-label="設定を閉じる" onClick={onClose} ref={closeRef}>×</button></header>
    <nav className="settings-tabs" aria-label="設定カテゴリー" role="tablist">{categories.map((item) => <button type="button" role="tab" aria-selected={category === item.id} className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)} key={item.id}>{item.label}</button>)}</nav>
    <div className="settings-content"><section className="settings-section" aria-labelledby="category-title"><div className="section-heading"><h3 id="category-title">{sectionTitle}</h3>{category !== "accessibility" && category !== "data" && <button className="text-button" type="button" onClick={() => { const map: Record<Exclude<Category, "accessibility" | "data">, Partial<AppSettings>> = { display: { showClock: defaultSettings.showClock, showDate: defaultSettings.showDate, showTimer: defaultSettings.showTimer, fullscreen: defaultSettings.fullscreen, fontFamily: defaultSettings.fontFamily, colorPreset: defaultSettings.colorPreset, matchBackgroundColors: defaultSettings.matchBackgroundColors }, background: { backgroundChoice: defaultSettings.backgroundChoice, overlayOpacity: defaultSettings.overlayOpacity, backgroundScale: defaultSettings.backgroundScale, backgroundPosition: defaultSettings.backgroundPosition, slideshowIntervalSec: defaultSettings.slideshowIntervalSec }, clock: { use12Hour: defaultSettings.use12Hour, showSeconds: defaultSettings.showSeconds, clockFontSize: defaultSettings.clockFontSize, dateFontSize: defaultSettings.dateFontSize }, timer: { timerFontSize: defaultSettings.timerFontSize, timerBackgroundOpacity: defaultSettings.timerBackgroundOpacity, timerPosition: defaultSettings.timerPosition }, pomodoro: { workMinutes: defaultSettings.workMinutes, shortBreakMinutes: defaultSettings.shortBreakMinutes, longBreakMinutes: defaultSettings.longBreakMinutes, soundEnabled: defaultSettings.soundEnabled } }; resetSection(map[category]); }}>初期値に戻す</button>}</div>
      {category === "display" && <><Toggle id="show-clock" label="時計を表示" checked={settings.showClock} onChange={(showClock) => onChange({ showClock })} /><Toggle id="show-date" label="日付を表示" checked={settings.showDate} onChange={(showDate) => onChange({ showDate })} /><Toggle id="show-timer" label="タイマーを表示" checked={settings.showTimer} onChange={(showTimer) => onChange({ showTimer })} /><Toggle id="fullscreen" label="全画面表示" checked={settings.fullscreen} disabled={!fullscreenSupported} onChange={(fullscreen) => { void onFullscreenToggle(fullscreen); }} /><p className="settings-help">時計やタイマーを画面いっぱいに表示します。対応していないブラウザでは利用できません。</p><div className="setting-control"><span className="setting-label">フォント</span><div className="choice-grid" role="radiogroup">{fonts.map((font) => <button type="button" role="radio" aria-checked={settings.fontFamily === font.value} className={settings.fontFamily === font.value ? "is-selected" : ""} style={{ fontFamily: fontOptions[font.value] }} onClick={() => onChange({ fontFamily: font.value })} key={font.value}>{font.label}</button>)}</div></div><Toggle id="match-colors" label="時計の位置に合わせて色を調整" checked={settings.matchBackgroundColors} onChange={(matchBackgroundColors) => onChange({ matchBackgroundColors })} />{settings.matchBackgroundColors && <p className="settings-help">時計付近の背景色を見て、読みやすい文字色に自動調整します。</p>}{!settings.matchBackgroundColors && <div className="setting-control"><span className="setting-label">カラーテーマ</span><div className="choice-grid" role="radiogroup" aria-label="カラーテーマ">{(Object.entries(colorPresets) as [Exclude<ColorPreset, "custom">, typeof colorPresets.sky][]).map(([id, preset]) => <button type="button" role="radio" aria-checked={settings.colorPreset === id} className={settings.colorPreset === id ? "is-selected" : ""} onClick={() => onChange({ colorPreset: id })} key={id}><i style={{ background: preset.accent }} />{preset.label}</button>)}<button type="button" role="radio" aria-checked={settings.colorPreset === "custom"} className={settings.colorPreset === "custom" ? "is-selected" : ""} onClick={() => onChange({ colorPreset: "custom" })}>カスタム</button></div>{settings.colorPreset === "custom" && <div className="custom-color-fields"><div className="setting-row"><label htmlFor="text-color">文字色</label><input id="text-color" className="color-input" type="color" value={settings.textColor} onChange={(event) => onChange({ textColor: event.target.value })} /></div><div className="setting-row"><label htmlFor="accent-color">アクセント色</label><input id="accent-color" className="color-input" type="color" value={settings.accentColor} onChange={(event) => onChange({ accentColor: event.target.value })} /></div></div>}</div>}</>}
      {category === "clock" && <><Toggle id="use-12-hour" label="12時間表示" checked={settings.use12Hour} onChange={(use12Hour) => onChange({ use12Hour })} /><Toggle id="show-seconds" label="秒を表示" checked={settings.showSeconds} onChange={(showSeconds) => onChange({ showSeconds })} /><div className="setting-control"><label htmlFor="date-format-preset">日付の形式</label><select id="date-format-preset" value={dateFormatPresets.some((preset) => preset.value === settings.dateFormat) ? settings.dateFormat : "custom"} onChange={(event) => onChange({ dateFormat: event.target.value === "custom" ? customDateFormatExample : event.target.value })}><option value="custom">カスタム</option>{dateFormatPresets.map((preset) => <option value={preset.value} key={preset.value}>{preset.label}</option>)}</select>{!dateFormatPresets.some((preset) => preset.value === settings.dateFormat) && <><label className="sub-label" htmlFor="date-format">カスタム形式</label><input id="date-format" className="text-input" type="text" value={settings.dateFormat} maxLength={40} onChange={(event) => onChange({ dateFormat: event.target.value })} /><small>yyyy / yy、mm / m、dd / d、weekday（曜日）、weekdayShort（短い曜日）が使えます。</small></>}</div><Range id="clock-size" label="時計サイズ" value={settings.clockFontSize} {...settingRanges.clockFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.clockFontSize, settingRanges.clockFontSize.min, settingRanges.clockFontSize.max)} rangeText="小さめから大きめまで調整できます。" initial={defaultSettings.clockFontSize} onChange={(clockFontSize) => onChange({ clockFontSize })} /><Range id="date-size" label="日付サイズ" value={settings.dateFontSize} {...settingRanges.dateFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.dateFontSize, settingRanges.dateFontSize.min, settingRanges.dateFontSize.max)} rangeText="小さめから大きめまで調整できます。" initial={defaultSettings.dateFontSize} onChange={(dateFontSize) => onChange({ dateFontSize })} /><p className="settings-help">時計と日付は画面上でドラッグして移動できます。</p></>}
      {category === "timer" && <><Range id="timer-size" label="タイマーサイズ" value={settings.timerFontSize} {...settingRanges.timerFontSize} unit="" formatValue={(value) => describeFontSize(value, defaultSettings.timerFontSize, settingRanges.timerFontSize.min, settingRanges.timerFontSize.max)} rangeText="小さめから大きめまで調整できます。" initial={defaultSettings.timerFontSize} onChange={(timerFontSize) => onChange({ timerFontSize })} /><Range id="timer-opacity" label="タイマー背景の不透明度" value={Math.round(settings.timerBackgroundOpacity * 100)} {...settingRanges.timerBackgroundOpacity} initial={Math.round(defaultSettings.timerBackgroundOpacity * 100)} onChange={(value) => onChange({ timerBackgroundOpacity: value / 100 })} /><PositionGrid label="開始前タイマーの配置" value={settings.timerPosition} onChange={(timerPosition) => onChange({ timerPosition })} /></>}
      {category === "pomodoro" && <><Range id="work" label="作業時間" value={settings.workMinutes} {...settingRanges.workMinutes} initial={defaultSettings.workMinutes} onChange={(workMinutes) => onChange({ workMinutes })} /><Range id="short-break" label="短い休憩" value={settings.shortBreakMinutes} {...settingRanges.shortBreakMinutes} initial={defaultSettings.shortBreakMinutes} onChange={(shortBreakMinutes) => onChange({ shortBreakMinutes })} /><Range id="long-break" label="長い休憩" value={settings.longBreakMinutes} {...settingRanges.longBreakMinutes} initial={defaultSettings.longBreakMinutes} onChange={(longBreakMinutes) => onChange({ longBreakMinutes })} /><Toggle id="sound" label="終了音" checked={settings.soundEnabled} onChange={(soundEnabled) => onChange({ soundEnabled })} /></>}
      {category === "accessibility" && <div className="settings-callout"><strong>見やすさと操作性</strong><span>キーボード操作、44px以上の操作領域、フォーカス表示、アニメーション軽減設定を常に適用しています。端末の「視差効果を減らす」設定にも追従します。</span></div>}
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
          </section>
        </div>
        <div className="data-undo"><div><strong>変更履歴</strong><span>直前の設定変更だけ元に戻せます。</span></div><button className="secondary-button" type="button" onClick={() => onUndo() ? onMessage("直前の変更を元に戻しました。") : onMessage("元に戻せる変更はありません。")}>元に戻す</button></div>
        <ResetPanel onResetSettings={onResetSettings} onClearTimer={onClearTimer} onMessage={onMessage} />
      </>}
      {category === "background" && <div className="background-settings-redesigned"><BackgroundSettings settings={settings} customBackgrounds={customBackgrounds} customSize={customSize} frameOptions={frameOptions} frameTarget={frameTarget} backgroundFrame={backgroundFrame} backgroundPreviewPath={backgroundPreviewPath} onFrameTargetChange={setFrameTarget} onChange={onChange} uploads={uploads} move={move} onRemoveBackground={onRemoveBackground} /></div>}
    </section></div>
  </aside></div>;
}
