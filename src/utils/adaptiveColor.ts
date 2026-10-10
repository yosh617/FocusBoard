export type Rgb = { r: number; g: number; b: number };
export type ImageSampleRegion = { x: number; y: number; width: number; height: number };
export type ImageColorProfile = { average: Rgb; samples: Rgb[] };

export type AdaptivePalette = {
  text: string;
  textContrast: number;
  accent: string;
  accentStrong: string;
};
export type AdaptiveAccentOptions = {
  maxChroma: number;
  minLightness: number;
  maxLightness: number;
};

export const defaultAdaptiveAccentOptions: AdaptiveAccentOptions = {
  maxChroma: 0.18,
  minLightness: 0.64,
  maxLightness: 0.84
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

function srgbToLinear(value: number) {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
}

function rgbToOklch({ r, g, b }: Rgb) {
  const red = srgbToLinear(r);
  const green = srgbToLinear(g);
  const blue = srgbToLinear(b);
  const l = Math.cbrt(.4122214708 * red + .5363325363 * green + .0514459929 * blue);
  const m = Math.cbrt(.2119034982 * red + .6806995451 * green + .1073969566 * blue);
  const s = Math.cbrt(.0883024619 * red + .2817188376 * green + .6299787005 * blue);
  const lightness = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const bAxis = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return {
    lightness,
    chroma: Math.hypot(a, bAxis),
    hue: (Math.atan2(bAxis, a) * 180 / Math.PI + 360) % 360
  };
}

function oklchToLinearRgb(lightness: number, chroma: number, hue: number): Rgb {
  const angle = hue * Math.PI / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const lRoot = lightness + .3963377774 * a + .2158037573 * b;
  const mRoot = lightness - .1055613458 * a - .0638541728 * b;
  const sRoot = lightness - .0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    b: -.0041960863 * l - .7034186147 * m + 1.707614701 * s
  };
}

function isLinearRgbInGamut({ r, g, b }: Rgb) {
  return r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
}

function linearToSrgb(value: number) {
  const channel = clamp(value, 0, 1);
  return channel <= .0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - .055;
}

function oklchToHex(lightness: number, chroma: number, hue: number) {
  let low = 0;
  let high = chroma;
  let linearRgb = oklchToLinearRgb(lightness, high, hue);
  if (!isLinearRgbInGamut(linearRgb)) {
    for (let index = 0; index < 16; index += 1) {
      const middle = (low + high) / 2;
      const candidate = oklchToLinearRgb(lightness, middle, hue);
      if (isLinearRgbInGamut(candidate)) low = middle;
      else high = middle;
    }
    linearRgb = oklchToLinearRgb(lightness, low, hue);
  }
  const encoded: Rgb = {
    r: linearToSrgb(linearRgb.r) * 255,
    g: linearToSrgb(linearRgb.g) * 255,
    b: linearToSrgb(linearRgb.b) * 255
  };
  return rgbToHex(encoded);
}

