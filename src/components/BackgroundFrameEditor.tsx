import { useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { FreePosition } from "../types/settings";

type Props = {
  imageUrl: string;
  imageName: string;
  position: FreePosition;
  scale: number;
  onChange: (position: FreePosition, scale: number) => void;
};

type Point = { x: number; y: number };
type Gesture = {
  pointers: Map<number, Point>;
  startPointer: Point | null;
  startDistance: number | null;
  startMidpoint: Point | null;
  startPosition: FreePosition;
  startScale: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);
const midpoint = (first: Point, second: Point) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

export function BackgroundFrameEditor({ imageUrl, imageName, position, scale, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture>({
    pointers: new Map(),
    startPointer: null,
    startDistance: null,
    startMidpoint: null,
    startPosition: position,
    startScale: scale
  });

  const getViewport = () => {
    const bounds = editorRef.current?.getBoundingClientRect();
    return { width: bounds?.width || 1, height: bounds?.height || 1 };
  };
  const updateFrame = (nextPosition: FreePosition, nextScale: number) => onChange(
    { x: clamp(nextPosition.x, 0, 1), y: clamp(nextPosition.y, 0, 1) },
    clamp(nextScale, 100, 220)
  );
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    const gesture = gestureRef.current;
    const pointers = new Map(gesture.pointers).set(event.pointerId, point);
    gesture.pointers = pointers;
    if (pointers.size === 1) {
      gesture.startPointer = point;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
      gesture.startPosition = position;
      gesture.startScale = scale;
    } else if (pointers.size === 2) {
      const points = [...pointers.values()];
      gesture.startPointer = null;
      gesture.startDistance = distance(points[0], points[1]);
      gesture.startMidpoint = midpoint(points[0], points[1]);
      gesture.startPosition = position;
      gesture.startScale = scale;
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    event.preventDefault();
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const viewport = getViewport();
    if (gesture.pointers.size === 1 && gesture.startPointer) {
      const point = gesture.pointers.get(event.pointerId) ?? gesture.startPointer;
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
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    const gesture = gestureRef.current;
    const pointers = new Map(gesture.pointers);
    pointers.delete(event.pointerId);
    gesture.pointers = pointers;
    if (pointers.size === 1) {
      const [point] = pointers.values();
      gesture.startPointer = point;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
      gesture.startPosition = position;
      gesture.startScale = scale;
    } else if (pointers.size === 0) {
      gesture.startPointer = null;
      gesture.startDistance = null;
      gesture.startMidpoint = null;
    }
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateFrame(position, scale + (event.deltaY < 0 ? 5 : -5));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const positionStep = event.shiftKey ? .1 : .03;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      updateFrame({
        x: position.x + (event.key === "ArrowLeft" ? positionStep : event.key === "ArrowRight" ? -positionStep : 0),
        y: position.y + (event.key === "ArrowUp" ? positionStep : event.key === "ArrowDown" ? -positionStep : 0)
      }, scale);
    } else if (["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault();
      updateFrame(position, scale + (event.key === "+" || event.key === "=" ? positionStep * 100 : -positionStep * 100));
    }
  };

  return (
    <div className="background-frame-editor">
      <div
        className="background-frame-editor__preview"
        ref={editorRef}
        role="button"
        tabIndex={0}
        aria-label={`${imageName}の表示位置と拡大率を調整。ドラッグまたは矢印キーで移動、ピンチまたはホイールで拡大縮小`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div className="background-frame-editor__image" style={{ backgroundImage: `url(${imageUrl})`, backgroundPosition: `${position.x * 100}% ${position.y * 100}%`, transform: `scale(${scale / 100})` }} aria-hidden="true" />
        <span className="background-frame-editor__safe-area" aria-hidden="true" />
        <span className="background-frame-editor__hint" aria-hidden="true">ドラッグで移動・ピンチで拡大縮小</span>
      </div>
      <div className="background-frame-editor__meta"><strong>{imageName}</strong><span>{Math.round(position.x * 100)}% / {Math.round(position.y * 100)}%・拡大 {scale}%</span></div>
    </div>
  );
}
