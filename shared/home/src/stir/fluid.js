/**
 * A small GPU fluid: velocity and ink fields in ping-pong render targets,
 * advanced each frame by the passes in shaders.js. Nothing here knows about
 * the pointer or the page; background.js feeds it splats and reads its ink.
 *
 * The velocity grid runs at a quarter of the canvas and the ink at half: the
 * flow only needs to be smooth, while the ink's edge is what the eye sees.
 */
import * as THREE from "three";
import {
  ADVECT_FRAGMENT,
  CURL_FRAGMENT,
  DIVERGENCE_FRAGMENT,
  GRADIENT_SUBTRACT_FRAGMENT,
  PRESSURE_FRAGMENT,
  QUAD_VERTEX,
  SPLAT_FRAGMENT,
  VORTICITY_FRAGMENT,
} from "./shaders.js";

export const FLUID = Object.freeze({
  /** Velocity grid size as a fraction of the canvas. */
  simScale: 0.25,
  /** Ink grid size as a fraction of the canvas. */
  dyeScale: 0.5,
  /** Jacobi iterations for the pressure solve; more is stiffer, slower. */
  pressureIterations: 16,
  /** Vorticity confinement — how much the ink curls on itself. */
  curl: 30,
  /** Per-second damping. Velocity settles well before the ink has gone. */
  velocityDecay: 2.2,
  dyeDecay: 1.0,
  /** Splat footprint, in (fraction of canvas height)². */
  splatRadius: 0.0013,
  /** Pointer travel (in UV) → injected velocity (sim texels per second). */
  splatForce: 3800,
  /** Surface agitation around a stroke (the ink's green channel): how much
      per unit of ink, and how much wider than the ink it spreads (an area
      factor on splatRadius). The display pass ripples only where it is. */
  agitationGain: 1.6,
  agitationSpread: 7,
});

function makeTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

/** Two targets that trade places: read from one, write the other, swap. */
export function makeDoubleTarget(width, height) {
  let read = makeTarget(width, height);
  let write = makeTarget(width, height);
  return {
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    get texelSize() {
      return new THREE.Vector2(1 / width, 1 / height);
    },
    swap() {
      [read, write] = [write, read];
    },
    dispose() {
      read.dispose();
      write.dispose();
    },
  };
}

function makeMaterial(name, fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  material.name = name;
  return material;
}

const gridSize = (px, scale) => Math.max(8, Math.round(px * scale));

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {number} width canvas width in CSS pixels
 * @param {number} height canvas height in CSS pixels
 */
