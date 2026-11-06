import * as THREE from "three";
import { spiralLayout, LIMITS } from "../fibonacci.js";
import { paletteColor } from "./palette.js";

const ARC_SEGMENTS = 32;
const STEP_SECONDS = 0.35; // time per square while growing
const HOLD_SECONDS = 2;

let scene = null;
let group = null;
let params = null;
let squares = []; // { mesh, edges } per term
let arc = null; // THREE.Line for the golden spiral
let arcPointsPerTerm = 0;
let growth = 0;
let fit = 1;

function clampN(n) {
  return Math.max(1, Math.min(LIMITS.MAX_SPIRAL_TERMS, Math.floor(n) || 1));
}

function build() {
  const n = clampN(params.n);
  const layout = spiralLayout(n);
  // normalise so the largest square is 10 world units, which keeps the camera stable
  const scale = 10 / layout[layout.length - 1].size;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const color = new THREE.Color();
  const arcPts = [];

  layout.forEach((sq, k) => {
    const size = sq.size * scale;
    const geometry = new THREE.PlaneGeometry(size, size);
    paletteColor(params.palette, n > 1 ? k / (n - 1) : 0, color);
    const material = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const cx = (sq.x + sq.size / 2) * scale;
    const cy = (sq.y + sq.size / 2) * scale;
    mesh.position.set(cx, cy, -k * 0.001);
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: color.clone() });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.position.copy(mesh.position);
    group.add(mesh, edges);
    squares.push({ mesh, edges });

    minX = Math.min(minX, sq.x * scale);
    minY = Math.min(minY, sq.y * scale);
    maxX = Math.max(maxX, (sq.x + sq.size) * scale);
    maxY = Math.max(maxY, (sq.y + sq.size) * scale);

    for (let s = 0; s <= ARC_SEGMENTS; s += 1) {
      if (k > 0 && s === 0) continue; // shared joint with the previous arc
      const a =
        sq.startAngle + ((sq.endAngle - sq.startAngle) * s) / ARC_SEGMENTS;
      arcPts.push(
        (sq.arcCenterX + sq.size * Math.cos(a)) * scale,
        (sq.arcCenterY + sq.size * Math.sin(a)) * scale,
        0.01,
      );
    }
  });

  const arcGeometry = new THREE.BufferGeometry();
  arcGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(arcPts, 3),
  );
  const arcMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  arc = new THREE.Line(arcGeometry, arcMaterial);
  arcPointsPerTerm = ARC_SEGMENTS;
  group.add(arc);

  // centre the bounding box on the origin so the camera auto-fits
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  group.children.forEach((child) => {
    child.position.x -= cx;
    child.position.y -= cy;
  });
  fit = Math.hypot(maxX - minX, maxY - minY) / 2;
}

function clear() {
  squares.forEach(({ mesh, edges }) => {
    group.remove(mesh, edges);
    mesh.geometry.dispose();
    mesh.material.dispose();
    edges.geometry.dispose();
    edges.material.dispose();
  });
  squares = [];
  if (arc) {
    group.remove(arc);
    arc.geometry.dispose();
    arc.material.dispose();
    arc = null;
  }
}

function showTerms(count) {
  squares.forEach(({ mesh, edges }, k) => {
    const visible = k < count;
    mesh.visible = visible;
    edges.visible = visible;
  });
  if (arc) arc.geometry.setDrawRange(0, count * arcPointsPerTerm + 1);
}

export function create(targetScene, initialParams) {
  scene = targetScene;
  params = { ...initialParams };
  group = new THREE.Group();
  build();
  growth = 0;
  showTerms(params.playing ? 1 : squares.length);
  scene.add(group);
}

export function setParams(next) {
  const prev = params;
  params = { ...params, ...next };
  if (!group) return;
  if (clampN(prev.n) !== clampN(params.n) || prev.palette !== params.palette) {
    clear();
    group.rotation.set(0, 0, 0);
    build();
    growth = 0;
  }
  if (!params.playing) showTerms(squares.length);
}

export function update(dt) {
  if (!group) return;
  if (!params.playing) {
    showTerms(squares.length);
    return;
  }
  growth += dt;
  const total = squares.length * STEP_SECONDS + HOLD_SECONDS;
  if (growth > total) growth = 0;
  showTerms(
    Math.max(1, Math.min(squares.length, Math.ceil(growth / STEP_SECONDS))),
  );
  group.rotation.y =
    Math.sin(performance.now() / 4000) * 0.25 * params.rotationSpeed;
}

export function fitRadius() {
  return fit * 1.1;
}

export function dispose() {
  if (!group) return;
  clear();
  scene.remove(group);
  group = null;
  scene = null;
}
