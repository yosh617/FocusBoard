import { memo, useEffect, useMemo, useState } from "react";
import type { BackgroundChoice } from "../types/settings";
import type { CustomBackground } from "../utils/backgroundStorage";
import { fallbackBackgroundRgb, getAdaptivePalette, sampleImageRgb, type AdaptivePalette, type Rgb } from "../utils/adaptiveColor";

export const defaultBackgrounds = ["backgrounds/bg1.svg", "backgrounds/bg2.svg", "backgrounds/bg3.svg"];

type Props = {
  intervalSec: number;
  overlayOpacity: number;
  backgroundChoice: BackgroundChoice;
  customBackgrounds: CustomBackground[];
  onPaletteChange?: (palette: AdaptivePalette) => void;
};

function BackgroundSlideshowComponent({ intervalSec, overlayOpacity, backgroundChoice, customBackgrounds, onPaletteChange }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [sampledColors, setSampledColors] = useState<Record<string, Rgb>>({});
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

  const requestedId = backgroundChoice === "slideshow" ? slideshowLayers[activeIndex % slideshowLayers.length]?.id : backgroundChoice;
  const selectedId = allLayers.some(({ id }) => id === requestedId) ? requestedId : builtInLayers[0].id;
  const selectedColor = sampledColors[selectedId] ?? fallbackBackgroundRgb;
  const palette = useMemo(
    () => getAdaptivePalette(selectedColor, overlayOpacity),
    [selectedColor, overlayOpacity]
  );

  useEffect(() => onPaletteChange?.(palette), [onPaletteChange, palette]);

  return (
    <div className="background" aria-hidden="true">
      {allLayers.map(({ id, path }) => (
        <div
          className={`background__image${selectedId === id ? " background__image--active" : ""}`}
          style={failed.has(id) ? undefined : { backgroundImage: `url(${path})` }}
          key={id}
        >
          <img
            src={path}
            alt=""
            onError={() => setFailed((current) => new Set(current).add(id))}
            onLoad={(event) => {
              const color = sampleImageRgb(event.currentTarget);
              if (color) setSampledColors((current) => ({ ...current, [id]: color }));
            }}
          />
        </div>
      ))}
      <div className="background__overlay" style={{ opacity: overlayOpacity }} />
    </div>
  );
}

export const BackgroundSlideshow = memo(BackgroundSlideshowComponent);
