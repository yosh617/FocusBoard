import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type TouchEvent as ReactTouchEvent, type WheelEvent } from "react";
import type { BackgroundChoice, BackgroundFrames, FreePosition } from "../types/settings";
import type { CustomBackground } from "../utils/backgroundStorage";
import { fallbackBackgroundRgb, getAdaptivePalette, sampleImageRgb, type AdaptivePalette, type ImageSampleRegion } from "../utils/adaptiveColor";

export const defaultBackgrounds = ["backgrounds/bg1.svg", "backgrounds/bg2.svg", "backgrounds/bg3.svg"];

type Props = {
  intervalSec: number;
  overlayOpacity: number;
  backgroundChoice: BackgroundChoice;
  customBackgrounds: CustomBackground[];
  clockPosition?: FreePosition;
  backgroundPosition?: FreePosition;
  backgroundScale?: number;
  backgroundFrames?: BackgroundFrames;
  onFrameChange?: (backgroundId: string, position: FreePosition, scale: number) => void;
  onPaletteChange?: (palette: AdaptivePalette) => void;
};

const defaultClockPosition: FreePosition = { x: .06, y: .74 };
const defaultBackgroundPosition: FreePosition = { x: .5, y: .5 };
const minBackgroundScale = 100;
const maxBackgroundScale = 220;

