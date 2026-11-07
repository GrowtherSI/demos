// @vitest-environment jsdom
//
// The background's lifecycle: when it declines to mount, how it lays out and
// paints, how pointer strokes become splats and jacks, when the loop runs and
// when it sleeps, and that dispose leaves nothing behind. jsdom has no WebGL,
// so the renderer is a stand-in and the fluid is a stub (fluid.test.js covers
// it); the jacks, scenes, cameras and materials are the real three.js objects.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  renderers: [],
  rendererError: null,
  fluids: [],
}));

vi.mock("three", async (importOriginal) => {
  const THREE = await importOriginal();
  class WebGLRenderer {
    constructor(options) {
      if (h.rendererError) throw h.rendererError;
      this.options = options;
      this.autoClear = true;
      this.setClearColor = vi.fn();
      this.setPixelRatio = vi.fn();
      this.setSize = vi.fn();
      this.setRenderTarget = vi.fn();
      this.clear = vi.fn();
      this.render = vi.fn();
      this.dispose = vi.fn();
      h.renderers.push(this);
    }
  }
  return { ...THREE, WebGLRenderer };
});

vi.mock("../src/stir/fluid.js", () => ({
  createFluid: vi.fn((renderer, w, h2) => {
    const fluid = {
      width: w,
      height: h2,
      texture: { isTexture: true },
      texelSize: { x: 1 / 600, y: 1 / 400, isVector2: true },
      velocityTexture: { isTexture: true },
      velocityTexelSize: { x: 1 / 300, y: 1 / 200, isVector2: true },
      splat: vi.fn(),
      step: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    h.fluids.push(fluid);
    return fluid;
  }),
}));

import { STIR, inkFor, mountStirBackground } from "../src/stir/background.js";
import { JACKS } from "../src/stir/jacks.js";

// ── Browser stand-ins ────────────────────────────────────────────────────────

let reducedMotion = false;
let gl;
let hidden = false;
/** Timers set with window.setTimeout, fired by hand. */
let timers;
let timerId = 0;
let clearedTimers;
/** Pending requestAnimationFrame callbacks, run by hand with tick(). */
let rafQueue;
let rafId;
let cancelled;
let now;

function tick(dt = 1 / 60) {
  now += dt * 1000;
  const callbacks = rafQueue.splice(0);
  for (const [, cb] of callbacks) cb(now);
}

function move(x, y, t) {
  const e = new MouseEvent("pointermove", { clientX: x, clientY: y });
  Object.defineProperty(e, "timeStamp", { value: t });
  window.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  h.renderers.length = 0;
  h.fluids.length = 0;
  h.rendererError = null;
  reducedMotion = false;
  hidden = false;
  rafQueue = [];
  rafId = 0;
  cancelled = [];
  now = 1000;

  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  window.matchMedia = vi.fn(() => ({ matches: reducedMotion }));
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1200,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 2,
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 0,
    writable: true,
  });

  gl = { getExtension: vi.fn(() => ({})) };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => gl,
  );
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    rafQueue.push([++rafId, cb]);
    return rafId;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    cancelled.push(id);
    rafQueue = rafQueue.filter(([i]) => i !== id);
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  timers = [];
  clearedTimers = [];
  vi.spyOn(window, "setTimeout").mockImplementation((cb, ms) => {
    timers.push({ id: ++timerId, cb, ms });
    return timerId;
  });
  vi.spyOn(window, "clearTimeout").mockImplementation((id) => {
    clearedTimers.push(id);
  });
});

/** Every background mounted by the current test, disposed after it so its
    window listeners do not outlive it. */
let mounted = [];
function mount() {
  const bg = mountStirBackground();
  if (bg) mounted.push(bg);
  return bg;
}

