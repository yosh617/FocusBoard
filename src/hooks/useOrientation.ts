import { useEffect, useState } from "react";
import type { Orientation } from "../types/settings";

export function getOrientation(width: number, height: number): Orientation {
  return width >= height ? "landscape" : "portrait";
}

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() => (
    typeof window === "undefined" ? "portrait" : getOrientation(window.innerWidth, window.innerHeight)
  ));

  useEffect(() => {
    const update = () => setOrientation(getOrientation(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return orientation;
}