function createAdaptiveAccent(source: Rgb, options: AdaptiveAccentOptions) {
  const sourceOklch = rgbToOklch(source);
  const isNeutral = sourceOklch.chroma < .008;
  const hue = isNeutral ? 220 : sourceOklch.hue;
  const lightness = clamp(sourceOklch.lightness, options.minLightness, options.maxLightness);
  const chroma = Math.min(isNeutral ? .06 : sourceOklch.chroma, options.maxChroma);
  return oklchToHex(lightness, chroma, hue);
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

function minimumContrastForSamples(samples: Rgb[], color: string) {
  const candidate = hexToRgb(color);
  if (!candidate || !samples.length) return 0;
  return samples.reduce((minimum, sample) => Math.min(minimum, contrastRatio(sample, candidate)), Number.POSITIVE_INFINITY);
}

const darkText: Rgb = { r: 18, g: 42, b: 76 };
const lightText: Rgb = { r: 247, g: 251, b: 255 };

export function getReadableTextColor(background: Rgb) {
  const darkContrast = contrastRatio(background, darkText);
  const lightContrast = contrastRatio(background, lightText);
  if (Math.max(darkContrast, lightContrast) >= 4.5) {
    return darkContrast >= lightContrast ? "#122a4c" : "#f7fbff";
  }
  return darkContrast >= lightContrast ? "#122a4c" : "#f7fbff";
}

export function getReadableTextColorForHex(color: string) {
  return getReadableTextColor(hexToRgb(color) ?? fallbackBackgroundRgb);
}

export function getReadableTextColorFromSamples(samples: Rgb[]) {
  if (!samples.length) return getReadableTextColor(fallbackBackgroundRgb);
  const weakestContrast = (candidate: Rgb) => samples.reduce(
    (minimum, sample) => Math.min(minimum, contrastRatio(sample, candidate)),
    Number.POSITIVE_INFINITY
  );
  const darkScore = weakestContrast(darkText);
  const lightScore = weakestContrast(lightText);
  if (Math.max(darkScore, lightScore) >= 4.5) return darkScore >= lightScore ? "#122a4c" : "#f7fbff";
  return darkScore >= lightScore ? "#122a4c" : "#f7fbff";
}

function capColorChroma(color: string, maxChroma: number) {
  const source = hexToRgb(color);
  if (!source) return color;
  const oklch = rgbToOklch(source);
  return oklchToHex(oklch.lightness, Math.min(oklch.chroma, maxChroma), oklch.hue);
}

export function getStrongAccent(accent: string, maxChroma?: number) {
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
    const candidate = rgbToHex(mixed);
    const bounded = maxChroma === undefined ? candidate : capColorChroma(candidate, maxChroma);
    const boundedRgb = hexToRgb(bounded);
    if (boundedRgb && contrastRatio(boundedRgb, white) >= 4.5) return bounded;
  }
  return maxChroma === undefined ? "#263e5d" : capColorChroma("#263e5d", maxChroma);
}

export function getAdaptivePalette(
  source: Rgb,
  overlayOpacity: number,
  accentOptions: AdaptiveAccentOptions = defaultAdaptiveAccentOptions
): AdaptivePalette {
  const opacity = clamp(overlayOpacity, 0, .85);
  const overlay: Rgb = { r: 241, g: 247, b: 255 };
  const background: Rgb = {
    r: source.r * (1 - opacity) + overlay.r * opacity,
    g: source.g * (1 - opacity) + overlay.g * opacity,
    b: source.b * (1 - opacity) + overlay.b * opacity
  };
  const text = getReadableTextColor(background);
  const accent = createAdaptiveAccent(source, accentOptions);

  return {
    text,
    textContrast: contrastRatio(background, hexToRgb(text) ?? darkText),
    accent,
    accentStrong: getStrongAccent(accent, accentOptions.maxChroma)
  };
}

export function getAdaptivePaletteFromSamples(
  samples: Rgb[],
  overlayOpacity: number,
  accentOptions: AdaptiveAccentOptions = defaultAdaptiveAccentOptions
): AdaptivePalette {
  if (!samples.length) return getAdaptivePalette(fallbackBackgroundRgb, overlayOpacity, accentOptions);
  const source = samples.reduce((total, sample) => ({
    r: total.r + sample.r / samples.length,
    g: total.g + sample.g / samples.length,
    b: total.b + sample.b / samples.length
  }), { r: 0, g: 0, b: 0 });
  const opacity = clamp(overlayOpacity, 0, .85);
  const overlay: Rgb = { r: 241, g: 247, b: 255 };
  const overlaidSamples = samples.map((sample) => ({
    r: sample.r * (1 - opacity) + overlay.r * opacity,
    g: sample.g * (1 - opacity) + overlay.g * opacity,
    b: sample.b * (1 - opacity) + overlay.b * opacity
  }));
  const text = getReadableTextColorFromSamples(overlaidSamples);
  const accent = createAdaptiveAccent(source, accentOptions);
  return {
    text,
    textContrast: minimumContrastForSamples(overlaidSamples, text),
    accent,
    accentStrong: getStrongAccent(accent, accentOptions.maxChroma)
  };
}

export function sampleImageColorProfile(image: HTMLImageElement, region?: ImageSampleRegion): ImageColorProfile | null {
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
    const samples: Rgb[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha < .08) continue;
      const sample = { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] };
      samples.push(sample);
      red += sample.r * alpha;
      green += sample.g * alpha;
      blue += sample.b * alpha;
      weight += alpha;
    }
    return weight ? { average: { r: red / weight, g: green / weight, b: blue / weight }, samples } : null;
  } catch {
    return null;
  }
}

export function sampleImageRgb(image: HTMLImageElement, region?: ImageSampleRegion): Rgb | null {
  return sampleImageColorProfile(image, region)?.average ?? null;
}