afterEach(() => {
  for (const bg of mounted) bg.dispose();
  mounted = [];
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const renderer = () => h.renderers[0];
const fluid = () => h.fluids[0];
const canvas = () => document.querySelector("canvas.stir");

/** Mounts, then strokes fast enough to splat ink and surface jacks. */
function stroke(bg = mount()) {
  move(100, 100, 0);
  move(160, 100, 16); // 60 px in 16 ms: 3750 px/s
  return bg;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("inkFor", () => {
  it("drops a little ink for a slow stroke and the most for a fast one", () => {
    expect(inkFor(0)).toBe(STIR.inkMin);
    expect(inkFor(STIR.inkSpeed)).toBeCloseTo(STIR.inkMax);
    expect(inkFor(STIR.inkSpeed * 10)).toBeCloseTo(STIR.inkMax);
    const half = inkFor(STIR.inkSpeed / 2);
    expect(half).toBeCloseTo(STIR.inkMin + (STIR.inkMax - STIR.inkMin) / 4);
  });
});

describe("mountStirBackground declines", () => {
  it("under prefers-reduced-motion, leaving the CSS gradient alone", () => {
    reducedMotion = true;
    expect(mount()).toBeNull();
    expect(canvas()).toBeNull();
    expect(h.renderers).toHaveLength(0);
  });

  it("without WebGL 2", () => {
    gl = null;
    expect(mount()).toBeNull();
    expect(canvas()).toBeNull();
  });

  it("without float render targets", () => {
    gl.getExtension.mockReturnValue(null);
    expect(mount()).toBeNull();
    expect(gl.getExtension).toHaveBeenCalledWith("EXT_color_buffer_float");
    expect(h.renderers).toHaveLength(0);
  });

  it("when the renderer cannot be created", () => {
    h.rendererError = new Error("no gl");
    expect(mount()).toBeNull();
    expect(canvas()).toBeNull();
  });
});

describe("mounting", () => {
  it("puts an opaque, decorative canvas first in <body> on the page's own context", () => {
    document.body.innerHTML = "<main>content</main>";
    const bg = mount();
    expect(bg).not.toBeNull();
    const cv = canvas();
    expect(document.body.firstElementChild).toBe(cv);
    expect(cv.getAttribute("aria-hidden")).toBe("true");
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith(
      "webgl2",
      expect.objectContaining({ alpha: false, antialias: true }),
    );
    expect(renderer().options).toEqual({ canvas: cv, context: gl });
    expect(renderer().autoClear).toBe(false);
  });

  it("lays out to the viewport, capping the pixel ratio, and paints one frame", () => {
    mount();
    expect(renderer().setPixelRatio).toHaveBeenCalledWith(STIR.maxPixelRatio);
    expect(renderer().setSize).toHaveBeenCalledWith(1200, 800, false);
    expect(fluid().resize).toHaveBeenCalledWith(1200, 800);
    // The first paint: clear, then the gradient; no jacks yet, so one render.
    expect(renderer().setRenderTarget).toHaveBeenCalledWith(null);
    expect(renderer().clear).toHaveBeenCalledTimes(1);
    expect(renderer().render).toHaveBeenCalledTimes(1);
    const [scene] = renderer().render.mock.calls[0];
    const u = scene.children[0].material.uniforms;
    expect(u.uDye.value).toBe(fluid().texture);
    expect(u.uDyeTexel.value.toArray()).toEqual([1 / 600, 1 / 400]);
    expect(u.uVelocity.value).toBe(fluid().velocityTexture);
    expect(u.uVelocityTexel.value.toArray()).toEqual([1 / 300, 1 / 200]);
    expect(u.uRipple.value).toBe(STIR.ripple);
    expect(u.uRim.value).toBe(STIR.rim);
    expect(scene.children[0].material.uniforms.uSize.value.toArray()).toEqual([
      1200, 800,
    ]);
    // Nothing moves until the pointer does.
    expect(rafQueue).toHaveLength(0);
  });

  it("treats a missing devicePixelRatio as 1", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 0,
    });
    mount();
    expect(renderer().setPixelRatio).toHaveBeenCalledWith(1);
  });

  it("places the jack camera so one world unit is one CSS pixel at the surface", () => {
    stroke();
    tick();
    const [scene, camera] = renderer().render.mock.calls.at(-1);
    expect(scene.children[0].isInstancedMesh).toBe(true);
    expect(camera.aspect).toBe(1.5);
    expect(camera.fov).toBe(STIR.fov);
    const visibleHeight =
      2 * camera.position.z * Math.tan((STIR.fov * Math.PI) / 360);
    expect(visibleHeight).toBeCloseTo(800);
  });
});

