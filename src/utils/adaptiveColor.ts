export type Rgb = { r: number; g: number; b: number };
export type ImageSampleRegion = { x: number; y: number; width: number; height: number };

export type AdaptivePalette = {
  text: string;
  accent: string;
  accentStrong: string;
};

export const fallbackBackgroundRgb: Rgb = { r: 195, g: 221, b: 247 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function channelLuminance(value: number) {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: Rgb) {
  return .2126 * channelLuminance(r) + .7152 * channelLuminance(g) + .0722 * channelLuminance(b);
}

function contrastRatio(a: Rgb, b: Rgb) {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + .05) / (dark + .05);
}

function rgbToHue({ r, g, b }: Rgb) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta < .04) return 205;
  const segment = max === red
    ? ((green - blue) / delta) % 6
    : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return Math.round((segment * 60 + 360) % 360);
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - chroma / 2;
  const [red, green, blue] = hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
      : hue < 180 ? [0, chroma, x]
        : hue < 240 ? [0, x, chroma]
          : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[red, green, blue].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(value: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return { r: number >> 16, g: number >> 8 & 255, b: number & 255 };
}

const darkText: Rgb = { r: 18, g: 42, b: 76 };
const lightText: Rgb = { r: 247, g: 251, b: 255 };
const blackText: Rgb = { r: 0, g: 0, b: 0 };
const whiteText: Rgb = { r: 255, g: 255, b: 255 };

export function getReadableTextColor(background: Rgb) {
  const darkContrast = contrastRatio(background, darkText);
  const lightContrast = contrastRatio(background, lightText);
  if (Math.max(darkContrast, lightContrast) >= 4.5) {
    return darkContrast >= lightContrast ? "#122a4c" : "#f7fbff";
  }
  return contrastRatio(background, blackText) >= contrastRatio(background, whiteText) ? "#000000" : "#ffffff";
}

export function getStrongAccent(accent: string) {
  const source = hexToRgb(accent);
  if (!source) return "#315f98";
  const white: Rgb = { r: 255, g: 255, b: 255 };
  const dark: Rgb = { r: 11, g: 27, b: 47 };
  for (let amount = .12; amount <= .72; amount += .06) {
    const mixed: Rgb = {
      r: source.r * (1 - amount) + dark.r * amount,
      g: source.g * (1 - amount) + dark.g * amount,
      b: source.b * (1 - amount) + dark.b * amount
    };
    if (contrastRatio(mixed, white) >= 4.5) return rgbToHex(mixed);
  }
  return "#263e5d";
}

export function getAdaptivePalette(source: Rgb, overlayOpacity: number): AdaptivePalette {
  const opacity = clamp(overlayOpacity, 0, .85);
  const overlay: Rgb = { r: 241, g: 247, b: 255 };
  const background: Rgb = {
    r: source.r * (1 - opacity) + overlay.r * opacity,
    g: source.g * (1 - opacity) + overlay.g * opacity,
    b: source.b * (1 - opacity) + overlay.b * opacity
  };
  const text = getReadableTextColor(background);
  const hue = rgbToHue(source);

  return {
    text,
    accent: hslToHex(hue, 88, 61),
    accentStrong: hslToHex(hue, 72, 39)
  };
}

export function sampleImageRgb(image: HTMLImageElement, region?: ImageSampleRegion): Rgb | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const sourceX = region ? clamp(region.x, 0, image.naturalWidth - 1) : 0;
    const sourceY = region ? clamp(region.y, 0, image.naturalHeight - 1) : 0;
    const sourceWidth = region ? clamp(region.width, 1, image.naturalWidth - sourceX) : image.naturalWidth;
    const sourceHeight = region ? clamp(region.height, 1, image.naturalHeight - sourceY) : image.naturalHeight;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let weight = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha < .08) continue;
      red += pixels[index] * alpha;
      green += pixels[index + 1] * alpha;
      blue += pixels[index + 2] * alpha;
      weight += alpha;
    }
    return weight ? { r: red / weight, g: green / weight, b: blue / weight } : null;
  } catch {
    return null;
  }
}
