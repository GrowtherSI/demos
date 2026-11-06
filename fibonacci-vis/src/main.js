import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mountDemoChrome } from "../../shared/chrome";
import { initUI } from "./ui.js";
import * as spiral from "./visualizations/spiral.js";
import * as phyllotaxis from "./visualizations/phyllotaxis.js";
import * as sphere from "./visualizations/sphere.js";
import { createModeController } from "./modeController.js";

const MODULES = { spiral, phyllotaxis, sphere };

/** Feature-detect WebGL on a throwaway canvas BEFORE any renderer is created. */
function hasWebGL() {
  try {
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("webgl2") || probe.getContext("webgl");
    return Boolean(ctx);
  } catch {
    return false;
  }
}

function showFallback() {
  document.getElementById("webgl-fallback").hidden = false;
}

function start() {
  const container = document.getElementById("scene");
  let renderer = null; // declared first so queueChange never hits the TDZ on the fallback path
  let params = null;
  let controller = null;
  let pending = null; // coalesced param changes
  let pendingMode = false;
  let rafScheduled = false;

  // The UI (validation + info panel) works even without WebGL.
  const queueChange = (partial, { modeChanged }) => {
    pending = { ...(pending || {}), ...partial };
    pendingMode = pendingMode || modeChanged;
    if (!rafScheduled && renderer) {
      rafScheduled = true;
      requestAnimationFrame(flush);
    }
  };
  params = initUI({ onChange: queueChange });

  if (!hasWebGL()) {
    showFallback();
    return;
  }

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    console.warn("WebGLRenderer could not be created:", err);
    showFallback();
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0b0d12, 1);
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(5, 8, 10);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = true; // one-finger touch rotate
  controls.enableZoom = true; // two-finger pinch zoom
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  // Runs only once a module is active (onActivate, flush), so controller and
  // controller.active are always set here. fitRadius is optional on a module.
  function fitCamera() {
    const { active } = controller;
    const r = active.fitRadius ? active.fitRadius() : 10;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, Math.max(dist, 5));
    camera.near = Math.max(0.01, dist / 100);
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // Mode switching (dispose previous -> create next) lives in modeController.js,
  // which tests/ui.test.js exercises against a real THREE.Scene.
  controller = createModeController({
    scene,
    modules: MODULES,
    params,
    onActivate: fitCamera,
  });

  // Scheduled only by queueChange, which sets `pending` first, and never twice
  // at once (rafScheduled), so there is always a change to apply here.
  function flush() {
    rafScheduled = false;
    const change = pending;
    const modeChanged = pendingMode;
    pending = null;
    pendingMode = false;
    params = { ...params, ...change };
    const active = controller.active;
    const prevFit = active.fitRadius ? active.fitRadius() : null;
    const result = controller.apply(change, { modeChanged });
    if (
      result === "updated" &&
      active.fitRadius &&
      active.fitRadius() !== prevFit
    )
      fitCamera();
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  controller.activate(params.mode);

  // Timer (not the deprecated Clock) also pauses while the tab is hidden, so a
  // returning visitor doesn't get one huge animation step.
  const timer = new THREE.Timer();
  timer.connect(document);
  function loop(timestamp) {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.1);
    controller.active.update(dt);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

mountDemoChrome({
  title: "Fibonacci Visualizer",
  story: "demo-fibonacci-vis",
  sourceUrl: "https://github.com/GrowtherSI/demos/tree/main/fibonacci-vis",
  // How Growther.si C5 built this demo, shown by the header's info button.
  about: {
    prompt:
      "Write a responsive web app that calculates Fibonacci patterns and displays them in creative ways with threejs.",
    hours: 5,
    costUsd: 33.38,
    passedSteps: 204,
    reworkSteps: 22,
    tokens: "1.1M",
    inference: [
      { where: "Cloud", via: "Anthropic API" },
      { where: "Local", via: "OpenClaw" },
      { where: "Local", via: "LM Studio" },
    ],
    humanHours: 4,
    humanRateUsd: 50,
  },
});
start();