describe("pointer strokes", () => {
  it("the first position only anchors the stroke", () => {
    mount();
    move(100, 100, 0);
    expect(fluid().splat).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);
  });

  it("a stroke splats ink at the pointer in UV with its travel, and wakes the loop", () => {
    stroke();
    expect(fluid().splat).toHaveBeenCalledTimes(1);
    const [x, y, dx, dy, ink] = fluid().splat.mock.calls[0];
    expect(x).toBeCloseTo(160 / 1200);
    expect(y).toBeCloseTo(1 - 100 / 800);
    expect(dx).toBeCloseTo(60 / 1200);
    expect(dy).toBeCloseTo(0);
    expect(ink).toBeCloseTo(inkFor(60 / 0.016));
    expect(rafQueue).toHaveLength(1);
  });

  it("a stroke that goes nowhere splats nothing", () => {
    mount();
    move(100, 100, 0);
    move(100, 100, 16);
    expect(fluid().splat).not.toHaveBeenCalled();
  });

  it("a jump across the page is a re-entry, not a stroke", () => {
    mount();
    move(100, 100, 0);
    move(100 + STIR.maxStroke + 1, 100, 16);
    expect(fluid().splat).not.toHaveBeenCalled();
    // The landing point is the new anchor, so the next move is a stroke.
    move(400, 100, 32);
    expect(fluid().splat).toHaveBeenCalledTimes(1);
    expect(fluid().splat.mock.calls[0][0]).toBeCloseTo(400 / 1200);
  });

  it("a demo card shields the surface: strokes over it stir nothing", () => {
    document.body.innerHTML =
      '<ul><li class="demo"><a class="demo-link" href="#">Demo</a></li></ul>';
    const link = document.querySelector(".demo-link");
    mount();
    move(100, 100, 0);
    // Onto the card: nothing, and the stroke is dropped…
    const over = new MouseEvent("pointermove", {
      clientX: 160,
      clientY: 100,
      bubbles: true,
    });
    Object.defineProperty(over, "timeStamp", { value: 16 });
    link.dispatchEvent(over);
    expect(fluid().splat).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);
    // …so stepping off it anchors afresh rather than splatting the crossing.
    move(400, 100, 32);
    expect(fluid().splat).not.toHaveBeenCalled();
    move(420, 100, 48);
    expect(fluid().splat).toHaveBeenCalledTimes(1);
  });

  it("leaving the window or losing focus re-anchors the stroke", () => {
    for (const type of ["pointerleave", "blur"]) {
      const bg = mount();
      move(100, 100, 0);
      window.dispatchEvent(new Event(type));
      move(150, 100, 16);
      expect(fluid().splat).not.toHaveBeenCalled();
      bg.dispose();
    }
  });

  it("a fast stroke surfaces jacks, drawn in a second render pass", () => {
    stroke();
    renderer().render.mockClear();
    tick();
    expect(renderer().render).toHaveBeenCalledTimes(2);
    const [scene] = renderer().render.mock.calls[1];
    const mesh = scene.children[0];
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.count).toBeLessThanOrEqual(JACKS.max);
    expect(mesh.geometry.attributes.aFade.array[0]).toBeGreaterThan(0);
  });

  it("a slow stroke stirs ink but surfaces no jacks", () => {
    mount();
    move(100, 100, 0);
    move(102, 100, 16); // 125 px/s
    renderer().render.mockClear();
    tick();
    expect(fluid().splat).toHaveBeenCalledTimes(1);
    expect(renderer().render).toHaveBeenCalledTimes(1);
  });
});

