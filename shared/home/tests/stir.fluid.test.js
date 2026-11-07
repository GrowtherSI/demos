/**
 * The GPU fluid, against a recording renderer: which pass draws into which
 * target, in what order, with which uniforms. The shaders themselves are
 * GLSL strings — exercised on a real GPU, not here.
 */
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLUID, createFluid, makeDoubleTarget } from "../src/stir/fluid.js";

/** A WebGLRenderer stand-in that logs each pass as "material → target". */
function recorder() {
  const passes = [];
  let target = null;
  return {
    passes,
    setRenderTarget: vi.fn((t) => {
      target = t;
    }),
    render: vi.fn((scene) => {
      passes.push({ material: scene.children[0].material.name, target });
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("makeDoubleTarget", () => {
  it("swaps read and write, reports its texel size, and disposes both", () => {
    const pair = makeDoubleTarget(10, 20);
    const a = pair.read;
    const b = pair.write;
    expect(a).not.toBe(b);
    expect(a.texture.type).toBe(THREE.HalfFloatType);
    expect(pair.texelSize.toArray()).toEqual([0.1, 0.05]);
    pair.swap();
    expect(pair.read).toBe(b);
    expect(pair.write).toBe(a);
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    pair.dispose();
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});

describe("createFluid", () => {
  it("sizes the velocity grid at simScale and the ink at dyeScale, never under 8", () => {
    const fluid = createFluid(recorder(), 1200, 800);
    expect(fluid.texture.image.width).toBe(600);
    expect(fluid.texture.image.height).toBe(400);
    const tiny = createFluid(recorder(), 4, 4);
    expect(tiny.texture.image.width).toBe(8);
    fluid.dispose();
    tiny.dispose();
  });

  it("exposes the ink and flow fields with their texel sizes for the display pass", () => {
    const fluid = createFluid(recorder(), 400, 200);
    expect(fluid.texture.image.width).toBe(200);
    expect(fluid.texelSize.toArray()).toEqual([1 / 200, 1 / 100]);
    expect(fluid.velocityTexture.image.width).toBe(100);
    expect(fluid.velocityTexelSize.toArray()).toEqual([1 / 100, 1 / 50]);
    expect(fluid.velocityTexture).not.toBe(fluid.texture);
    fluid.dispose();
  });

  it("queues splats until the next step", () => {
    const fluid = createFluid(recorder(), 100, 100);
    expect(fluid.pending).toBe(0);
    fluid.splat(0.5, 0.5, 0.01, 0, 0.3);
    expect(fluid.pending).toBe(1);
    fluid.step(1 / 60);
    expect(fluid.pending).toBe(0);
  });

  it("runs the passes in solver order: splats, curl, vorticity, projection, advection", () => {
    const r = recorder();
    const settings = { ...FLUID, pressureIterations: 3 };
    const fluid = createFluid(r, 100, 50, settings);
    fluid.splat(0.25, 0.75, 0.02, -0.01, 0.4);
    fluid.step(1 / 60);
    expect(r.passes.map((p) => p.material)).toEqual([
      "splat",
      "splat",
      "splat",
      "curl",
      "vorticity",
      "divergence",
      "pressure",
      "pressure",
      "pressure",
      "gradient",
      "advect",
      "advect",
    ]);
    // Every pass draws into a render target, never the screen.
    for (const p of r.passes)
      expect(p.target).toBeInstanceOf(THREE.WebGLRenderTarget);
    // The splats land in the velocity grid, then twice in the ink grid…
    expect(r.passes[0].target.width).toBe(25);
    expect(r.passes[1].target.width).toBe(50);
    expect(r.passes[2].target.width).toBe(50);
    // …and the final advection writes the ink that `texture` now reads.
    expect(fluid.texture).toBe(r.passes.at(-1).target.texture);
    fluid.dispose();
  });

  it("skips the flow pass for an ink-only splat and the ink passes for a flow-only one", () => {
    const r = recorder();
    const fluid = createFluid(r, 100, 50, { ...FLUID, pressureIterations: 1 });
    fluid.splat(0.5, 0.5, 0, 0, 0.3); // ink alone: ink + agitation
    fluid.splat(0.5, 0.5, 0.01, 0, 0); // flow alone
    fluid.step(1 / 60);
    expect(r.passes.slice(0, 3).map((p) => p.material)).toEqual([
      "splat",
      "splat",
      "splat",
    ]);
    expect(r.passes.slice(0, 3).map((p) => p.target.width)).toEqual([
      50, 50, 25,
    ]);
    expect(r.passes[3].material).toBe("curl");
    fluid.dispose();
  });

  it("scales a splat's footprint, restoring the default for the next", () => {
    const r = recorder();
    const radii = [];
    r.render.mockImplementation((scene) => {
      const m = scene.children[0].material;
      if (m.name === "splat") radii.push(m.uniforms.uRadius.value);
    });
    const fluid = createFluid(r, 100, 50);
    fluid.splat(0.5, 0.5, 0.01, 0, 0.3, 0.5);
    fluid.splat(0.5, 0.5, 0.01, 0, 0.3);
    fluid.step(1 / 60);
    const base = FLUID.splatRadius;
    expect(radii[0]).toBeCloseTo(base * 0.5);
    expect(radii[1]).toBeCloseTo(base * 0.5);
    expect(radii[2]).toBeCloseTo(base * 0.5 * FLUID.agitationSpread);
    expect(radii[3]).toBeCloseTo(base);
    expect(radii[4]).toBeCloseTo(base);
    expect(radii[5]).toBeCloseTo(base * FLUID.agitationSpread);
    fluid.dispose();
  });

  it("ping-pongs: the ink texture alternates between steps", () => {
    const fluid = createFluid(recorder(), 100, 100);
    const first = fluid.texture;
    fluid.step(1 / 60);
    expect(fluid.texture).not.toBe(first);
    fluid.step(1 / 60);
    expect(fluid.texture).toBe(first);
    fluid.dispose();
  });

  it("feeds each pass its uniforms: splat force, time step, and decay per second", () => {
    const r = recorder();
    const seen = [];
    r.render.mockImplementation((scene) => {
      const m = scene.children[0].material;
      const u = {};
      for (const [k, v] of Object.entries(m.uniforms))
        u[k] =
          v.value?.isVector2 || v.value?.isVector3
            ? v.value.toArray()
            : v.value;
      seen.push({ name: m.name, u });
    });
    const dt = 1 / 50;
    const fluid = createFluid(r, 200, 100);
    fluid.splat(0.3, 0.6, 0.01, 0.02, 0.25);
    fluid.step(dt);

    const [vSplat, dSplat, aSplat] = seen.filter((s) => s.name === "splat");
    expect(vSplat.u.uPoint).toEqual([0.3, 0.6]);
    expect(vSplat.u.uColor[0]).toBeCloseTo(0.01 * FLUID.splatForce);
    expect(vSplat.u.uColor[1]).toBeCloseTo(0.02 * FLUID.splatForce);
    expect(vSplat.u.uAspect).toBe(2);
    expect(vSplat.u.uRadius).toBe(FLUID.splatRadius);
    expect(dSplat.u.uColor).toEqual([0.25, 0, 0]);
    expect(dSplat.u.uRadius).toBe(FLUID.splatRadius);
    // The agitation halo: wider, in the green channel, scaled from the ink.
    expect(aSplat.u.uColor[1]).toBeCloseTo(0.25 * FLUID.agitationGain);
    expect(aSplat.u.uColor[0]).toBe(0);
    expect(aSplat.u.uRadius).toBeCloseTo(
      FLUID.splatRadius * FLUID.agitationSpread,
    );

    const vorticity = seen.find((s) => s.name === "vorticity");
    expect(vorticity.u.uDt).toBe(dt);
    expect(vorticity.u.uCurlStrength).toBe(FLUID.curl);
    // Texel size is the velocity grid's (50×25 for a 200×100 canvas).
    expect(vorticity.u.uTexel).toEqual([1 / 50, 1 / 25]);

    const [vAdvect, dAdvect] = seen.filter((s) => s.name === "advect");
    expect(vAdvect.u.uDecay).toBeCloseTo(1 / (1 + FLUID.velocityDecay * dt));
    expect(dAdvect.u.uDecay).toBeCloseTo(1 / (1 + FLUID.dyeDecay * dt));
    expect(vAdvect.u.uDt).toBe(dt);
    fluid.dispose();
  });

  it("resize reallocates every grid for the new size", () => {
    const fluid = createFluid(recorder(), 100, 100);
    const before = fluid.texture;
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    fluid.resize(400, 200);
    // velocity ×2, pressure ×2, curl, divergence, dye ×2
    expect(dispose).toHaveBeenCalledTimes(8);
    expect(fluid.texture).not.toBe(before);
    expect(fluid.texture.image.width).toBe(200);
    expect(fluid.texture.image.height).toBe(100);
    fluid.dispose();
  });

  it("dispose frees the grids, the quad and every material", () => {
    const fluid = createFluid(recorder(), 100, 100);
    const targets = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const materials = vi.spyOn(THREE.ShaderMaterial.prototype, "dispose");
    const geometries = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    fluid.dispose();
    expect(targets).toHaveBeenCalledTimes(8);
    expect(materials).toHaveBeenCalledTimes(7);
    expect(geometries).toHaveBeenCalledTimes(1);
  });
});
