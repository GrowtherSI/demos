/**
 * The listing's background: the page gradient, drawn by WebGL so the pointer
 * can stir pure-black ink into it, with tiny silver jacks that tumble up
 * around the disturbance and sink back as the ink settles.
 *
 * It is decoration, so it gets out of the way whenever it cannot be exactly
 * that: no WebGL 2 or float render targets → the CSS gradient in home.css
 * (the same image) stays; prefers-reduced-motion → likewise, since the
 * untouched canvas would only duplicate it. Once mounted, the loop runs only
 * while there is something moving and sleeps again a few seconds after the
 * last pointer movement, so an idle tab costs nothing.
 */
import * as THREE from "three";
import { createFluid } from "./fluid.js";
import { JACKS, JackPool, createJackGeometry } from "./jacks.js";
import {
  DISPLAY_FRAGMENT,
  GRADIENT,
  JACK_FRAGMENT,
  JACK_VERTEX,
  QUAD_VERTEX,
} from "./shaders.js";

export const STIR = Object.freeze({
  /** Seconds after the last pointer movement before the loop sleeps. The ink
      has decayed below the display threshold well before then. */
  settleSeconds: 7,
  /** Cap on devicePixelRatio: the display pass is per-pixel work. */
  maxPixelRatio: 1.5,
  /** Longest simulated step; a tab coming back from the background does not
      lurch. */
  maxDt: 1 / 30,
  /** A pointer jump longer than this (px) is a re-entry, not a stroke. */
  maxStroke: 260,
  /** Jack camera. */
  fov: 40,
  /** Pointer speed (px/s) at which a stroke drops the most ink. */
  inkSpeed: 1600,
  inkMin: 0.05,
  inkMax: 0.42,
  /** How strongly the flow ripples the surface, and how bright the rim of
      an opening in it is. */
  ripple: 0.0006,
  rim: 0.5,
  /** Elements that sit on the surface and shield it: a pointer over one of
      these stirs nothing. */
  blockers: ".demo",
  /** How many times a lost WebGL context is replaced before giving up and
      leaving the CSS gradient. */
  maxRelaunches: 3,
  /** Ambient stirs: now and then, with nobody touching it, a few jacks break
      the surface somewhere and set off a small eddy that settles again. The
      delay between them (seconds), the eddy (ink per splat, its radius and
      push in px), how many jacks, how fast they scatter (px/s), and how far
      from the viewport's edge (as a fraction of it) they stay. */
  ambientMinDelay: 4,
  ambientMaxDelay: 11,
  /** The eddy: a small dense core of ink, a much wider vortex around it that
      draws the core out into spiral arms, and a few fingers flung outward
      (px from the core, px of push, ink) for the vortex to curl. */
  /** Each eddy is dealt a size, 1× up to this many times the radii below,
      and an intensity, from this fraction of the ink, push and jacks (very
      subtle) up to all of it (intense). */
  ambientSizeMax: 4,
  ambientIntensityMin: 0.22,
  ambientCoreInk: 0.42,
  ambientCoreScale: 0.45,
  ambientVortexRadius: 88,
  /** How hard the vortex turns, drawn at random per eddy (px of push);
      which way it turns is a coin toss. */
  ambientVortexPushMin: 13,
  ambientVortexPushMax: 31,
  ambientVortexScale: 4,
  ambientFingers: 5,
  ambientFingerStart: 18,
  ambientFingerPush: 110,
  ambientFingerInk: 0.12,
  ambientFingerScale: 1.1,
  /** After it opens, an eddy keeps stirring for this long (s): each second
      adds this share of the opening core and vortex, and this many more
      jacks break the surface. */
  ambientSustain: 2.6,
  ambientSustainGain: 0.7,
  ambientJackTrickle: 3,
  ambientJacksMin: 6,
  ambientJacksMax: 12,
  ambientJackSpeed: 620,
  ambientMargin: 0.08,
});

/** How much ink a stroke at `speed` px/s drops. */
export function inkFor(speed, settings = STIR) {
  const t = Math.min(1, speed / settings.inkSpeed);
  return settings.inkMin + (settings.inkMax - settings.inkMin) * t * t;
}

