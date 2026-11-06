// @vitest-environment jsdom
//
// The entry module, end to end: it mounts the chrome, feature-detects WebGL,
// falls back without it, and otherwise builds the renderer, scene, camera and
// controls, fits the camera to the active mode, coalesces control changes into
// one update per frame, and runs the render loop.
//
// jsdom has no WebGL, so the renderer and OrbitControls are stand-ins; the
// visualization modules are stand-ins too (they are covered against a real
// scene in visualizations.test.js), so each test controls what fitRadius()
// reports. Everything else — initUI, the mode controller, THREE's scene,
// camera and Timer — is the real code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  renderers: [],
  controls: [],
  rendererError: null,
  modules: {},
  delegate(name) {
    const exports = {};
    for (const key of [
      "create",
      "update",
      "dispose",
      "setParams",
      "fitRadius",
    ]) {
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: () => this.modules[name][key],
      });
    }
    return exports;
  },
}));

vi.mock("three", async (importOriginal) => {
  const THREE = await importOriginal();
  class WebGLRenderer {
    constructor(options) {
      if (h.rendererError) throw h.rendererError;
      this.options = options;
      this.domElement = document.createElement("canvas");
      this.setPixelRatio = vi.fn();
      this.setClearColor = vi.fn();
      this.setSize = vi.fn();
      this.render = vi.fn();
      h.renderers.push(this);
    }
  }
  return { ...THREE, WebGLRenderer };
});

vi.mock("three/addons/controls/OrbitControls.js", async () => {
  const { Vector3 } = await vi.importActual("three");
  return {
    OrbitControls: class {
      constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = new Vector3(1, 1, 1);
        this.update = vi.fn();
        h.controls.push(this);
      }
    },
  };
});

vi.mock("../../shared/chrome", () => ({ mountDemoChrome: vi.fn() }));

// A mock factory's exports outlive vi.resetModules(), so each export is a
// getter onto the current test's stub (h.modules) rather than a fixed value.
vi.mock("../src/visualizations/spiral.js", () => h.delegate("spiral"));
vi.mock("../src/visualizations/phyllotaxis.js", () =>
  h.delegate("phyllotaxis"),
);
vi.mock("../src/visualizations/sphere.js", () => h.delegate("sphere"));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BODY = readFileSync(resolve(ROOT, "index.html"), "utf8")
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1]
  .replace(/<script[\s\S]*?<\/script>/gi, "");
const $ = (id) => document.getElementById(id);

let frames; // pending requestAnimationFrame callbacks
let resizeCallbacks;
let getContext;

function stubModule({ fit } = {}) {
  const mod = {
    create: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
    setParams: vi.fn(),
  };
  if (fit !== undefined) mod.fitRadius = vi.fn(() => fit.value);
  return mod;
}

/** Run every queued animation frame once, at `t` ms. */
function frame(t = 16) {
  const run = frames;
  frames = [];
  run.forEach((cb) => cb(t));
}

async function start({ webgl = "webgl2" } = {}) {
  getContext = vi.fn((type) => {
    if (webgl === "throws") throw new Error("blocked");
    return type === webgl ? {} : null;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    getContext,
  );
  await import("../src/main.js");
  return { renderer: h.renderers[0], controls: h.controls[0] };
}

const setValue = (id, value, type = "input") => {
  $(id).value = String(value);
  $(id).dispatchEvent(new window.Event(type, { bubbles: true }));
};

/** Camera distance main.js should choose for a module of fit radius r. */
const distanceFor = (r) => r / Math.sin(((50 / 2) * Math.PI) / 180);

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = BODY;
  h.renderers.length = 0;
  h.controls.length = 0;
  h.rendererError = null;
  h.modules.spiral = stubModule({ fit: { value: 8 } });
  h.modules.phyllotaxis = stubModule({ fit: { value: 10.5 } });
  h.modules.sphere = stubModule(); // no fitRadius: it is optional
  frames = [];
  resizeCallbacks = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb) => frames.push(cb)),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb) {
        resizeCallbacks.push(cb);
      }
      observe() {}
    },
  );
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("chrome", () => {
  test("mounts the Growther.si chrome with this demo’s story", async () => {
    await start();
    const { mountDemoChrome } = await import("../../shared/chrome");
    expect(mountDemoChrome).toHaveBeenCalledTimes(1);
    const opts = mountDemoChrome.mock.calls[0][0];
    expect(opts).toMatchObject({
      title: "Fibonacci Visualizer",
      story: "demo-fibonacci-vis",
      sourceUrl: "https://github.com/GrowtherSI/demos/tree/main/fibonacci-vis",
    });
    expect(opts.about.passedSteps + opts.about.reworkSteps).toBe(226);
  });
});