export function createFluid(renderer, width, height, settings = FLUID) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  scene.add(quad);

  const texel = new THREE.Vector2();
  const materials = {
    advect: makeMaterial("advect", ADVECT_FRAGMENT, {
      uVelocity: { value: null },
      uSource: { value: null },
      uTexel: { value: texel },
      uDt: { value: 0 },
      uDecay: { value: 1 },
    }),
    curl: makeMaterial("curl", CURL_FRAGMENT, {
      uVelocity: { value: null },
      uTexel: { value: texel },
    }),
    vorticity: makeMaterial("vorticity", VORTICITY_FRAGMENT, {
      uVelocity: { value: null },
      uCurl: { value: null },
      uTexel: { value: texel },
      uCurlStrength: { value: settings.curl },
      uDt: { value: 0 },
    }),
    divergence: makeMaterial("divergence", DIVERGENCE_FRAGMENT, {
      uVelocity: { value: null },
      uTexel: { value: texel },
    }),
    pressure: makeMaterial("pressure", PRESSURE_FRAGMENT, {
      uPressure: { value: null },
      uDivergence: { value: null },
      uTexel: { value: texel },
    }),
    gradient: makeMaterial("gradient", GRADIENT_SUBTRACT_FRAGMENT, {
      uPressure: { value: null },
      uVelocity: { value: null },
      uTexel: { value: texel },
    }),
    splat: makeMaterial("splat", SPLAT_FRAGMENT, {
      uTarget: { value: null },
      uAspect: { value: 1 },
      uColor: { value: new THREE.Vector3() },
      uPoint: { value: new THREE.Vector2() },
      uRadius: { value: settings.splatRadius },
    }),
  };

  let velocity;
  let dye;
  let curl;
  let divergence;
  let pressure;
  let aspect = 1;

  function allocate(w, h) {
    const simW = gridSize(w, settings.simScale);
    const simH = gridSize(h, settings.simScale);
    velocity = makeDoubleTarget(simW, simH);
    pressure = makeDoubleTarget(simW, simH);
    curl = makeTarget(simW, simH);
    divergence = makeTarget(simW, simH);
    dye = makeDoubleTarget(
      gridSize(w, settings.dyeScale),
      gridSize(h, settings.dyeScale),
    );
    texel.copy(velocity.texelSize);
    aspect = w / h;
    materials.splat.uniforms.uAspect.value = aspect;
  }

  function release() {
    velocity.dispose();
    pressure.dispose();
    curl.dispose();
    divergence.dispose();
    dye.dispose();
  }

  allocate(width, height);

  function pass(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }

  /** Pending pointer splats, applied at the start of the next step. */
  const splats = [];

  /** A single pressure/velocity/ink update of `dt` seconds. */
  function step(dt) {
    const u = (m) => materials[m].uniforms;

    for (const s of splats) {
      u("splat").uPoint.value.set(s.x, s.y);
      u("splat").uRadius.value = settings.splatRadius * s.scale;

      if (s.dx !== 0 || s.dy !== 0) {
        u("splat").uColor.value.set(
          s.dx * settings.splatForce,
          s.dy * settings.splatForce,
          0,
        );
        u("splat").uTarget.value = velocity.read.texture;
        pass(materials.splat, velocity.write);
        velocity.swap();
      }

      if (s.ink > 0) {
        u("splat").uColor.value.set(s.ink, 0, 0);
        u("splat").uTarget.value = dye.read.texture;
        pass(materials.splat, dye.write);
        dye.swap();

        u("splat").uRadius.value *= settings.agitationSpread;
        u("splat").uColor.value.set(0, s.ink * settings.agitationGain, 0);
        u("splat").uTarget.value = dye.read.texture;
        pass(materials.splat, dye.write);
        dye.swap();
      }
    }
    splats.length = 0;

    u("curl").uVelocity.value = velocity.read.texture;
    pass(materials.curl, curl);

    u("vorticity").uVelocity.value = velocity.read.texture;
    u("vorticity").uCurl.value = curl.texture;
    u("vorticity").uDt.value = dt;
    pass(materials.vorticity, velocity.write);
    velocity.swap();

    u("divergence").uVelocity.value = velocity.read.texture;
    pass(materials.divergence, divergence);

    u("pressure").uDivergence.value = divergence.texture;
    for (let i = 0; i < settings.pressureIterations; i++) {
      u("pressure").uPressure.value = pressure.read.texture;
      pass(materials.pressure, pressure.write);
      pressure.swap();
    }

    u("gradient").uPressure.value = pressure.read.texture;
    u("gradient").uVelocity.value = velocity.read.texture;
    pass(materials.gradient, velocity.write);
    velocity.swap();

    u("advect").uDt.value = dt;
    u("advect").uVelocity.value = velocity.read.texture;
    u("advect").uSource.value = velocity.read.texture;
    u("advect").uDecay.value = 1 / (1 + settings.velocityDecay * dt);
    pass(materials.advect, velocity.write);
    velocity.swap();

    u("advect").uVelocity.value = velocity.read.texture;
    u("advect").uSource.value = dye.read.texture;
    u("advect").uDecay.value = 1 / (1 + settings.dyeDecay * dt);
    pass(materials.advect, dye.write);
    dye.swap();
  }

  return {
    /**
     * Stir at UV (x, y) (origin bottom-left) with the pointer's UV travel
     * (dx, dy) since its last position, dropping `ink` into the field.
     * `scale` widens or narrows this splat's footprint; no travel means
     * ink alone, no ink means flow alone.
     */
    splat(x, y, dx, dy, ink, scale = 1) {
      splats.push({ x, y, dx, dy, ink, scale });
    },
    step,
    /** The ink field, red channel, for the display pass. */
    get texture() {
      return dye.read.texture;
    },
    get texelSize() {
      return dye.texelSize;
    },
    /** The flow, for the display pass to shade the surface with. */
    get velocityTexture() {
      return velocity.read.texture;
    },
    get velocityTexelSize() {
      return velocity.texelSize;
    },
    get pending() {
      return splats.length;
    },
    resize(w, h) {
      release();
      allocate(w, h);
    },
    dispose() {
      release();
      quad.geometry.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
  };
}
