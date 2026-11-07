/**
 * The silver jacks that surface around stirred ink.
 *
 * JackPool is the pure part: it decides when a jack surfaces, where, how it
 * tumbles and drifts, and how it sinks away again. It works in the jack
 * scene's world units — one unit per CSS pixel, x right, y up, origin at the
 * centre of the viewport — and writes instance matrices + fades for the
 * InstancedMesh that background.js draws. createJackGeometry() is the shape.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const JACKS = Object.freeze({
  /** Pool size, and so the most jacks on screen at once. */
  max: 96,
  /** Rod length in CSS pixels at the surface. */
  size: 7.5,
  /** Jacks surfaced per CSS pixel of pointer travel… */
  perPixel: 1 / 11,
  /** …once the pointer moves faster than this (px/s). */
  minSpeed: 260,
  /** Jacks surface in a ring around the pointer, this far out (px). */
  ringMin: 14,
  ringMax: 64,
  /** Lifetime bounds in seconds. */
  lifeMin: 1.4,
  lifeMax: 2.4,
  /** Fraction of life spent surfacing, and the point sinking begins. */
  surfaceUntil: 0.14,
  sinkFrom: 0.42,
  /** How far a jack recedes from the camera by the time it is gone (px). */
  sinkDepth: 640,
  /** Tumble speed bounds (rad/s). */
  spinMin: 4,
  spinMax: 10,
  /** Fraction of the pointer's velocity a new jack inherits, and the share of
      it that becomes swirl around the pointer. */
  carry: 0.3,
  swirl: 0.55,
  /** Per-second drag on a jack's drift. */
  drag: 2.4,
});

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class JackPool {
  /**
   * @param {typeof JACKS} settings
   * @param {() => number} random a [0, 1) source, injectable for tests
   */
  constructor(settings = JACKS, random = Math.random) {
    this.settings = settings;
    this.random = random;
    /** @type {Array<{position: THREE.Vector3, velocity: THREE.Vector3, quaternion: THREE.Quaternion, axis: THREE.Vector3, spin: number, age: number, life: number, scale: number, fade: number}>} */
    this.jacks = [];
    /** Pointer travel not yet turned into a jack, in jacks. */
    this.budget = 0;
    this._matrix = new THREE.Matrix4();
    this._scale = new THREE.Vector3();
    this._step = new THREE.Quaternion();
  }

  get count() {
    return this.jacks.length;
  }

  /**
   * The pointer moved by (dx, dy) world units over `dt` seconds and is now at
   * (x, y). Fast travel surfaces jacks in a ring around it.
   */
  stir(x, y, dx, dy, dt) {
    const s = this.settings;
    const distance = Math.hypot(dx, dy);
    const speed = distance / dt;
    if (speed < s.minSpeed) return;
    this.budget += distance * s.perPixel;
    while (this.budget >= 1) {
      this.budget -= 1;
      this.spawn(x, y, dx / dt, dy / dt);
    }
  }

  /**
   * Surfaces one jack near (x, y) carried along with pointer velocity
   * (vx, vy), unless the pool is full. Returns whether it did.
   */
  spawn(x, y, vx, vy) {
    const s = this.settings;
    if (this.jacks.length >= s.max) return false;
    const rnd = this.random;
    const angle = rnd() * Math.PI * 2;
    const ring = s.ringMin + rnd() * (s.ringMax - s.ringMin);
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const tangent = new THREE.Vector3(-radial.y, radial.x, 0);
    const speed = Math.hypot(vx, vy);
    const spinDirection = rnd() < 0.5 ? -1 : 1;
    const velocity = new THREE.Vector3(vx, vy, 0)
      .multiplyScalar(s.carry * (1 - s.swirl))
      .addScaledVector(tangent, speed * s.carry * s.swirl * spinDirection);
    const axis = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
    axis.normalize();
    this.jacks.push({
      position: radial.multiplyScalar(ring).add(new THREE.Vector3(x, y, 0)),
      velocity,
      quaternion: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        rnd() * Math.PI * 2,
      ),
      axis,
      spin: s.spinMin + rnd() * (s.spinMax - s.spinMin),
      age: 0,
      life: s.lifeMin + rnd() * (s.lifeMax - s.lifeMin),
      scale: 0,
      fade: 0,
    });
    return true;
  }

  /** Advances every jack by `dt` seconds and retires the ones that have sunk. */
  update(dt) {
    const s = this.settings;
    const drag = Math.exp(-s.drag * dt);
    const alive = [];
    for (const j of this.jacks) {
      j.age += dt;
      if (j.age >= j.life) continue;
      const t = j.age / j.life;
      const surfaced = smoothstep(0, s.surfaceUntil, t);
      const sunk = smoothstep(s.sinkFrom, 1, t);
      j.scale = s.size * surfaced * (1 - 0.4 * sunk);
      j.fade = surfaced * (1 - sunk);
      j.velocity.multiplyScalar(drag);
      j.position.addScaledVector(j.velocity, dt);
      j.position.z = -s.sinkDepth * sunk;
      this._step.setFromAxisAngle(j.axis, j.spin * (1 - 0.6 * sunk) * dt);
      j.quaternion.premultiply(this._step);
      alive.push(j);
    }
    this.jacks = alive;
  }

  /**
   * Writes one 4×4 matrix per jack into `matrices` and its opacity into
   * `fades`, and returns how many were written.
   */
  fill(matrices, fades) {
    const n = Math.min(this.jacks.length, fades.length);
    for (let i = 0; i < n; i++) {
      const j = this.jacks[i];
      this._scale.setScalar(Math.max(j.scale, 1e-3));
      this._matrix
        .compose(j.position, j.quaternion, this._scale)
        .toArray(matrices, i * 16);
      fades[i] = j.fade;
    }
    return n;
  }
}

/** A toy jack, one unit long: three crossed rods with a knob on each end. */
export function createJackGeometry() {
  const rodRadius = 0.075;
  const knobRadius = 0.16;
  const rod = () => new THREE.CylinderGeometry(rodRadius, rodRadius, 1, 10, 1);
  const knob = (x, y, z) =>
    new THREE.SphereGeometry(knobRadius, 12, 8).translate(x, y, z);
  const parts = [
    rod(),
    rod().rotateZ(Math.PI / 2),
    rod().rotateX(Math.PI / 2),
    knob(0.5, 0, 0),
    knob(-0.5, 0, 0),
    knob(0, 0.5, 0),
    knob(0, -0.5, 0),
    knob(0, 0, 0.5),
    knob(0, 0, -0.5),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
