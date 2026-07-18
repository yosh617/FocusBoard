import { useCallback, useEffect, useState } from "react";

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement() {
  const currentDocument = document as FullscreenDocument;
  return currentDocument.fullscreenElement ?? currentDocument.webkitFullscreenElement ?? null;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(getFullscreenElement()));
  const [isSupported] = useState(() => {
    const root = document.documentElement as FullscreenElement;
    return Boolean(root.requestFullscreen || root.webkitRequestFullscreen);
  });

  useEffect(() => {
    const syncState = () => setIsFullscreen(Boolean(getFullscreenElement()));
    document.addEventListener("fullscreenchange", syncState);
    document.addEventListener("webkitfullscreenchange", syncState);
    return () => {
      document.removeEventListener("fullscreenchange", syncState);
      document.removeEventListener("webkitfullscreenchange", syncState);
    };
  }, []);

  const setFullscreen = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      if (!getFullscreenElement()) {
        setIsFullscreen(false);
        return true;
      }
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await (document as FullscreenDocument).webkitExitFullscreen?.();
        setIsFullscreen(false);
        return true;
      } catch {
        return false;
      }
    }

    if (!isSupported) return false;
    try {
      const root = document.documentElement as FullscreenElement;
      if (root.requestFullscreen) await root.requestFullscreen();
      else await root.webkitRequestFullscreen?.();
      setIsFullscreen(true);
      return true;
    } catch {
      return false;
    }
  }, [isSupported]);

  return { isFullscreen, isSupported, setFullscreen };
}
