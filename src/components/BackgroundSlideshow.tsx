import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundChoice, FreePosition } from "../types/settings";
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
  onPaletteChange?: (palette: AdaptivePalette) => void;
};

const defaultClockPosition: FreePosition = { x: .06, y: .74 };
const defaultBackgroundPosition: FreePosition = { x: .5, y: .5 };

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

function BackgroundSlideshowComponent({ intervalSec, overlayOpacity, backgroundChoice, customBackgrounds, clockPosition = defaultClockPosition, backgroundPosition = defaultBackgroundPosition, backgroundScale = 100, onPaletteChange }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [imageRevision, setImageRevision] = useState(0);
  const [viewportRevision, setViewportRevision] = useState(0);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<Record<string, HTMLImageElement>>({});
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

  const requestedId = backgroundChoice === "slideshow" ? slideshowLayers[activeIndex % slideshowLayers.length]?.id : backgroundChoice;
  const selectedId = allLayers.some(({ id }) => id === requestedId) ? requestedId : builtInLayers[0].id;
  const selectedColor = useMemo(() => {
    const image = imageRefs.current[selectedId];
    const bounds = backgroundRef.current?.getBoundingClientRect();
    if (!image || !bounds?.width || !bounds.height) return fallbackBackgroundRgb;
    const region = getFocusedSampleRegion(image, bounds.width, bounds.height, clockPosition, backgroundPosition, backgroundScale);
    return sampleImageRgb(image, region) ?? fallbackBackgroundRgb;
  }, [selectedId, imageRevision, viewportRevision, clockPosition.x, clockPosition.y, backgroundPosition.x, backgroundPosition.y, backgroundScale]);
  const palette = useMemo(
    () => getAdaptivePalette(selectedColor, overlayOpacity),
    [selectedColor, overlayOpacity]
  );

  useEffect(() => onPaletteChange?.(palette), [onPaletteChange, palette]);

  return (
    <div className="background" aria-hidden="true" ref={backgroundRef}>
      {allLayers.map(({ id, path }) => (
        <div
          className={`background__image${selectedId === id ? " background__image--active" : ""}`}
          style={failed.has(id) ? undefined : {
            backgroundImage: `url(${path})`,
            backgroundPosition: `${backgroundPosition.x * 100}% ${backgroundPosition.y * 100}%`,
            transform: `scale(${backgroundScale / 100})`
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
    </div>
  );
}

export const BackgroundSlideshow = memo(BackgroundSlideshowComponent);
