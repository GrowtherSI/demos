/**
 * The jack pool: when jacks surface, where, how they tumble and drift, how
 * they sink, and what it hands the InstancedMesh. The shape is checked too.
 */
import { describe, expect, it } from "vitest";
import { JACKS, JackPool, createJackGeometry } from "../src/stir/jacks.js";

/** A random source that replays `values` in order, forever. */
const replay = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("JackPool.stir", () => {
  it("surfaces nothing for a slow pointer", () => {
    const pool = new JackPool(JACKS, replay([0]));
    pool.stir(0, 0, 2, 0, 1 / 60); // 120 px/s, under minSpeed
    expect(pool.count).toBe(0);
    expect(pool.budget).toBe(0);
  });

  it("surfaces one jack per `perPixel` of fast travel, carrying the rest over", () => {
    const pool = new JackPool(JACKS, replay([0]));
    const px = 1 / JACKS.perPixel; // travel worth exactly one jack
    pool.stir(0, 0, px * 1.5, 0, 1 / 60);
    expect(pool.count).toBe(1);
    expect(pool.budget).toBeCloseTo(0.5);
    pool.stir(0, 0, px * 0.5, 0, 1 / 60);
    expect(pool.count).toBe(2);
    expect(pool.budget).toBeCloseTo(0);
  });

  it("never holds more than `max` jacks, but still drains the budget", () => {
    const pool = new JackPool({ ...JACKS, max: 2 }, replay([0]));
    pool.stir(0, 0, 10 / JACKS.perPixel, 0, 1 / 60);
    expect(pool.count).toBe(2);
    expect(pool.budget).toBeLessThan(1);
  });

  it("refuses a direct spawn into a full pool, and says so", () => {
    const pool = new JackPool({ ...JACKS, max: 1 }, replay([0]));
    expect(pool.spawn(0, 0, 0, 0)).toBe(true);
    expect(pool.spawn(0, 0, 0, 0)).toBe(false);
    expect(pool.count).toBe(1);
  });
});

describe("JackPool.spawn", () => {
  it("places the jack on the ring around the pointer, drifting with it and swirling", () => {
    // angle 0, ring at ringMin, spin direction −1 (rnd < 0.5), then the rest.
    const pool = new JackPool(JACKS, replay([0, 0, 0, 0.9, 0.1, 0.5, 0, 0, 0]));
    pool.spawn(100, 50, 1000, 0);
    const [j] = pool.jacks;
    expect(j.position.x).toBeCloseTo(100 + JACKS.ringMin);
    expect(j.position.y).toBeCloseTo(50);
    expect(j.position.z).toBe(0);
    // carry × (1 − swirl) of the pointer velocity…
    expect(j.velocity.x).toBeCloseTo(1000 * JACKS.carry * (1 - JACKS.swirl));
    // …plus carry × swirl of its speed along the ring, clockwise here.
    expect(j.velocity.y).toBeCloseTo(-1000 * JACKS.carry * JACKS.swirl);
    expect(j.axis.length()).toBeCloseTo(1);
    expect(j.spin).toBe(JACKS.spinMin);
    expect(j.life).toBe(JACKS.lifeMin);
    expect(j.age).toBe(0);
    expect(j.fade).toBe(0);
  });

  it("swirls counter-clockwise when the coin lands the other way", () => {
    const pool = new JackPool(
      JACKS,
      replay([0, 0, 0.9, 0.9, 0.1, 0.5, 0, 0, 0]),
    );
    pool.spawn(0, 0, 1000, 0);
    expect(pool.jacks[0].velocity.y).toBeCloseTo(
      1000 * JACKS.carry * JACKS.swirl,
    );
  });

  it("falls back to a vertical spin axis when the random one is degenerate", () => {
    const pool = new JackPool(JACKS, replay([0, 0, 0, 0.5, 0.5, 0.5, 0, 0, 0]));
    pool.spawn(0, 0, 0, 0);
    expect(pool.jacks[0].axis.toArray()).toEqual([0, 1, 0]);
  });

  it("spreads jacks over the full ring with the real random source", () => {
    const pool = new JackPool();
    for (let i = 0; i < 40; i++) pool.spawn(0, 0, 500, 500);
    for (const j of pool.jacks) {
      const r = Math.hypot(j.position.x, j.position.y);
      expect(r).toBeGreaterThanOrEqual(JACKS.ringMin - 1e-9);
      expect(r).toBeLessThanOrEqual(JACKS.ringMax + 1e-9);
      expect(j.life).toBeGreaterThanOrEqual(JACKS.lifeMin);
      expect(j.life).toBeLessThanOrEqual(JACKS.lifeMax);
    }
  });
});

