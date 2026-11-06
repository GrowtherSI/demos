import { Color } from "three";

/** Colour stops for each palette, interpolated along the point index. */
export const PALETTES = Object.freeze({
  sunflower: ["#3b1f0b", "#d98e04", "#ffe066"],
  ocean: ["#03045e", "#0077b6", "#90e0ef"],
  aurora: ["#2d00f7", "#f20089", "#00f5d4"],
  mono: ["#555b6e", "#b8bfd0", "#ffffff"],
});

const tmp = new Color();

/**
 * Write the palette colour at position t (0..1) into `target`.
 * @param {string} name
 * @param {number} t
 * @param {Color} target
 * @returns {Color}
 */
export function paletteColor(name, t, target) {
  const stops = PALETTES[name] || PALETTES.sunflower;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const seg = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  target.set(stops[i]);
  tmp.set(stops[i + 1]);
  return target.lerp(tmp, f);
}
