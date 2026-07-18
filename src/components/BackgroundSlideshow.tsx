import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { BackgroundChoice, BackgroundFrame, BackgroundFrames, FreePosition } from "../types/settings";
import type { CustomBackground } from "../utils/backgroundStorage";
import { getBackgroundImageLayout } from "../utils/backgroundFrame";
import { fallbackBackgroundRgb, getAdaptivePaletteFromSamples, sampleImageColorProfile, type AdaptivePalette, type ImageSampleRegion, type Rgb } from "../utils/adaptiveColor";

export const defaultBackgrounds = ["backgrounds/bg1.svg", "backgrounds/bg2.svg", "backgrounds/bg3.svg"];

type Props = {
  intervalSec: number;
  overlayOpacity: number;
  backgroundChoice: BackgroundChoice;
  customBackgrounds: CustomBackground[];
  clockPosition?: FreePosition;
  clockFontSize?: number;
  dateFontSize?: number;
  showClock?: boolean;
  showDate?: boolean;
  showSeconds?: boolean;
  dateFormat?: string;
  backgroundPosition?: FreePosition;
  backgroundScale?: number;
  backgroundFrames?: BackgroundFrames;
  editing?: boolean;
  onEditModeChange?: (editing: boolean) => void;
  onFrameChange?: (backgroundId: string, position: FreePosition, scale: number) => void;
  onPaletteChange?: (palette: AdaptivePalette) => void;
  onActiveBackgroundChange?: (backgroundId: string) => void;
};

const defaultClockPosition: FreePosition = { x: .06, y: .74 };
const defaultBackgroundPosition: FreePosition = { x: .5, y: .5 };
const minBackgroundScale = 100;
const maxBackgroundScale = 220;