describe("without WebGL", () => {
  test.each([["none"], ["throws"]])(
    "shows the fallback and builds no renderer (getContext: %s)",
    async (webgl) => {
      await start({ webgl });
      expect($("webgl-fallback").hidden).toBe(false);
      expect(h.renderers).toHaveLength(0);
      expect($("scene").children).toHaveLength(0);
    },
  );

  test("the controls and the info panel still work, and no frame is requested", async () => {
    await start({ webgl: "none" });
    setValue("nInput", 7);
    expect($("termCount").textContent).toBe("F(0)…F(7)");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  test("falls back when the renderer itself cannot be created", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.rendererError = new Error("context lost");
    await start();
    expect(warn).toHaveBeenCalledWith(
      "WebGLRenderer could not be created:",
      h.rendererError,
    );
    expect($("webgl-fallback").hidden).toBe(false);
  });

  test("WebGL 1 is enough", async () => {
    const { renderer } = await start({ webgl: "webgl" });
    expect(getContext.mock.calls.map(([type]) => type)).toEqual([
      "webgl2",
      "webgl",
    ]);
    expect(renderer.options).toEqual({
      antialias: true,
      powerPreference: "high-performance",
    });
    expect($("webgl-fallback").hidden).toBe(true);
  });
});

describe("with WebGL", () => {
  test("puts the canvas in #scene, capped at 2× pixel ratio, with touch handled by the controls", async () => {
    window.devicePixelRatio = 3;
    const { renderer, controls } = await start();
    expect($("scene").firstChild).toBe(renderer.domElement);
    expect(renderer.domElement.style.touchAction).toBe("none");
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
    expect(renderer.setClearColor).toHaveBeenCalledWith(0x0b0d12, 1);
    expect(controls.domElement).toBe(renderer.domElement);
    expect(controls.enableDamping).toBe(true);
    expect(controls.touches).toEqual({ ONE: 0, TWO: 2 }); // ROTATE, DOLLY_PAN
  });

  test("activates the mode the markup selects and fits the camera to it", async () => {
    const { controls } = await start();
    const mod = h.modules.phyllotaxis;
    expect(mod.create).toHaveBeenCalledTimes(1);
    const [scene, params] = mod.create.mock.calls[0];
    expect(scene.isScene).toBe(true);
    expect(params.mode).toBe("phyllotaxis");
    // two lights, plus whatever the module adds (nothing, here)
    expect(scene.children.map((c) => c.type)).toEqual([
      "AmbientLight",
      "DirectionalLight",
    ]);

    const camera = controls.camera;
    expect(camera.position.z).toBeCloseTo(distanceFor(10.5), 10);
    expect(camera.near).toBeCloseTo(distanceFor(10.5) / 100, 10);
    expect(camera.far).toBeCloseTo(distanceFor(10.5) * 10, 10);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
  });

  test("a module without fitRadius gets a radius of 10, and the camera never comes closer than 5", async () => {
    $("mode").value = "sphere";
    const { controls } = await start();
    expect(controls.camera.position.z).toBeCloseTo(distanceFor(10), 10);

    h.modules.spiral.fitRadius.mockReturnValue(1);
    setValue("mode", "spiral", "change");
    frame();
    expect(controls.camera.position.z).toBe(5);
  });

  test("sizes the drawing buffer to #scene, or to the window when #scene has no size yet", async () => {
    const { renderer, controls } = await start();
    expect(renderer.setSize).toHaveBeenLastCalledWith(
      window.innerWidth,
      window.innerHeight,
      false,
    );

    Object.defineProperty($("scene"), "clientWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty($("scene"), "clientHeight", {
      configurable: true,
      value: 400,
    });
    resizeCallbacks[0]();
    expect(renderer.setSize).toHaveBeenLastCalledWith(800, 400, false);
    expect(controls.camera.aspect).toBe(2);
  });

  test("each frame animates the active module, updates the controls and renders", async () => {
    const { renderer, controls } = await start();
    const mod = h.modules.phyllotaxis;
    frame(1000);
    frame(1016);
    expect(mod.update).toHaveBeenCalledTimes(2);
    expect(mod.update.mock.calls[1][0]).toBeCloseTo(0.016, 6);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render.mock.calls[0][1]).toBe(controls.camera);
    expect(frames).toHaveLength(1); // the loop keeps itself going
  });

  test("a long pause is clamped to a 0.1 s step", async () => {
    await start();
    frame(1000);
    frame(9000);
    expect(h.modules.phyllotaxis.update.mock.calls[1][0]).toBe(0.1);
  });
});

describe("control changes", () => {
  test("are coalesced into one update per frame", async () => {
    await start();
    frame(); // the first render-loop frame
    const mod = h.modules.phyllotaxis;
    setValue("angleInput", 120);
    setValue("pointSize", 1.5);
    expect(frames).toHaveLength(2); // the loop, plus one flush

    frame();

    expect(mod.setParams).toHaveBeenCalledTimes(1);
    expect(mod.setParams).toHaveBeenCalledWith({
      angleDeg: 120,
      pointSize: 1.5,
    });

    setValue("pointSize", 2); // the next change schedules a new flush
    frame();
    expect(mod.setParams).toHaveBeenLastCalledWith({ pointSize: 2 });
  });

  test("switching mode disposes the old module and creates and fits the new one", async () => {
    const { controls } = await start();
    setValue("mode", "spiral", "change");
    setValue("nInput", 20);
    frame();

    expect(h.modules.phyllotaxis.dispose).toHaveBeenCalledTimes(1);
    expect(h.modules.spiral.create).toHaveBeenCalledTimes(1);
    expect(h.modules.spiral.create.mock.calls[0][1]).toMatchObject({
      mode: "spiral",
      n: 20,
    });
    expect(controls.camera.position.z).toBeCloseTo(distanceFor(8), 10);
  });

  test("refit the camera only when an update changes the fit radius", async () => {
    $("mode").value = "spiral";
    const { controls } = await start();
    const camera = controls.camera;

    camera.position.z = 123; // a visitor zoomed out
    setValue("nInput", 20);
    frame();
    expect(camera.position.z).toBe(123); // same radius: leave the view alone

    h.modules.spiral.setParams.mockImplementation(() =>
      h.modules.spiral.fitRadius.mockReturnValue(20),
    );
    setValue("nInput", 25);
    frame();
    expect(camera.position.z).toBeCloseTo(distanceFor(20), 10);
  });

  test("a module without fitRadius is never refit on update", async () => {
    $("mode").value = "sphere";
    const { controls } = await start();
    controls.camera.position.z = 50;
    setValue("nInput", 99);
    frame();
    expect(h.modules.sphere.setParams).toHaveBeenCalledWith({ n: 99 });
    expect(controls.camera.position.z).toBe(50);
  });
});
