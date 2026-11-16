import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "jpeg-js";
import { hexToRgb, rgbToHex, rgbToHsl } from "./color";

function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

type Bucket = {
  red: number;
  green: number;
  blue: number;
  count: number;
  saturation: number;
};

function hueDistance(first: number, second: number) {
  const delta = Math.abs(first - second) % 360;
  return Math.min(delta, 360 - delta);
}

export function dominantColors(pixels: Uint8Array) {
  const buckets = new Map<string, Bucket>();
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 160) continue;
    const [hue, saturation, lightness] = rgbToHsl([red, green, blue]);
    if (lightness > 0.93 || lightness < 0.05) continue;
    if (saturation < 0.08 && lightness > 0.82) continue;
    const key = `${Math.round(red / 18)}-${Math.round(green / 18)}-${Math.round(blue / 18)}`;
    const current = buckets.get(key);
    if (current) {
      current.count += 1;
      current.red += red;
      current.green += green;
      current.blue += blue;
      current.saturation += saturation;
    } else {
      buckets.set(key, { red, green, blue, count: 1, saturation });
    }
  }

  const ranked = [...buckets.values()]
    .map((bucket) => {
      const red = bucket.red / bucket.count;
      const green = bucket.green / bucket.count;
      const blue = bucket.blue / bucket.count;
      const [hue, saturation] = rgbToHsl([red, green, blue]);
      return {
        hue,
        saturation,
        score: bucket.count * (0.35 + saturation),
        hex: rgbToHex([red, green, blue]),
      };
    })
    .sort((left, right) => right.score - left.score);

  const picked: { hue: number; hex: string }[] = [];
  for (const color of ranked) {
    if (picked.every((item) => hueDistance(item.hue, color.hue) > 24)) {
      picked.push(color);
    }
    if (picked.length === 2) break;
  }

  if (picked.length === 0 && ranked[0]) picked.push(ranked[0]);
  return picked.map((color) => color.hex);
}

export async function extractColorsFromLogo(uri: string) {
  const sample = await manipulateAsync(uri, [{ resize: { width: 36 } }], {
    compress: 0.85,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!sample.base64) {
    throw new Error("Could not read colors from that logo.");
  }

  const decoded = decode(base64ToBytes(sample.base64), { useTArray: true, formatAsRGBA: true });
  const colors = dominantColors(decoded.data);
  if (colors.length === 0) {
    throw new Error("That logo has no strong color. Try one with a colored mark or background.");
  }

  const preview = await manipulateAsync(uri, [{ resize: { width: 220 } }], {
    compress: 0.72,
    format: SaveFormat.JPEG,
    base64: true,
  });
  const previewUri = preview.base64 ? `data:image/jpeg;base64,${preview.base64}` : sample.uri;
  return { colors, previewUri };
}

export function swatchLabel(hex: string) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgb ${red} ${green} ${blue}`;
}