type GesturePoint = { x: number; y: number };
type GestureState = {
  pointers: Map<number, GesturePoint>;
  startPointer: GesturePoint | null;
  startDistance: number | null;
  startMidpoint: GesturePoint | null;
  startPosition: FreePosition;
  startScale: number;
};
type DraftFrame = BackgroundFrame & { id: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (first: GesturePoint, second: GesturePoint) => Math.hypot(first.x - second.x, first.y - second.y);
const midpoint = (first: GesturePoint, second: GesturePoint) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

function getFocusedSampleRegion(
  image: HTMLImageElement,
  width: number,
  height: number,
  clockPosition: FreePosition,
  frame: BackgroundFrame,
  clockFontSize: number,
  dateFontSize: number,
  showClock: boolean,
  showDate: boolean
): ImageSampleRegion {
  const layout = getBackgroundImageLayout(image.naturalWidth, image.naturalHeight, width, height, frame);
  if (!layout) return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const imageScale = layout.width / image.naturalWidth;
  const imageX = (clockPosition.x * width - layout.left) / imageScale;
  const imageY = (clockPosition.y * height - layout.top) / imageScale;
  const displayWidth = Math.max(width * .16, showClock ? clockFontSize * 4.2 : 0, showDate ? dateFontSize * 12 : 0);
  const displayHeight = Math.max(height * .16, (showClock ? clockFontSize : 0) + (showDate ? dateFontSize : 0) * 1.8);
  const sampleWidth = Math.max(1, displayWidth / imageScale);
  const sampleHeight = Math.max(1, displayHeight / imageScale);
  return { x: imageX - sampleWidth / 2, y: imageY - sampleHeight / 2, width: sampleWidth, height: sampleHeight };
}

function BackgroundSlideshowComponent({ intervalSec, overlayOpacity, backgroundChoice, customBackgrounds, clockPosition = defaultClockPosition, clockFontSize = 104, dateFontSize = 20, showClock = true, showDate = true, showSeconds = false, dateFormat = "", backgroundPosition = defaultBackgroundPosition, backgroundScale = minBackgroundScale, backgroundFrames = {}, editing = false, onEditModeChange, onFrameChange, onPaletteChange, onActiveBackgroundChange }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [imageRevision, setImageRevision] = useState(0);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [gestureActive, setGestureActive] = useState(false);
  const [draftFrame, setDraftFrame] = useState<DraftFrame | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<Rgb[]>([fallbackBackgroundRgb]);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const gestureAreaRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<Record<string, HTMLImageElement>>({});
  const draftFrameRef = useRef<DraftFrame | null>(null);
  const frameAnimationRef = useRef<number | null>(null);
  const wheelCommitTimeoutRef = useRef<number | null>(null);
  const gestureRef = useRef<GestureState>({
    pointers: new Map(),
    startPointer: null,
    startDistance: null,
    startMidpoint: null,
    startPosition: backgroundPosition,
    startScale: backgroundScale
  });
  const builtInLayers = defaultBackgrounds.map((path, index) => ({ id: `bg${index + 1}`, path: `${import.meta.env.BASE_URL}${path}` }));
  const customLayers = customBackgrounds.map((background) => ({ id: `custom:${background.id}`, path: background.url }));
  const slideshowLayers = [...builtInLayers, ...customLayers];
  const allLayers = [...builtInLayers, ...customLayers];
  const hasPerImageFrames = Object.keys(backgroundFrames).length > 0;
  const legacyFrame: BackgroundFrame = { position: backgroundPosition, scale: backgroundScale };

  const getPersistedFrame = (id: string): BackgroundFrame => backgroundFrames[id]
    ?? (hasPerImageFrames ? { position: defaultBackgroundPosition, scale: minBackgroundScale } : legacyFrame);

  useEffect(() => {
    if (backgroundChoice !== "slideshow") return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slideshowLayers.length);
    }, intervalSec * 1000);
    return () => window.clearInterval(interval);
  }, [intervalSec, backgroundChoice, slideshowLayers.length]);

  useEffect(() => setActiveIndex(0), [backgroundChoice, customBackgrounds.length]);

  useEffect(() => {
    const updateViewport = () => setViewportRevision((current) => current + 1);
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!editing) {
      gestureRef.current.pointers = new Map();
      draftFrameRef.current = null;
      setDraftFrame(null);
      setGestureActive(false);
      return;
    }

    gestureAreaRef.current?.focus({ preventScroll: true });
    document.documentElement.classList.add("focusboard-background-editing");
    document.body.classList.add("focusboard-background-editing");
    const preventNativeGesture = (event: Event) => {
      const target = event.target;
      const gestureArea = gestureAreaRef.current;
      if (event.type.startsWith("gesture") || (gestureArea && target instanceof Node && gestureArea.contains(target))) event.preventDefault();
    };
    const nativeGestureEvents = ["touchstart", "touchmove", "gesturestart", "gesturechange", "gestureend", "wheel"];
    nativeGestureEvents.forEach((eventName) => document.addEventListener(eventName, preventNativeGesture, { passive: false }));
    return () => {
      document.documentElement.classList.remove("focusboard-background-editing");
      document.body.classList.remove("focusboard-background-editing");
      nativeGestureEvents.forEach((eventName) => document.removeEventListener(eventName, preventNativeGesture));
    };
  }, [editing]);

  useEffect(() => () => {
    if (frameAnimationRef.current !== null) window.cancelAnimationFrame(frameAnimationRef.current);
    if (wheelCommitTimeoutRef.current !== null) window.clearTimeout(wheelCommitTimeoutRef.current);
  }, []);

  const requestedId = backgroundChoice === "slideshow" ? slideshowLayers[activeIndex % slideshowLayers.length]?.id : backgroundChoice;
  const selectedId = allLayers.some(({ id }) => id === requestedId) ? requestedId : builtInLayers[0].id;
  const persistedSelectedFrame = getPersistedFrame(selectedId);
  const selectedFrame = draftFrame?.id === selectedId ? draftFrame : persistedSelectedFrame;

  useEffect(() => onActiveBackgroundChange?.(selectedId), [onActiveBackgroundChange, selectedId]);

  useEffect(() => {
    if (frameAnimationRef.current !== null) window.cancelAnimationFrame(frameAnimationRef.current);
    frameAnimationRef.current = null;
    draftFrameRef.current = null;
    setDraftFrame(null);
  }, [selectedId]);

  useEffect(() => {
    if (editing) return;
    const animation = window.requestAnimationFrame(() => {
      const image = imageRefs.current[selectedId];
      const bounds = backgroundRef.current?.getBoundingClientRect();
      if (!image || !bounds?.width || !bounds.height) {
        setSelectedSamples([fallbackBackgroundRgb]);
        return;
      }
      const region = getFocusedSampleRegion(image, bounds.width, bounds.height, clockPosition, persistedSelectedFrame, clockFontSize, dateFontSize, showClock, showDate);
      const profile = sampleImageColorProfile(image, region);
      setSelectedSamples(profile?.samples.length ? profile.samples : [fallbackBackgroundRgb]);
    });
    return () => window.cancelAnimationFrame(animation);
  }, [editing, selectedId, imageRevision, viewportRevision, clockPosition.x, clockPosition.y, persistedSelectedFrame.position.x, persistedSelectedFrame.position.y, persistedSelectedFrame.scale, clockFontSize, dateFontSize, showClock, showDate, showSeconds, dateFormat]);

  const palette = useMemo(
    () => getAdaptivePaletteFromSamples(selectedSamples, overlayOpacity),
    [selectedSamples, overlayOpacity]
  );

  useEffect(() => onPaletteChange?.(palette), [onPaletteChange, palette]);

  const getViewport = () => {
    const bounds = backgroundRef.current?.getBoundingClientRect();
    return { width: bounds?.width || window.innerWidth || 1, height: bounds?.height || window.innerHeight || 1 };
  };
  const getCurrentFrame = () => draftFrameRef.current?.id === selectedId ? draftFrameRef.current : getPersistedFrame(selectedId);
  const scheduleDraftFrame = (position: FreePosition, scale: number) => {
    const next: DraftFrame = {
      id: selectedId,
      position: { x: clamp(position.x, 0, 1), y: clamp(position.y, 0, 1) },
      scale: clamp(scale, minBackgroundScale, maxBackgroundScale)
    };
    draftFrameRef.current = next;
    if (frameAnimationRef.current !== null) return next;
    frameAnimationRef.current = window.requestAnimationFrame(() => {
      frameAnimationRef.current = null;
      setDraftFrame(draftFrameRef.current);
    });
    return next;
  };
  const commitDraftFrame = (frame = draftFrameRef.current) => {
    if (!frame || frame.id !== selectedId) return;
    onFrameChange?.(frame.id, frame.position, frame.scale);
  };
  const startGesture = (pointers: Map<number, GesturePoint>) => {
    const gesture = gestureRef.current;
    const frame = getCurrentFrame();
    gesture.pointers = pointers;
    setGestureActive(true);
    if (pointers.size === 1) {
      gesture.startPointer = pointers.values().next().value ?? null;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
    } else if (pointers.size >= 2) {
      const points = [...pointers.values()];
      gesture.startPointer = null;
      gesture.startDistance = distance(points[0], points[1]);
      gesture.startMidpoint = midpoint(points[0], points[1]);
    }
    gesture.startPosition = frame.position;
    gesture.startScale = frame.scale;
  };
  const moveGesture = (pointers: Map<number, GesturePoint>) => {
    const gesture = gestureRef.current;
    if (!pointers.size) return;
    gesture.pointers = pointers;
    const viewport = getViewport();
    const image = imageRefs.current[selectedId];
    const startFrame = { position: gesture.startPosition, scale: gesture.startScale };
    const startLayout = image
      ? getBackgroundImageLayout(image.naturalWidth, image.naturalHeight, viewport.width, viewport.height, startFrame)
      : null;
    if (pointers.size === 1 && gesture.startPointer) {
      const point = pointers.values().next().value ?? gesture.startPointer;
      const overflowX = startLayout ? startLayout.width - viewport.width : viewport.width;
      const overflowY = startLayout ? startLayout.height - viewport.height : viewport.height;
      scheduleDraftFrame({
        x: overflowX > .5 ? gesture.startPosition.x - (point.x - gesture.startPointer.x) / overflowX : gesture.startPosition.x,
        y: overflowY > .5 ? gesture.startPosition.y - (point.y - gesture.startPointer.y) / overflowY : gesture.startPosition.y
      }, gesture.startScale);
      return;
    }
    if (pointers.size < 2 || !gesture.startDistance || !gesture.startMidpoint) return;
    const points = [...pointers.values()].slice(0, 2);
    const currentMidpoint = midpoint(points[0], points[1]);
    const nextScale = clamp(gesture.startScale * distance(points[0], points[1]) / gesture.startDistance, minBackgroundScale, maxBackgroundScale);
    if (!image || !startLayout) {
      scheduleDraftFrame(gesture.startPosition, nextScale);
      return;
    }
    const nextLayout = getBackgroundImageLayout(
      image.naturalWidth,
      image.naturalHeight,
      viewport.width,
      viewport.height,
      { position: gesture.startPosition, scale: nextScale }
    );
    if (!nextLayout) return;
    const imagePointX = (gesture.startMidpoint.x - startLayout.left) / startLayout.width;
    const imagePointY = (gesture.startMidpoint.y - startLayout.top) / startLayout.height;
    const nextLeft = currentMidpoint.x - imagePointX * nextLayout.width;
    const nextTop = currentMidpoint.y - imagePointY * nextLayout.height;
    const overflowX = nextLayout.width - viewport.width;
    const overflowY = nextLayout.height - viewport.height;
    scheduleDraftFrame({
      x: overflowX > .5 ? -nextLeft / overflowX : .5,
      y: overflowY > .5 ? -nextTop / overflowY : .5
    }, nextScale);
  };
  const endGesture = (pointers: Map<number, GesturePoint>) => {
    const gesture = gestureRef.current;
    gesture.pointers = pointers;
    if (pointers.size === 1) {
      const point = pointers.values().next().value;
      const frame = getCurrentFrame();
      if (!point) return;
      gesture.startPointer = point;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
      gesture.startPosition = frame.position;
      gesture.startScale = frame.scale;
    } else if (pointers.size === 0) {
      gesture.startPointer = null;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
      setGestureActive(false);
      commitDraftFrame();
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editing) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startGesture(new Map(gestureRef.current.pointers).set(event.pointerId, { x: event.clientX, y: event.clientY }));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!editing || !gestureRef.current.pointers.has(event.pointerId)) return;
    event.preventDefault();
    moveGesture(new Map(gestureRef.current.pointers).set(event.pointerId, { x: event.clientX, y: event.clientY }));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!editing) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    const pointers = new Map(gestureRef.current.pointers);
    pointers.delete(event.pointerId);
    endGesture(pointers);
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!editing) return;
    event.preventDefault();
    const frame = getCurrentFrame();
    scheduleDraftFrame(frame.position, frame.scale + (event.deltaY < 0 ? 5 : -5));
    if (wheelCommitTimeoutRef.current !== null) window.clearTimeout(wheelCommitTimeoutRef.current);
    wheelCommitTimeoutRef.current = window.setTimeout(() => {
      wheelCommitTimeoutRef.current = null;
      commitDraftFrame();
    }, 180);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!editing) return;
    const frame = getCurrentFrame();
    const positionStep = event.shiftKey ? .1 : .03;
    let next: DraftFrame | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      next = scheduleDraftFrame({
        x: frame.position.x + (event.key === "ArrowLeft" ? positionStep : event.key === "ArrowRight" ? -positionStep : 0),
        y: frame.position.y + (event.key === "ArrowUp" ? positionStep : event.key === "ArrowDown" ? -positionStep : 0)
      }, frame.scale);
    } else if (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "_") {
      event.preventDefault();
      next = scheduleDraftFrame(frame.position, frame.scale + (event.key === "+" || event.key === "=" ? positionStep * 100 : -positionStep * 100));
    }
    if (next) commitDraftFrame(next);
  };
  const finishEditing = () => {
    commitDraftFrame();
    onEditModeChange?.(false);
  };

  const viewport = getViewport();
  const getLayerFrame = (id: string) => draftFrame?.id === id ? draftFrame : getPersistedFrame(id);

  return (
    <div className={`background${editing ? " background--editing" : ""}${gestureActive ? " background--gesturing" : ""}`} ref={backgroundRef}>
      {allLayers.map(({ id, path }) => {
        const frame = getLayerFrame(id);
        const image = imageRefs.current[id];
        const layout = image ? getBackgroundImageLayout(image.naturalWidth, image.naturalHeight, viewport.width, viewport.height, frame) : null;
        return (
          <div className={`background__image${selectedId === id ? " background__image--active" : ""}`} key={id}>
            {!failed.has(id) && <img
              className="background__asset"
              src={path}
              alt=""
              style={layout ? {
                width: `${layout.width}px`,
                height: `${layout.height}px`,
                left: `${layout.left}px`,
                top: `${layout.top}px`
              } : undefined}
              onError={() => {
                delete imageRefs.current[id];
                setFailed((current) => new Set(current).add(id));
                setImageRevision((current) => current + 1);
              }}
              onLoad={(event) => {
                imageRefs.current[id] = event.currentTarget;
                setImageRevision((current) => current + 1);
              }}
            />}
          </div>
        );
      })}
      <div className="background__overlay" style={{ opacity: overlayOpacity }} />
      {editing && <>
        <div className="background-editor__toolbar" role="status" aria-live="polite">
          <div>
            <span className="background-editor__eyebrow">壁紙の編集</span>
            <strong>背景を調整中</strong>
          </div>
          <button type="button" className="background-editor__done" onClick={finishEditing}>完了</button>
        </div>
        <div className="background-editor__hint" role="status">1本指で移動・2本指ピンチで拡大縮小</div>
      </>}
      <div
        className="background__gesture"
        ref={gestureAreaRef}
        role={editing ? "group" : undefined}
        tabIndex={editing ? 0 : -1}
        aria-hidden={!editing}
        aria-label="背景をドラッグして移動。2本指またはホイールで拡大縮小。フォーカス後は矢印キーで移動できます"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
        onDoubleClick={(event) => editing && event.preventDefault()}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export const BackgroundSlideshow = memo(BackgroundSlideshowComponent);