describe("the loop", () => {
  it("steps the fluid and jacks each frame with a clamped dt, then paints", () => {
    stroke();
    tick(1 / 60);
    expect(fluid().step).toHaveBeenCalledTimes(1);
    expect(fluid().step.mock.calls[0][0]).toBeCloseTo(1 / 60);
    // A long gap (tab in the background) is clamped…
    tick(2);
    expect(fluid().step.mock.calls[1][0]).toBe(STIR.maxDt);
    // …and a clock that runs backwards is a zero step, not a negative one.
    now -= 5000;
    tick(0);
    expect(fluid().step.mock.calls[2][0]).toBe(0);
  });

  it("keeps running while settling and while jacks are up, then sleeps", () => {
    stroke();
    const settling = Math.floor(STIR.settleSeconds / STIR.maxDt) - 1;
    for (let i = 0; i < settling; i++) {
      expect(rafQueue).toHaveLength(1);
      tick(STIR.maxDt);
    }
    // Settled, jacks long gone (their longest life is well under settleSeconds).
    expect(JACKS.lifeMax).toBeLessThan(STIR.settleSeconds);
    for (let i = 0; i < 4; i++) tick(STIR.maxDt);
    expect(rafQueue).toHaveLength(0);
    const steps = fluid().step.mock.calls.length;
    tick();
    expect(fluid().step).toHaveBeenCalledTimes(steps);
  });

  it("stays up for lingering jacks even once the ink has settled", () => {
    const bg = mount();
    // Settle without jacks: a slow stroke, then wait it out.
    move(100, 100, 0);
    move(102, 100, 16);
    for (let i = 0; i < Math.ceil(STIR.settleSeconds / STIR.maxDt) + 2; i++)
      tick(STIR.maxDt);
    expect(rafQueue).toHaveLength(0);
    // Now surface jacks with a fast stroke, then let the ink settle again: the
    // loop must outlive settleSeconds while any jack is still sinking.
    stroke(bg);
    for (let i = 0; i < Math.ceil(STIR.settleSeconds / STIR.maxDt) - 1; i++)
      tick(STIR.maxDt);
    expect(rafQueue).toHaveLength(1);
  });

  it("does not queue a second frame while one is pending", () => {
    stroke();
    expect(rafQueue).toHaveLength(1);
    move(220, 100, 32);
    expect(rafQueue).toHaveLength(1);
  });

  it("sleeps when the tab is hidden and resumes when it is shown, if unsettled", () => {
    stroke();
    const [id] = rafQueue[0];
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelled).toEqual([id]);
    expect(rafQueue).toHaveLength(0);
    // Strokes while hidden do not wake it.
    move(200, 100, 48);
    expect(rafQueue).toHaveLength(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(rafQueue).toHaveLength(1);
  });

  it("stays asleep when shown again after everything settled", () => {
    mount();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(rafQueue).toHaveLength(0);
  });

  it("wakes on show for jacks still sinking after the ink settled", () => {
    stroke();
    for (let i = 0; i < Math.ceil(STIR.settleSeconds / STIR.maxDt) - 1; i++)
      tick(STIR.maxDt);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(rafQueue).toHaveLength(1);
  });
});

describe("scroll and resize", () => {
  it("repaints the gradient where the page scrolled to while asleep", () => {
    mount();
    renderer().render.mockClear();
    window.scrollY = 340;
    window.dispatchEvent(new Event("scroll"));
    expect(renderer().render).toHaveBeenCalledTimes(1);
    const [scene] = renderer().render.mock.calls[0];
    expect(scene.children[0].material.uniforms.uScroll.value).toBe(340);
  });

  it("leaves scroll repaints to the running loop while awake", () => {
    stroke();
    renderer().render.mockClear();
    window.dispatchEvent(new Event("scroll"));
    expect(renderer().render).not.toHaveBeenCalled();
  });

  it("re-lays out on resize, repainting at once only while asleep", () => {
    mount();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 400,
    });
    renderer().render.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(renderer().setSize).toHaveBeenLastCalledWith(600, 400, false);
    expect(fluid().resize).toHaveBeenLastCalledWith(600, 400);
    expect(renderer().render).toHaveBeenCalledTimes(1);

    stroke();
    renderer().render.mockClear();
    fluid().resize.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(fluid().resize).toHaveBeenCalledTimes(1);
    expect(renderer().render).not.toHaveBeenCalled();
  });
});

