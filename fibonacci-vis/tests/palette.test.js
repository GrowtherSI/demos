import { describe, expect, test } from "vitest";
import { Color } from "three";
import { PALETTES, paletteColor } from "../src/visualizations/palette.js";

const hex = (name, t) =>
  `#${paletteColor(name, t, new Color()).getHexString()}`;

describe("paletteColor", () => {
  test("t = 0 and t = 1 are the first and last stops of each palette", () => {
    for (const [name, stops] of Object.entries(PALETTES)) {
      expect(hex(name, 0)).toBe(stops[0]);
      expect(hex(name, 1)).toBe(stops[stops.length - 1]);
    }
  });

  test("t = 0.5 is the middle stop", () => {
    expect(hex("ocean", 0.5)).toBe(PALETTES.ocean[1]);
  });

  test("t between stops interpolates", () => {
    const c = paletteColor("mono", 0.25, new Color());
    const a = new Color(PALETTES.mono[0]);
    const b = new Color(PALETTES.mono[1]);
    expect(c.r).toBeCloseTo((a.r + b.r) / 2, 6);
  });

  test("t is clamped to 0..1 and a non-finite t reads as 0", () => {
    expect(hex("aurora", -3)).toBe(PALETTES.aurora[0]);
    expect(hex("aurora", 7)).toBe(PALETTES.aurora[2]);
    expect(hex("aurora", NaN)).toBe(PALETTES.aurora[0]);
  });

  test("an unknown palette falls back to sunflower", () => {
    expect(hex("nope", 1)).toBe(PALETTES.sunflower[2]);
  });

  test("writes into and returns the target", () => {
    const target = new Color();
    expect(paletteColor("ocean", 0, target)).toBe(target);
  });

  test("palettes are frozen", () => {
    expect(Object.isFrozen(PALETTES)).toBe(true);
  });
});
