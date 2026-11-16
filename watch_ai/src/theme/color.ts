export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "").trim();
  const normalized =
    value.length === 3 ? value.split("").map((channel) => channel + channel).join("") : value;
  const parsed = Number.parseInt(normalized, 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

export function rgbToHex([red, green, blue]: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

export function mixHex(from: string, to: string, amount: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex([
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
    start[2] + (end[2] - start[2]) * t,
  ]);
}

function srgbToLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string) {
  const [red, green, blue] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(red) + 0.7152 * srgbToLinear(green) + 0.0722 * srgbToLinear(blue);
}

export function contrastRatio(background: string, foreground: string) {
  const lighter = Math.max(relativeLuminance(background), relativeLuminance(foreground));
  const darker = Math.min(relativeLuminance(background), relativeLuminance(foreground));
  return (lighter + 0.05) / (darker + 0.05);
}

export function rgbToHsl([red, green, blue]: Rgb): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, saturation, lightness];
}

export function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  return [(red + m) * 255, (green + m) * 255, (blue + m) * 255];
}

export function shiftLightness(hex: string, amount: number) {
  const [hue, saturation, lightness] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb(hue, saturation, Math.max(0, Math.min(1, lightness + amount))));
}

export function shiftHue(hex: string, degrees: number) {
  const [hue, saturation, lightness] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb((hue + degrees + 360) % 360, Math.max(saturation, 0.35), lightness));
}

const INK = "#16141F";
const PAPER = "#FFFFFF";

export function readablePair(background: string, minimum = 4.5) {
  let current = background;
  let adjusted = false;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const onPaper = contrastRatio(current, PAPER);
    const onInk = contrastRatio(current, INK);
    const foreground = onPaper >= onInk ? PAPER : INK;
    const ratio = Math.max(onPaper, onInk);
    if (ratio >= minimum) {
      return { background: current, foreground, ratio, adjusted };
    }
    adjusted = true;
    current = foreground === PAPER ? shiftLightness(current, -0.06) : shiftLightness(current, 0.06);
  }
  const onPaper = contrastRatio(current, PAPER);
  const onInk = contrastRatio(current, INK);
  return onPaper >= onInk
    ? { background: current, foreground: PAPER, ratio: onPaper, adjusted }
    : { background: current, foreground: INK, ratio: onInk, adjusted };
}