describe("ambient stirs", () => {
  /** Math.random replaying `values`, then 0.5 forever. */
  const randoms = (values) => {
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() =>
      i < values.length ? values[i++] : 0.5,
    );
  };

  it("schedules the first one on mount, between the min and max delay", () => {
    // three.js also draws on Math.random (UUIDs) while mounting, so a constant.
    vi.spyOn(Math, "random").mockReturnValue(0);
    mount();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(STIR.ambientMinDelay * 1000);
    expect(timers[0].cb).toBeInstanceOf(Function);
    mounted.pop().dispose();
    Math.random.mockReturnValue(0.999);
    mount();
    expect(timers[1].ms).toBeCloseTo(
      (STIR.ambientMinDelay +
        0.999 * (STIR.ambientMaxDelay - STIR.ambientMinDelay)) *
        1000,
    );
  });

  it("sets off an eddy — a small core, a wide vortex, fingers — with jacks, wakes the loop, and books the next", () => {
    mount();
    // Next delay, the spot at the viewport's centre, anticlockwise at the
    // gentlest push, then the finger angles (all straight right), then the
    // fewest jacks.
    randoms([
      0.5,
      0.5,
      0.5,
      0.9,
      0,
      0, // size 1×
      1, // full intensity
      ...Array(STIR.ambientFingers).fill(0),
      0,
    ]);
    timers[0].cb();
    const calls = fluid().splat.mock.calls;
    expect(calls).toHaveLength(1 + 8 + STIR.ambientFingers);
    const toPx = ([x, y, dx, dy, ink, scale]) => ({
      px: (x - 0.5) * 1200,
      py: (0.5 - y) * 800,
      tx: dx * 1200,
      ty: -dy * 800,
      ink,
      scale,
    });
    // The core: ink alone, small, at the spot.
    const core = toPx(calls[0]);
    for (const v of [core.px, core.py, core.tx, core.ty])
      expect(v).toBeCloseTo(0);
    expect(core.ink).toBe(STIR.ambientCoreInk);
    expect(core.scale).toBe(STIR.ambientCoreScale);
    // The vortex: flow alone on a wide ring, pushed along it, broad.
    for (const c of calls.slice(1, 9).map(toPx)) {
      expect(Math.hypot(c.px, c.py)).toBeCloseTo(STIR.ambientVortexRadius);
      expect(Math.hypot(c.tx, c.ty)).toBeCloseTo(STIR.ambientVortexPushMin);
      expect(Math.abs(c.px * c.tx + c.py * c.ty)).toBeLessThan(1e-6);
      expect(c.ink).toBe(0);
      expect(c.scale).toBe(STIR.ambientVortexScale);
    }
    // The fingers: a little ink flung straight outward.
    for (const c of calls.slice(9).map(toPx)) {
      expect(c.px).toBeCloseTo(STIR.ambientFingerStart);
      expect(c.py).toBeCloseTo(0);
      expect(c.tx).toBeCloseTo(STIR.ambientFingerPush);
      expect(c.ty).toBeCloseTo(0);
      expect(c.ink).toBe(STIR.ambientFingerInk);
      expect(c.scale).toBe(STIR.ambientFingerScale);
    }
    expect(rafQueue).toHaveLength(1);
    expect(timers).toHaveLength(2);
    renderer().render.mockClear();
    tick();
    const [scene] = renderer().render.mock.calls[1];
    expect(scene.children[0].count).toBe(STIR.ambientJacksMin);
  });

  it("turns each eddy at its own random speed, up to the hardest push", () => {
    mount();
    randoms([0.5, 0.5, 0.5, 0.1, 0.999, 0, 1]);
    timers[0].cb();
    const [, , dx, dy] = fluid().splat.mock.calls[1];
    expect(Math.hypot(dx * 1200, dy * 800)).toBeCloseTo(
      STIR.ambientVortexPushMin +
        0.999 * (STIR.ambientVortexPushMax - STIR.ambientVortexPushMin),
      1,
    );
  });

  it("keeps an eddy stirring through its sustain, then lets it settle", () => {
    mount();
    randoms([0.5, 0.5, 0.5, 0.9, 0, 0, 1]);
    timers[0].cb();
    fluid().splat.mockClear();
    const dt = STIR.maxDt; // frames are clamped to this
    tick(dt);
    // Each frame: the core trickle and the eight vortex pushes, scaled by dt.
    const calls = fluid().splat.mock.calls;
    expect(calls).toHaveLength(9);
    expect(calls[0][4]).toBeCloseTo(
      STIR.ambientCoreInk * STIR.ambientSustainGain * dt,
    );
    const [, , dx, dy] = calls[1];
    expect(Math.hypot(dx * 1200, dy * 800)).toBeCloseTo(
      STIR.ambientVortexPushMin * STIR.ambientSustainGain * dt,
    );
    // Jacks trickle in over the sustain…
    const before = renderer().render.mock.calls.at(-1)[0].children[0].count;
    for (let i = 0; i < Math.round(1 / dt); i++) tick(dt);
    const after = renderer().render.mock.calls.at(-1)[0].children[0].count;
    expect(after).toBeGreaterThanOrEqual(before + STIR.ambientJackTrickle - 1);
    // …and once it has run out, nothing more is added.
    for (let i = 0; i < Math.ceil(STIR.ambientSustain / dt); i++) tick(dt);
    fluid().splat.mockClear();
    tick(dt);
    expect(fluid().splat).not.toHaveBeenCalled();
  });

  it("deals each eddy a size up to ambientSizeMax and an intensity down to very subtle", () => {
    mount();
    // Largest, at the gentlest push, as subtle as it gets, the most jacks.
    randoms([
      0.5,
      0.5,
      0.5,
      0.9,
      0,
      1,
      0,
      ...Array(STIR.ambientFingers).fill(0),
      0.999,
    ]);
    timers[0].cb();
    const calls = fluid().splat.mock.calls;
    const size = STIR.ambientSizeMax;
    const intensity = STIR.ambientIntensityMin;
    // The core: subtle ink, footprint grown with size.
    expect(calls[0][4]).toBeCloseTo(STIR.ambientCoreInk * intensity);
    expect(calls[0][5]).toBeCloseTo(STIR.ambientCoreScale * size);
    // The vortex: ring and footprint scaled, push dimmed.
    const [x, y, dx, dy, ink, scale] = calls[1];
    expect(Math.hypot((x - 0.5) * 1200, (0.5 - y) * 800)).toBeCloseTo(
      STIR.ambientVortexRadius * size,
    );
    expect(Math.hypot(dx * 1200, dy * 800)).toBeCloseTo(
      STIR.ambientVortexPushMin * intensity,
    );
    expect(ink).toBe(0);
    expect(scale).toBeCloseTo(STIR.ambientVortexScale * size * size);
    // The fingers: further out, flung further, fainter.
    const finger = calls[9];
    expect((finger[0] - 0.5) * 1200).toBeCloseTo(
      STIR.ambientFingerStart * size,
    );
    expect(finger[2] * 1200).toBeCloseTo(
      STIR.ambientFingerPush * size * intensity,
    );
    expect(finger[4]).toBeCloseTo(STIR.ambientFingerInk * intensity);
    // Fewer jacks for a subtle eddy, never under two.
    tick();
    const [scene] = renderer().render.mock.calls.at(-1);
    expect(scene.children[0].count).toBe(
      Math.max(2, Math.round(STIR.ambientJacksMax * intensity)),
    );
  });

  it("scatters up to ambientJacksMax jacks", () => {
    mount();
    randoms([
      0.5,
      0.5,
      0.5,
      0.1,
      0.5,
      0,
      1,
      ...Array(STIR.ambientFingers).fill(0.5),
      0.999,
    ]);
    timers[0].cb();
    tick();
    const [scene] = renderer().render.mock.calls.at(-1);
    expect(scene.children[0].count).toBe(STIR.ambientJacksMax);
  });

  it("waits while the tab is hidden, but keeps the rhythm", () => {
    mount();
    hidden = true;
    timers[0].cb();
    expect(fluid().splat).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);
    expect(timers).toHaveLength(2);
  });

  it("leaves the cards alone: a spot under one is passed over, and it gives up after a few tries", () => {
    document.body.innerHTML =
      '<ul><li class="demo"><a href="#">Demo</a></li></ul>';
    const card = document.querySelector(".demo");
    document.elementFromPoint = vi.fn(() => card);
    mount();
    timers[0].cb();
    expect(document.elementFromPoint).toHaveBeenCalledTimes(6);
    expect(fluid().splat).not.toHaveBeenCalled();
    expect(timers).toHaveLength(2);
    // An open spot on the third try is taken.
    document.elementFromPoint
      .mockClear()
      .mockReturnValueOnce(card)
      .mockReturnValueOnce(card)
      .mockReturnValue(document.body);
    timers[1].cb();
    expect(document.elementFromPoint).toHaveBeenCalledTimes(3);
    expect(fluid().splat).toHaveBeenCalledTimes(1 + 8 + STIR.ambientFingers);
    delete document.elementFromPoint;
  });

  it("is cancelled by dispose", () => {
    const bg = mount();
    bg.dispose();
    expect(clearedTimers).toEqual([timers[0].id]);
    mounted.pop();
  });
});

