import { memo, useEffect, useState } from "react";

const defaultBackgrounds = ["backgrounds/bg1.svg", "backgrounds/bg2.svg", "backgrounds/bg3.svg"];

type Props = { intervalSec: number; overlayOpacity: number };

function BackgroundSlideshowComponent({ intervalSec, overlayOpacity }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % defaultBackgrounds.length);
    }, intervalSec * 1000);
    return () => window.clearInterval(interval);
  }, [intervalSec]);

  return (
    <div className="background" aria-hidden="true">
      {defaultBackgrounds.map((path, index) => (
        <div
          className={`background__image${activeIndex === index ? " background__image--active" : ""}`}
          style={failed.has(index) ? undefined : { backgroundImage: `url(${import.meta.env.BASE_URL}${path})` }}
          key={path}
        >
          <img
            src={`${import.meta.env.BASE_URL}${path}`}
            alt=""
            onError={() => setFailed((current) => new Set(current).add(index))}
          />
        </div>
      ))}
      <div className="background__overlay" style={{ opacity: overlayOpacity }} />
    </div>
  );
}

export const BackgroundSlideshow = memo(BackgroundSlideshowComponent);
