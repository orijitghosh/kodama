/**
 * Colour arithmetic, used for seasonal palette modulation and (at 2.5) the
 * language tint.
 *
 * Hand-rolled and integer-quantised for the same reason the date maths is
 * (D-014): these values end up in the emitted bytes, and determinism is a
 * product guarantee. Every function here rounds to whole channel values, so
 * two hosts cannot disagree about a rounding mode and produce two trees.
 */

export interface Hsl {
  /** Degrees, 0..360. */
  h: number;
  /** Per cent, 0..100. */
  s: number;
  /** Per cent, 0..100. */
  l: number;
}

export class KodamaColorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KodamaColorError";
  }
}

const HEX = /^#[0-9a-f]{6}$/;

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const lower = hex.toLowerCase();
  if (!HEX.test(lower)) {
    throw new KodamaColorError(`expected #rrggbb, received ${hex}`);
  }
  return {
    r: Number.parseInt(lower.slice(1, 3), 16),
    g: Number.parseInt(lower.slice(3, 5), 16),
    b: Number.parseInt(lower.slice(5, 7), 16),
  };
}

function channel(value: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

export function toHex(r: number, g: number, b: number): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = parseHex(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const light = Math.min(100, Math.max(0, l)) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const sector = Math.floor(hue / 60) % 6;
  const rgb: Array<[number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = rgb[sector] ?? [0, 0, 0];

  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export interface ColorShift {
  /** Absolute hue target to lerp toward, in degrees. */
  towardHue?: number;
  /** How far to lerp toward `towardHue`, 0..1. */
  towardAmount?: number;
  /** Added to hue, in degrees. Applied after any lerp. */
  rotate?: number;
  /** Multiplies saturation. */
  saturate?: number;
  /** Multiplies lightness. */
  lighten?: number;
}

/**
 * Applies a shift and quantises straight back to a hex string.
 *
 * Deliberately not chainable: every intermediate would carry float error into
 * the next step, and the emitted byte is what has to be reproducible, not the
 * intermediate.
 */
export function shiftHex(hex: string, shift: ColorShift): string {
  const hsl = hexToHsl(hex);
  let h = hsl.h;

  if (shift.towardHue !== undefined && shift.towardAmount !== undefined) {
    h = h + (shift.towardHue - h) * shift.towardAmount;
  }
  if (shift.rotate !== undefined) h += shift.rotate;

  return hslToHex({
    h,
    s: hsl.s * (shift.saturate ?? 1),
    l: hsl.l * (shift.lighten ?? 1),
  });
}