describe("resilience", () => {
  const lose = (cv = canvas()) => {
    const e = new Event("webglcontextlost", { cancelable: true });
    cv.dispatchEvent(e);
    return e;
  };

  it("replaces a lost WebGL context with a fresh canvas, keeping the same handle", () => {
    const bg = stroke();
    const first = canvas();
    const e = lose();
    expect(e.defaultPrevented).toBe(true);
    expect(first.isConnected).toBe(false);
    expect(h.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(h.fluids[0].dispose).toHaveBeenCalledTimes(1);
    // A new mount: new canvas, renderer and fluid, painted once, booked once more.
    const second = canvas();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(h.renderers).toHaveLength(2);
    expect(h.renderers[1].render).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(2);
    // The old mount's loop and listeners are gone: a stroke reaches only the new one.
    expect(rafQueue).toHaveLength(0);
    move(100, 100, 100);
    move(160, 100, 116);
    expect(h.fluids[0].splat).toHaveBeenCalledTimes(1);
    expect(h.fluids[1].splat).toHaveBeenCalledTimes(1);
    // The handle disposes whatever is current.
    bg.dispose();
    expect(canvas()).toBeNull();
    expect(h.renderers[1].dispose).toHaveBeenCalledTimes(1);
    mounted.pop();
  });

  it("gives up after maxRelaunches lost contexts and leaves the CSS gradient", () => {
    const bg = mount();
    for (let i = 0; i < STIR.maxRelaunches; i++) {
      lose();
      expect(canvas()).not.toBeNull();
    }
    lose();
    expect(canvas()).toBeNull();
    expect(h.renderers).toHaveLength(STIR.maxRelaunches + 1);
    expect(() => bg.dispose()).not.toThrow();
    mounted.pop();
  });

  it("tears itself down, with a warning, when a frame throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bg = stroke();
    const boom = new Error("GPU gone");
    renderer().render.mockImplementation(() => {
      throw boom;
    });
    tick();
    expect(warn).toHaveBeenCalledWith(expect.any(String), boom);
    expect(canvas()).toBeNull();
    expect(renderer().dispose).toHaveBeenCalledTimes(1);
    expect(rafQueue).toHaveLength(0);
    // Nothing listens any more, and the handle's dispose is harmless.
    move(300, 300, 200);
    move(360, 300, 216);
    expect(rafQueue).toHaveLength(0);
    expect(() => bg.dispose()).not.toThrow();
    mounted.pop();
  });

  it("mounts nothing, with a warning, when the first paint throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The renderer stand-in registers itself on creation; make this one's
    // render throw before the mount reaches its first paint.
    const push = h.renderers.push.bind(h.renderers);
    h.renderers.push = (r) => {
      r.render = vi.fn(() => {
        throw new Error("no paint");
      });
      return push(r);
    };
    try {
      expect(mount()).toBeNull();
    } finally {
      h.renderers.push = push;
    }
    expect(h.renderers).toHaveLength(1);
    expect(canvas()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(0);
  });

  it("re-lays out and repaints when restored from the back/forward cache", () => {
    mount();
    renderer().render.mockClear();
    fluid().resize.mockClear();
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: false }),
    );
    expect(renderer().render).not.toHaveBeenCalled();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 900,
    });
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    expect(fluid().resize).toHaveBeenCalledWith(900, 800);
    expect(renderer().render).toHaveBeenCalledTimes(1);
  });

  it("never lays out a zero-sized viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 0,
    });
    mount();
    expect(renderer().setSize).toHaveBeenCalledWith(1, 1, false);
    expect(fluid().resize).toHaveBeenCalledWith(1, 1);
  });

  it("dispose is idempotent", () => {
    const bg = mount();
    bg.dispose();
    expect(() => bg.dispose()).not.toThrow();
    expect(renderer().dispose).toHaveBeenCalledTimes(1);
    mounted.pop();
  });
});

describe("dispose", () => {
  it("stops the loop, detaches every listener, frees the GPU objects and removes the canvas", () => {
    const bg = stroke();
    const [id] = rafQueue[0];
    bg.dispose();
    expect(cancelled).toContain(id);
    expect(canvas()).toBeNull();
    expect(fluid().dispose).toHaveBeenCalledTimes(1);
    expect(renderer().dispose).toHaveBeenCalledTimes(1);

    fluid().splat.mockClear();
    renderer().render.mockClear();
    move(300, 300, 100);
    move(360, 300, 116);
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fluid().splat).not.toHaveBeenCalled();
    expect(renderer().render).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);
  });
});
