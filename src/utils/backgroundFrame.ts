import type { BackgroundFrame } from "../types/settings";

export type BackgroundImageLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getBackgroundImageLayout(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  frame: BackgroundFrame
): BackgroundImageLayout | null {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return null;
  const coverScale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight);
  const zoom = clamp(frame.scale, 100, 220) / 100;
  const width = imageWidth * coverScale * zoom;
  const height = imageHeight * coverScale * zoom;
  return {
    width,
    height,
    left: -(width - viewportWidth) * clamp(frame.position.x, 0, 1),
    top: -(height - viewportHeight) * clamp(frame.position.y, 0, 1)
  };
}