describe("JackPool.update", () => {
  const surfaced = () => {
    const pool = new JackPool(JACKS, replay([0]));
    pool.spawn(0, 0, 600, 0);
    return pool;
  };

  it("surfaces: scale and fade rise to full by `surfaceUntil`", () => {
    const pool = surfaced();
    pool.update(JACKS.lifeMin * JACKS.surfaceUntil * 0.5);
    const [j] = pool.jacks;
    expect(j.scale).toBeGreaterThan(0);
    expect(j.scale).toBeLessThan(JACKS.size);
    expect(j.fade).toBeCloseTo(0.5);
    pool.update(JACKS.lifeMin * JACKS.surfaceUntil * 0.5);
    expect(j.scale).toBeCloseTo(JACKS.size);
    expect(j.fade).toBeCloseTo(1);
    expect(j.position.z).toBeCloseTo(0);
  });

  it("drifts with drag and keeps tumbling", () => {
    const pool = surfaced();
    const [j] = pool.jacks;
    const before = j.quaternion.clone();
    const speed0 = j.velocity.length();
    pool.update(0.1);
    expect(j.velocity.length()).toBeCloseTo(
      speed0 * Math.exp(-JACKS.drag * 0.1),
    );
    expect(j.position.x).toBeGreaterThan(0);
    expect(j.quaternion.angleTo(before)).toBeGreaterThan(0);
  });

  it("sinks: shrinks, fades and recedes from `sinkFrom` onwards", () => {
    const pool = surfaced();
    const life = JACKS.lifeMin;
    const mid = (JACKS.sinkFrom + 1) / 2;
    pool.update(life * mid);
    const [j] = pool.jacks;
    expect(j.scale).toBeCloseTo(JACKS.size * (1 - 0.4 * 0.5));
    expect(j.fade).toBeCloseTo(0.5);
    expect(j.position.z).toBeCloseTo(-JACKS.sinkDepth * 0.5);
  });

  it("retires a jack at the end of its life", () => {
    const pool = surfaced();
    pool.update(JACKS.lifeMin * 0.9);
    expect(pool.count).toBe(1);
    pool.update(JACKS.lifeMin * 0.1);
    expect(pool.count).toBe(0);
  });
});

describe("JackPool.fill", () => {
  it("writes one matrix and fade per jack and reports the count", () => {
    const pool = new JackPool(JACKS, replay([0]));
    pool.spawn(10, 20, 0, 0);
    pool.spawn(30, 40, 0, 0);
    pool.update(JACKS.lifeMin * JACKS.surfaceUntil);
    const matrices = new Float32Array(16 * 4);
    const fades = new Float32Array(4);
    expect(pool.fill(matrices, fades)).toBe(2);
    // Translation lives in the last column.
    expect(matrices[12]).toBeCloseTo(10 + JACKS.ringMin);
    expect(matrices[13]).toBeCloseTo(20);
    expect(matrices[16 + 12]).toBeCloseTo(30 + JACKS.ringMin);
    expect(fades[0]).toBeCloseTo(1);
    expect(fades[1]).toBeCloseTo(1);
    expect(fades[2]).toBe(0);
  });

  it("never writes past the buffers it is given", () => {
    const pool = new JackPool(JACKS, replay([0]));
    for (let i = 0; i < 3; i++) pool.spawn(0, 0, 0, 0);
    const matrices = new Float32Array(16 * 2);
    const fades = new Float32Array(2);
    expect(pool.fill(matrices, fades)).toBe(2);
  });

  it("keeps a just-surfaced (zero-scale) jack's matrix invertible", () => {
    const pool = new JackPool(JACKS, replay([0]));
    pool.spawn(0, 0, 0, 0);
    const matrices = new Float32Array(16);
    pool.fill(matrices, new Float32Array(1));
    expect(matrices[0]).not.toBe(0);
    expect(Number.isFinite(matrices[0])).toBe(true);
  });
});

describe("createJackGeometry", () => {
  it("is three crossed rods with knobbed ends, one unit across", () => {
    const geometry = createJackGeometry();
    expect(geometry.index).not.toBeNull();
    expect(geometry.attributes.position.count).toBeGreaterThan(100);
    expect(geometry.attributes.normal.count).toBe(
      geometry.attributes.position.count,
    );
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    for (const axis of ["x", "y", "z"]) {
      expect(max[axis]).toBeCloseTo(0.5 + 0.16, 5);
      expect(min[axis]).toBeCloseTo(-(0.5 + 0.16), 5);
    }
    geometry.dispose();
  });
});
