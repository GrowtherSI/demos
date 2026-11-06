import * as THREE from "three";
import { phyllotaxisPoint, LIMITS } from "../fibonacci.js";
import { paletteColor } from "./palette.js";

const RADIUS = 10; // outer radius of the pattern in world units
const GROW_SECONDS = 4; // time to grow the full pattern
const HOLD_SECONDS = 2; // pause at full size before regrowing

let scene = null;
let mesh = null;
let params = null;
let growth = 0;

const m4 = new THREE.Matrix4();
const color = new THREE.Color();

function clampN(n) {
  return Math.max(1, Math.min(LIMITS.MAX_POINTS, Math.floor(n) || 1));
}

/** Rewrite instance matrices in place (angle, N or point size changed). */
function writePositions() {
  const n = clampN(params.n);
  const c = RADIUS / Math.sqrt(n);
  const angleRad = (params.angleDeg * Math.PI) / 180;
  const s = c * 0.45 * params.pointSize;
  for (let i = 0; i < n; i += 1) {
    const p = phyllotaxisPoint(i, c, angleRad);
    m4.makeScale(s, s, 1);
    m4.setPosition(p.x, p.y, 0);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Rewrite instance colours in place (palette or N changed). */
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
  const geometry = new THREE.CircleGeometry(1, 10); // low-poly disc
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  mesh = new THREE.InstancedMesh(geometry, material, LIMITS.MAX_POINTS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  writePositions();
  writeColors();
  growth = 0;
  mesh.count = params.playing ? 1 : clampN(params.n);
  scene.add(mesh);
}

/** Live update without recreating anything (used by the angle slider). */
export function setParams(next) {
  const prev = params;
  params = { ...params, ...next };
  if (!mesh) return;
  const nChanged = clampN(prev.n) !== clampN(params.n);
  if (
    nChanged ||
    prev.angleDeg !== params.angleDeg ||
    prev.pointSize !== params.pointSize
  )
    writePositions();
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
  mesh.rotation.z += params.rotationSpeed * dt * 0.3;
}

export function fitRadius() {
  return RADIUS * 1.05;
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