/**
 * Tries to mount the background. Returns `null` when the page should keep its
 * CSS gradient instead, otherwise `{ dispose }`.
 *
 * The background is decoration, so any failure ends with the CSS gradient
 * showing, never a broken page: a WebGL context the browser drops (a page
 * restored from the back/forward cache, a GPU reset) is replaced with a fresh
 * one a few times, and a renderer that throws is torn down for good.
 */
export function mountStirBackground(settings = STIR) {
  let inner = null;
  let relaunches = 0;
  const hooks = {
    onContextLost() {
      inner?.dispose();
      inner = null;
      if (relaunches++ < settings.maxRelaunches) inner = launch();
    },
    onError(error) {
      inner?.dispose();
      inner = null;
      console.warn(
        "The stirred background stopped; the CSS gradient stays.",
        error,
      );
    },
  };
  const launch = () => {
    try {
      return mountOnce(settings, hooks);
    } catch (error) {
      hooks.onError(error);
      return null;
    }
  };
  inner = launch();
  if (!inner) return null;
  return {
    dispose() {
      inner?.dispose();
      inner = null;
    },
  };
}

/** One mount on one WebGL context; `hooks` hear when it is lost or fails. */
function mountOnce(settings, hooks) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return null;

  const canvas = document.createElement("canvas");
  canvas.className = "stir";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "low-power",
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  } catch {
    return null;
  }
  renderer.autoClear = false;
  renderer.setClearColor(
    new THREE.Color(GRADIENT.base[0], GRADIENT.base[1], GRADIENT.base[2]),
    1,
  );

  let width = Math.max(1, window.innerWidth);
  let height = Math.max(1, window.innerHeight);
  const fluid = createFluid(renderer, width, height);

  // ── The background pass ──────────────────────────────────────────────────
  const displayMaterial = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: DISPLAY_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uDye: { value: null },
      uVelocity: { value: null },
      uDyeTexel: { value: new THREE.Vector2() },
      uVelocityTexel: { value: new THREE.Vector2() },
      uSize: { value: new THREE.Vector2(width, height) },
      uScroll: { value: 0 },
      uBase: { value: new THREE.Vector3(...GRADIENT.base) },
      uGlow: { value: new THREE.Vector3(...GRADIENT.glow) },
      uGlowAlpha: { value: GRADIENT.glowAlpha },
      uGlowRadius: {
        value: new THREE.Vector2(GRADIENT.radiusX, GRADIENT.radiusY),
      },
      uGlowCenterY: { value: GRADIENT.centerY },
      uGlowFade: { value: GRADIENT.fadeAt },
      uRipple: { value: settings.ripple },
      uRim: { value: settings.rim },
    },
  });
  const displayScene = new THREE.Scene();
  displayScene.add(
    new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMaterial),
  );
  const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ── The jacks ────────────────────────────────────────────────────────────
  const pool = new JackPool();
  const jackGeometry = createJackGeometry();
  const fades = new Float32Array(JACKS.max);
  const fadeAttribute = new THREE.InstancedBufferAttribute(fades, 1);
  fadeAttribute.setUsage(THREE.DynamicDrawUsage);
  jackGeometry.setAttribute("aFade", fadeAttribute);
  const jackMaterial = new THREE.ShaderMaterial({
    vertexShader: JACK_VERTEX,
    fragmentShader: JACK_FRAGMENT,
    transparent: true,
    uniforms: {
      uFloor: { value: new THREE.Vector3(0.05, 0.13, 0.11) },
    },
  });
  const jacks = new THREE.InstancedMesh(jackGeometry, jackMaterial, JACKS.max);
  jacks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  jacks.frustumCulled = false;
  jacks.count = 0;
  const jackScene = new THREE.Scene();
  jackScene.add(jacks);
  // One world unit per CSS pixel at z = 0, so the pool can think in pixels.
  const jackCamera = new THREE.PerspectiveCamera(settings.fov, 1, 10, 4000);

  function layout() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio),
    );
    renderer.setSize(width, height, false);
    fluid.resize(width, height);
    displayMaterial.uniforms.uSize.value.set(width, height);
    jackCamera.aspect = width / height;
    jackCamera.position.set(
      0,
      0,
      height / 2 / Math.tan((settings.fov * Math.PI) / 360),
    );
    jackCamera.updateProjectionMatrix();
  }

  function draw() {
    const u = displayMaterial.uniforms;
    u.uDye.value = fluid.texture;
    u.uDyeTexel.value.copy(fluid.texelSize);
    u.uVelocity.value = fluid.velocityTexture;
    u.uVelocityTexel.value.copy(fluid.velocityTexelSize);
    u.uScroll.value = window.scrollY;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(displayScene, displayCamera);
    jacks.count = pool.fill(jacks.instanceMatrix.array, fades);
    if (jacks.count > 0) {
      jacks.instanceMatrix.needsUpdate = true;
      fadeAttribute.needsUpdate = true;
      renderer.render(jackScene, jackCamera);
    }
  }

  // ── The loop: awake while stirred, asleep once settled ───────────────────
  let raf = 0;
  let last = 0;
  let quietFor = Infinity;

  function frame(now) {
    raf = 0;
    const dt = Math.min(settings.maxDt, Math.max(0, (now - last) / 1000));
    last = now;
    quietFor += dt;
    try {
      sustainAmbient(dt);
      fluid.step(dt);
      pool.update(dt);
      draw();
    } catch (error) {
      hooks.onError(error);
      return;
    }
    if (quietFor < settings.settleSeconds || pool.count > 0)
      raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (raf || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function sleep() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // ── Ambient stirs ────────────────────────────────────────────────────────
  let ambientTimer = 0;

  function scheduleAmbient() {
    const delay =
      settings.ambientMinDelay +
      Math.random() * (settings.ambientMaxDelay - settings.ambientMinDelay);
    ambientTimer = window.setTimeout(ambientStir, delay * 1000);
  }

  /** A random spot on the open surface — not under a card — or null. */
  function ambientSpot() {
    const m = settings.ambientMargin;
    for (let i = 0; i < 6; i++) {
      const x = width * (m + Math.random() * (1 - 2 * m));
      const y = height * (m + Math.random() * (1 - 2 * m));
      if (!document.elementFromPoint?.(x, y)?.closest(settings.blockers))
        return { x, y };
    }
    return null;
  }

  const uv = (px, py) => [px / width, 1 - py / height];
  const push = (tx, ty) => [tx / width, -ty / height];

  /** Ink alone, in a small footprint, at (x, y) in CSS px. */
  function core(x, y, ink, size) {
    fluid.splat(...uv(x, y), 0, 0, ink, settings.ambientCoreScale * size);
  }

  /** Flow alone around a wide ring, pushed `strength` px along it. */
  function vortex(x, y, turn, strength, size) {
    const n = 8;
    const r = settings.ambientVortexRadius * size;
    const p = strength * turn;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fluid.splat(
        ...uv(x + Math.cos(a) * r, y + Math.sin(a) * r),
        ...push(-Math.sin(a) * p, Math.cos(a) * p),
        0,
        settings.ambientVortexScale * size * size,
      );
    }
  }

  /** One jack breaking the surface at (x, y), flying off in a random direction. */
  function scatterJack(x, y) {
    const a = Math.random() * Math.PI * 2;
    pool.spawn(
      x - width / 2,
      height / 2 - y,
      Math.cos(a) * settings.ambientJackSpeed,
      Math.sin(a) * settings.ambientJackSpeed,
    );
  }

  /** The eddy under way, if any: where, which way and how hard it turns,
      its size and intensity, how long it has left, and jacks owed but not
      yet surfaced. */
  let ambient = null;

  /** Keeps the current eddy going: a trickle of core ink and vortex flow,
      and now and then another jack, until its sustain runs out. */
  function sustainAmbient(dt) {
    if (!ambient) return;
    ambient.left -= dt;
    if (ambient.left <= 0) {
      ambient = null;
      return;
    }
    const { x, y, turn, strength, size, intensity } = ambient;
    const gain = settings.ambientSustainGain * dt * intensity;
    core(x, y, settings.ambientCoreInk * gain, size);
    vortex(x, y, turn, strength * gain, size);
    ambient.jacks += settings.ambientJackTrickle * dt;
    while (ambient.jacks >= 1) {
      ambient.jacks -= 1;
      scatterJack(ambient.x, ambient.y);
    }
  }

  function ambientStir() {
    scheduleAmbient();
    if (document.hidden) return;
    const spot = ambientSpot();
    if (!spot) return;
    const { x, y } = spot;
    const turn = Math.random() < 0.5 ? -1 : 1;
    const strength =
      settings.ambientVortexPushMin +
      Math.random() *
        (settings.ambientVortexPushMax - settings.ambientVortexPushMin);
    const size = 1 + Math.random() * (settings.ambientSizeMax - 1);
    const intensity =
      settings.ambientIntensityMin +
      Math.random() * (1 - settings.ambientIntensityMin);
    // A small, dense core of ink inside a far wider vortex that draws it out
    // into spiral arms…
    core(x, y, settings.ambientCoreInk * intensity, size);
    vortex(x, y, turn, strength * intensity, size);
    // …a few fingers flung outward for the vortex to curl…
    for (let i = 0; i < settings.ambientFingers; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = settings.ambientFingerStart * size;
      const p = settings.ambientFingerPush * size * intensity;
      fluid.splat(
        ...uv(x + Math.cos(a) * r, y + Math.sin(a) * r),
        ...push(Math.cos(a) * p, Math.sin(a) * p),
        settings.ambientFingerInk * intensity,
        settings.ambientFingerScale * size * size,
      );
    }
    // …and the jacks that broke the surface, scattering from the spot.
    const dealt =
      settings.ambientJacksMin +
      Math.floor(
        Math.random() *
          (settings.ambientJacksMax - settings.ambientJacksMin + 1),
      );
    const count = Math.max(2, Math.round(dealt * intensity));
    for (let i = 0; i < count; i++) scatterJack(x, y);
    // Then it keeps stirring for a while (see sustainAmbient).
    ambient = {
      x,
      y,
      turn,
      strength,
      size,
      intensity,
      left: settings.ambientSustain,
      jacks: 0,
    };
    quietFor = 0;
    wake();
  }

  // ── Input ────────────────────────────────────────────────────────────────
  let prev = null;

  function onPointerMove(e) {
    if (e.target?.closest?.(settings.blockers)) {
      prev = null;
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    if (prev) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      const distance = Math.hypot(dx, dy);
      if (distance > settings.maxStroke) {
        prev = null;
      } else if (distance > 0) {
        const dt = Math.max((e.timeStamp - prev.t) / 1000, 1 / 240);
        const speed = distance / dt;
        fluid.splat(
          x / width,
          1 - y / height,
          dx / width,
          -dy / height,
          inkFor(speed, settings),
        );
        pool.stir(x - width / 2, height / 2 - y, dx, -dy, dt);
        quietFor = 0;
        wake();
      }
    }
    prev = { x, y, t: e.timeStamp };
  }

  const onPointerLeave = () => {
    prev = null;
  };

  const onVisibility = () => {
    if (document.hidden) sleep();
    else if (quietFor < settings.settleSeconds || pool.count > 0) wake();
  };

  /** The gradient is anchored to the document, so an idle canvas repaints on
      scroll; while awake, the next frame does it anyway. */
  const onScroll = () => {
    if (!raf) draw();
  };

  const onResize = () => {
    layout();
    if (!raf) draw();
  };

  /** The browser dropped the context (back/forward cache, GPU reset): stop
      it defaulting to a dead canvas and let the wrapper mount a fresh one. */
  const onContextLost = (e) => {
    e.preventDefault();
    hooks.onContextLost();
  };

  /** Restored from the back/forward cache: the viewport may have changed
      while the page was frozen, and the canvas holds a stale frame. */
  const onPageShow = (e) => {
    if (e.persisted) onResize();
  };

  // The first paint happens before the canvas joins the page, so a renderer
  // that fails outright leaves nothing behind.
  layout();
  draw();

  canvas.addEventListener("webglcontextlost", onContextLost);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("blur", onPointerLeave);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibility);

  document.body.prepend(canvas);
  scheduleAmbient();

  return {
    dispose() {
      sleep();
      window.clearTimeout(ambientTimer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      fluid.dispose();
      displayScene.children[0].geometry.dispose();
      displayMaterial.dispose();
      jackGeometry.dispose();
      jackMaterial.dispose();
      jacks.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