type GesturePoint = { x: number; y: number };
type TouchLike = { identifier: number; clientX: number; clientY: number };
type TouchCollection = { length: number; item?: (index: number) => TouchLike | null };
type GestureState = {
  pointers: Map<number, GesturePoint>;
  startPointer: GesturePoint | null;
  startDistance: number | null;
  startMidpoint: GesturePoint | null;
  startPosition: FreePosition;
  startScale: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (first: GesturePoint, second: GesturePoint) => Math.hypot(first.x - second.x, first.y - second.y);
const midpoint = (first: GesturePoint, second: GesturePoint) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

function getFocusedSampleRegion(image: HTMLImageElement, width: number, height: number, clockPosition: FreePosition, backgroundPosition: FreePosition, backgroundScale: number): ImageSampleRegion {
  const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * coverScale;
  const renderedHeight = image.naturalHeight * coverScale;
  const offsetX = (width - renderedWidth) * backgroundPosition.x;
  const offsetY = (height - renderedHeight) * backgroundPosition.y;
  const zoom = Math.max(1, backgroundScale / 100);
  const baseX = width / 2 + (clockPosition.x * width - width / 2) / zoom;
  const baseY = height / 2 + (clockPosition.y * height - height / 2) / zoom;
  const imageX = (baseX - offsetX) / coverScale;
  const imageY = (baseY - offsetY) / coverScale;
  const sampleWidth = Math.max(1, width * .16 / (coverScale * zoom));
  const sampleHeight = Math.max(1, height * .16 / (coverScale * zoom));
  return { x: imageX - sampleWidth / 2, y: imageY - sampleHeight / 2, width: sampleWidth, height: sampleHeight };
}

function BackgroundSlideshowComponent({ intervalSec, overlayOpacity, backgroundChoice, customBackgrounds, clockPosition = defaultClockPosition, backgroundPosition = defaultBackgroundPosition, backgroundScale = minBackgroundScale, backgroundFrames = {}, onFrameChange, onPaletteChange }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [imageRevision, setImageRevision] = useState(0);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [gestureActive, setGestureActive] = useState(false);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const gestureAreaRef = useRef<HTMLDivElement>(null);
  const pointerTouchActiveRef = useRef(false);
  const imageRefs = useRef<Record<string, HTMLImageElement>>({});
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
  const slideshowLayers = customLayers.length > 0 ? customLayers : builtInLayers;
  const allLayers = [...builtInLayers, ...customLayers];

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
    const gestureArea = gestureAreaRef.current;
    if (!gestureArea) return;
    const preventNativeGesture = (event: Event) => event.preventDefault();
    const nativeGestureEvents = ["touchstart", "touchmove", "gesturestart", "gesturechange", "gestureend"];
    nativeGestureEvents.forEach((eventName) => gestureArea.addEventListener(eventName, preventNativeGesture, { passive: false }));
    return () => nativeGestureEvents.forEach((eventName) => gestureArea.removeEventListener(eventName, preventNativeGesture));
  }, []);

  const requestedId = backgroundChoice === "slideshow" ? slideshowLayers[activeIndex % slideshowLayers.length]?.id : backgroundChoice;
  const selectedId = allLayers.some(({ id }) => id === requestedId) ? requestedId : builtInLayers[0].id;
  const selectedFrame = backgroundFrames[selectedId] ?? { position: backgroundPosition, scale: backgroundScale };
  const selectedColor = useMemo(() => {
    const image = imageRefs.current[selectedId];
    const bounds = backgroundRef.current?.getBoundingClientRect();
    if (!image || !bounds?.width || !bounds.height) return fallbackBackgroundRgb;
    const region = getFocusedSampleRegion(image, bounds.width, bounds.height, clockPosition, selectedFrame.position, selectedFrame.scale);
    return sampleImageRgb(image, region) ?? fallbackBackgroundRgb;
  }, [selectedId, imageRevision, viewportRevision, clockPosition.x, clockPosition.y, selectedFrame.position.x, selectedFrame.position.y, selectedFrame.scale]);
  const palette = useMemo(
    () => getAdaptivePalette(selectedColor, overlayOpacity),
    [selectedColor, overlayOpacity]
  );

  useEffect(() => onPaletteChange?.(palette), [onPaletteChange, palette]);

  const getViewport = () => {
    const bounds = backgroundRef.current?.getBoundingClientRect();
    return { width: bounds?.width || window.innerWidth || 1, height: bounds?.height || window.innerHeight || 1 };
  };
  const updateFrame = (position: FreePosition, scale: number) => {
    onFrameChange?.(
      selectedId,
      { x: clamp(position.x, 0, 1), y: clamp(position.y, 0, 1) },
      clamp(scale, minBackgroundScale, maxBackgroundScale)
    );
  };
  const startGesture = (pointers: Map<number, GesturePoint>) => {
    const gesture = gestureRef.current;
    gesture.pointers = pointers;
    setGestureActive(true);
    if (pointers.size === 1) {
      gesture.startPointer = pointers.values().next().value ?? null;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
      gesture.startPosition = selectedFrame.position;
      gesture.startScale = selectedFrame.scale;
    } else if (pointers.size === 2) {
      const points = [...pointers.values()];
      gesture.startPointer = null;
      gesture.startDistance = distance(points[0], points[1]);
      gesture.startMidpoint = midpoint(points[0], points[1]);
      gesture.startPosition = selectedFrame.position;
      gesture.startScale = selectedFrame.scale;
    }
  };
  const moveGesture = (pointers: Map<number, GesturePoint>) => {
    const gesture = gestureRef.current;
    if (!pointers.size) return;
    gesture.pointers = pointers;
    const viewport = getViewport();
    if (gesture.pointers.size === 1 && gesture.startPointer) {
      const point = pointers.values().next().value ?? gesture.startPointer;
      updateFrame({
        x: gesture.startPosition.x - (point.x - gesture.startPointer.x) / viewport.width,
        y: gesture.startPosition.y - (point.y - gesture.startPointer.y) / viewport.height
      }, gesture.startScale);
      return;
    }
    if (gesture.pointers.size < 2 || !gesture.startDistance || !gesture.startMidpoint) return;
    const points = [...gesture.pointers.values()].slice(0, 2);
    const currentMidpoint = midpoint(points[0], points[1]);
    const zoom = distance(points[0], points[1]) / gesture.startDistance;
    updateFrame({
      x: gesture.startPosition.x - (currentMidpoint.x - gesture.startMidpoint.x) / viewport.width,
      y: gesture.startPosition.y - (currentMidpoint.y - gesture.startMidpoint.y) / viewport.height
      }, gesture.startScale * zoom);
  };
  const endGesture = (pointers: Map<number, GesturePoint>) => {
    const gesture = gestureRef.current;
    gesture.pointers = pointers;
    if (pointers.size === 1) {
      const point = pointers.values().next().value;
      if (!point) return;
      gesture.startPointer = point;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
      gesture.startPosition = selectedFrame.position;
      gesture.startScale = selectedFrame.scale;
    } else if (pointers.size === 0) {
      gesture.startPointer = null;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
      setGestureActive(false);
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.pointerType === "touch") pointerTouchActiveRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startGesture(new Map(gestureRef.current.pointers).set(event.pointerId, { x: event.clientX, y: event.clientY }));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    event.preventDefault();
    moveGesture(new Map(gesture.pointers).set(event.pointerId, { x: event.clientX, y: event.clientY }));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    const gesture = gestureRef.current;
    const pointers = new Map(gesture.pointers);
    pointers.delete(event.pointerId);
    endGesture(pointers);
    if (event.pointerType === "touch" && pointers.size === 0) pointerTouchActiveRef.current = false;
  };
  const getTouchPointers = (touches: TouchCollection) => {
    const pointers = new Map<number, GesturePoint>();
    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item?.(index) ?? (touches as unknown as { [index: number]: TouchLike | undefined })[index];
      if (touch) pointers.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }
    return pointers;
  };
  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!pointerTouchActiveRef.current) startGesture(getTouchPointers(event.touches));
  };
  const onTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!pointerTouchActiveRef.current) moveGesture(getTouchPointers(event.touches));
  };
  const onTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!pointerTouchActiveRef.current) endGesture(getTouchPointers(event.touches));
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const amount = event.deltaY < 0 ? 5 : -5;
    updateFrame(selectedFrame.position, selectedFrame.scale + amount);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const positionStep = event.shiftKey ? .1 : .03;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      updateFrame({
        x: selectedFrame.position.x + (event.key === "ArrowLeft" ? positionStep : event.key === "ArrowRight" ? -positionStep : 0),
        y: selectedFrame.position.y + (event.key === "ArrowUp" ? positionStep : event.key === "ArrowDown" ? -positionStep : 0)
      }, selectedFrame.scale);
    } else if (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "_") {
      event.preventDefault();
      updateFrame(selectedFrame.position, selectedFrame.scale + (event.key === "+" || event.key === "=" ? positionStep * 100 : -positionStep * 100));
    }
  };

  return (
    <div className={`background${gestureActive ? " background--gesturing" : ""}`} ref={backgroundRef}>
      {allLayers.map(({ id, path }) => (
        <div
          className={`background__image${selectedId === id ? " background__image--active" : ""}`}
          style={failed.has(id) ? undefined : {
            backgroundImage: `url(${path})`,
            backgroundPosition: `${(backgroundFrames[id]?.position ?? backgroundPosition).x * 100}% ${(backgroundFrames[id]?.position ?? backgroundPosition).y * 100}%`,
            transform: `scale(${(backgroundFrames[id]?.scale ?? backgroundScale) / 100})`
          }}
          key={id}
        >
          <img
            src={path}
            alt=""
            onError={() => setFailed((current) => new Set(current).add(id))}
            onLoad={(event) => {
              imageRefs.current[id] = event.currentTarget;
              setImageRevision((current) => current + 1);
            }}
          />
        </div>
      ))}
      <div className="background__overlay" style={{ opacity: overlayOpacity }} />
      <div
        className="background__gesture"
        ref={gestureAreaRef}
        role="button"
        tabIndex={0}
        aria-label="背景をドラッグして移動。2本指またはホイールで拡大縮小"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export const BackgroundSlideshow = memo(BackgroundSlideshowComponent);
