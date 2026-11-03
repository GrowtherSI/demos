import * as THREE from 'three';
import { fibonacciSpherePoint, LIMITS } from '../fibonacci.js';
import { paletteColor } from './palette.js';

const RADIUS = 6;
const GROW_SECONDS = 4;
const HOLD_SECONDS = 2;

let scene = null;
let mesh = null;
let params = null;
let growth = 0;

const m4 = new THREE.Matrix4();
const color = new THREE.Color();

function clampN(n) {
  return Math.max(1, Math.min(LIMITS.MAX_POINTS, Math.floor(n) || 1));
}

function writePositions() {
  const n = clampN(params.n);
  // mean spacing on the sphere is about sqrt(4π/n)·R
  const s = Math.sqrt((4 * Math.PI) / n) * RADIUS * 0.32 * params.pointSize;
  for (let i = 0; i < n; i += 1) {
    const p = fibonacciSpherePoint(i, n);
    m4.makeScale(s, s, s);
    m4.setPosition(p.x * RADIUS, p.y * RADIUS, p.z * RADIUS);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function writeColors() {
  const n = clampN(params.n);
  for (let i = 0; i < n; i += 1) {
    paletteColor(params.palette, n > 1 ? i / (n - 1) : 0, color);
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function create(targetScene, initialParams) {
  scene = targetScene;
  params = { ...initialParams };
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
  mesh = new THREE.InstancedMesh(geometry, material, LIMITS.MAX_POINTS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  writePositions();
  writeColors();
  growth = 0;
  mesh.count = params.playing ? 1 : clampN(params.n);
  scene.add(mesh);
}

export function setParams(next) {
  const prev = params;
  params = { ...params, ...next };
  if (!mesh) return;
  const nChanged = clampN(prev.n) !== clampN(params.n);
  if (nChanged || prev.pointSize !== params.pointSize) writePositions();
  if (nChanged || prev.palette !== params.palette) writeColors();
  if (!params.playing) mesh.count = clampN(params.n);
}

export function update(dt) {
  if (!mesh) return;
  const n = clampN(params.n);
  if (!params.playing) {
    mesh.count = n;
    return;
  }
  growth += dt;
  if (growth > GROW_SECONDS + HOLD_SECONDS) growth = 0;
  mesh.count = Math.max(1, Math.min(n, Math.ceil((growth / GROW_SECONDS) * n)));
  mesh.rotation.y += params.rotationSpeed * dt * 0.4;
  mesh.rotation.x = 0.35;
}

export function fitRadius() {
  return RADIUS * 1.15;
}

export function dispose() {
  if (!mesh) return;
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  mesh.dispose();
  mesh = null;
  scene = null;
}
