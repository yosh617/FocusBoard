import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { defaultSettings, describeFontSize, fontOptions, settingRanges, type AppSettings, type ClockDateAlignment, type FreePosition } from "../types/settings";
import { ClockDisplay } from "./ClockDisplay";
import { DateDisplay } from "./DateDisplay";

type Props = {
  now: Date;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onMessage: (message: string) => void;
};

const alignments: { value: ClockDateAlignment; label: string }[] = [
  { value: "left", label: "左" },
  { value: "center", label: "中央" },
  { value: "right", label: "右" }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type EditorPosition = {
  left: number;
  offset: number;
  above: boolean;
};

export function ClockWidget({ now, settings, onChange, onMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [editorPosition, setEditorPosition] = useState<EditorPosition | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const pointerStart = useRef<{ x: number; y: number; position: FreePosition } | null>(null);
  const position = settings.clockDatePosition;
  const positionRef = useRef(position);
  const hintTimeoutRef = useRef<number | null>(null);
  const moved = useRef(false);
  positionRef.current = position;

  const getPositionBounds = () => {
    const displayRect = displayRef.current?.getBoundingClientRect();
    const displayWidth = displayRect?.width || Math.min(window.innerWidth * .86, 900);
    const displayHeight = displayRect?.height || 120;
    const edgeGap = 12;
    const xMargin = settings.clockDateAlignment === "center"
      ? (displayWidth / 2 + edgeGap) / window.innerWidth
      : displayWidth / window.innerWidth + edgeGap / window.innerWidth;
    const yMargin = (displayHeight / 2 + edgeGap) / window.innerHeight;
    return settings.clockDateAlignment === "left"
      ? { minX: edgeGap / window.innerWidth, maxX: 1 - xMargin, minY: yMargin, maxY: 1 - yMargin }
      : settings.clockDateAlignment === "right"
        ? { minX: xMargin, maxX: 1 - edgeGap / window.innerWidth, minY: yMargin, maxY: 1 - yMargin }
        : { minX: xMargin, maxX: 1 - xMargin, minY: yMargin, maxY: 1 - yMargin };
  };

  const clampPosition = (x: number, y: number): FreePosition => {
    const bounds = getPositionBounds();
    return {
      x: clamp(x, bounds.minX, bounds.maxX),
      y: clamp(y, bounds.minY, bounds.maxY)
    };
  };

  useLayoutEffect(() => {
    const keepInsideViewport = () => {
      const current = positionRef.current;
      const next = clampPosition(current.x, current.y);
      if (next.x === current.x && next.y === current.y) return;
      onChange({ clockDatePosition: next });
    };
    keepInsideViewport();
    window.addEventListener("resize", keepInsideViewport);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(keepInsideViewport);
    if (observer && displayRef.current) observer.observe(displayRef.current);
    return () => {
      window.removeEventListener("resize", keepInsideViewport);
      observer?.disconnect();
    };
  }, [onChange, settings.clockDateAlignment, settings.clockFontSize, settings.dateFontSize, settings.dateFormat, settings.showClock, settings.showDate, settings.showSeconds]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!widgetRef.current?.contains(target) && !editorRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !displayRef.current) {
      setEditorPosition(null);
      return;
    }

    const updateEditorPosition = () => {
      const display = displayRef.current;
      if (!display) return;
      const rect = display.getBoundingClientRect();
      const edgeGap = 16;
      const panelWidth = Math.min(360, window.innerWidth - edgeGap * 2);
      const left = clamp(rect.left + rect.width / 2 - panelWidth / 2, edgeGap, window.innerWidth - panelWidth - edgeGap);
      const above = rect.top > window.innerHeight / 2;
      const offset = above ? window.innerHeight - rect.top + 12 : rect.bottom + 12;
      setEditorPosition({ left, offset, above });
    };

    updateEditorPosition();
    window.addEventListener("resize", updateEditorPosition);
    return () => window.removeEventListener("resize", updateEditorPosition);
  }, [open, position.x, position.y]);

  useEffect(() => () => {
    if (hintTimeoutRef.current !== null) window.clearTimeout(hintTimeoutRef.current);
  }, []);

  const moveBy = (x: number, y: number) => onChange({ clockDatePosition: clampPosition(x, y) });
  const showHint = () => {
    if (hintTimeoutRef.current !== null) window.clearTimeout(hintTimeoutRef.current);
    setHintVisible(true);
    hintTimeoutRef.current = window.setTimeout(() => {
      hintTimeoutRef.current = null;
      setHintVisible(false);
    }, 2_500);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    if (!moved.current) return;
    moveBy(start.position.x + dx / window.innerWidth, start.position.y + dy / window.innerHeight);
  };

  return (
    <div
      className={`clock-widget clock-widget--${settings.clockDateAlignment}${open ? " clock-widget--editing" : ""}${hintVisible ? " clock-widget--hint-visible" : ""}`}
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
      ref={widgetRef}
    >
      <button
        className="clock-widget__display"
        type="button"
        aria-label="時計とカレンダーの表示設定を開く"
        aria-expanded={open}
        onPointerDown={(event) => {
          if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
          pointerStart.current = { x: event.clientX, y: event.clientY, position };
          moved.current = false;
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          pointerStart.current = null;
          if (moved.current) onMessage("時計とカレンダーの位置を変更しました。");
          else {
            showHint();
            setOpen((current) => !current);
          }
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? .05 : .015;
          if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(position.x - step, position.y); }
          if (event.key === "ArrowRight") { event.preventDefault(); moveBy(position.x + step, position.y); }
          if (event.key === "ArrowUp") { event.preventDefault(); moveBy(position.x, position.y - step); }
          if (event.key === "ArrowDown") { event.preventDefault(); moveBy(position.x, position.y + step); }
        }}
        ref={displayRef}
      >
        <span className="clock-widget__hint" aria-hidden="true">タップで表示設定・ドラッグで移動</span>
        {settings.showDate && <DateDisplay now={now} fontSize={settings.dateFontSize} format={settings.dateFormat} />}
        {settings.showClock && <ClockDisplay now={now} settings={settings} />}
      </button>

      {open && editorPosition && createPortal(
        <section
          className={`clock-editor${editorPosition.above ? " clock-editor--above" : ""}`}
          aria-label="時計とカレンダーの表示設定"
          ref={editorRef}
          style={{
            left: `${editorPosition.left}px`,
            [editorPosition.above ? "bottom" : "top"]: `${editorPosition.offset}px`,
            fontFamily: fontOptions[settings.fontFamily as keyof typeof fontOptions] ?? fontOptions.system
          } as CSSProperties}
        >
          <div className="clock-editor__title"><span>表示を整える</span><button type="button" aria-label="時計の設定を閉じる" onClick={() => setOpen(false)}>×</button></div>
          <div className="clock-editor__row">
            <span>そろえ</span>
            <div className="segmented-control" role="radiogroup" aria-label="時計とカレンダーのそろえ">
              {alignments.map((alignment) => <button key={alignment.value} type="button" role="radio" aria-checked={settings.clockDateAlignment === alignment.value} className={settings.clockDateAlignment === alignment.value ? "is-active" : ""} onClick={() => onChange({ clockDateAlignment: alignment.value })}>{alignment.label}</button>)}
            </div>
          </div>
          <div className="clock-editor__toggles">
            <label><input type="checkbox" checked={settings.showClock} onChange={(event) => onChange({ showClock: event.target.checked })} />時計</label>
            <label><input type="checkbox" checked={settings.showDate} onChange={(event) => onChange({ showDate: event.target.checked })} />日付</label>
            <label><input type="checkbox" checked={settings.showSeconds} onChange={(event) => onChange({ showSeconds: event.target.checked })} />秒</label>
          </div>
          <label className="clock-editor__range">時計の大きさ <output>{describeFontSize(settings.clockFontSize, defaultSettings.clockFontSize, settingRanges.clockFontSize.min, settingRanges.clockFontSize.max)}</output><input aria-label="時計の大きさ" type="range" min="56" max="220" value={settings.clockFontSize} onChange={(event) => onChange({ clockFontSize: Number(event.target.value) })} /></label>
          <button className="clock-editor__reset" type="button" onClick={() => { onChange({ clockDatePosition: { x: .5, y: .5 }, clockDateAlignment: "center" }); onMessage("時計とカレンダーを中央にそろえました。"); }}>中央に戻す</button>
        </section>,
        document.body
      )}
    </div>
  );
}
