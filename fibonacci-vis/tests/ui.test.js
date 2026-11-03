// @vitest-environment jsdom
//
// Mode switching, dispose() of GPU resources, and the live angle update.
//
// The real index.html markup is loaded into jsdom, the real initUI() wires the
// real <select id="mode"> and <input id="angleInput">, and the real
// createModeController() (the same code main.js runs) drives the three real
// visualization modules against a real THREE.Scene. Only WebGL is absent, and
// none of the code under test touches the renderer.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { initUI } from '../src/ui.js';
import { createModeController } from '../src/modeController.js';
import * as spiral from '../src/visualizations/spiral.js';
import * as phyllotaxis from '../src/visualizations/phyllotaxis.js';
import * as sphere from '../src/visualizations/sphere.js';
import { GOLDEN_ANGLE_DEG } from '../src/fibonacci.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODES = ['spiral', 'phyllotaxis', 'sphere'];

/** Load the <body> of the real index.html, minus its module <script>. */
function loadMarkup() {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
}

/** Every geometry and material reachable from the scene graph. */
function gpuResources(scene) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) [].concat(obj.material).forEach((m) => materials.add(m));
  });
  return { geometries: [...geometries], materials: [...materials] };
}

/** Real modules wrapped so every call is still executed but also recorded. */
function spiedModules() {
  const wrap = (mod) => ({
    create: vi.fn(mod.create),
    update: vi.fn(mod.update),
    dispose: vi.fn(mod.dispose),
    setParams: vi.fn(mod.setParams),
    fitRadius: mod.fitRadius,
  });
  return { spiral: wrap(spiral), phyllotaxis: wrap(phyllotaxis), sphere: wrap(sphere) };
}

function selectMode(mode) {
  const select = document.getElementById('mode');
  select.value = mode;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

let scene;
let modules;
let controller;

beforeEach(() => {
  // initUI needs matchMedia; reduced motion = paused, so mesh.count is deterministic.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() });
  loadMarkup();
  scene = new THREE.Scene();
  modules = spiedModules();
  const params = initUI({
    onChange: (change, meta) => controller.apply(change, meta),
  });
  // Small N keeps the test fast; the code path is identical for large N.
  controller = createModeController({ scene, modules, params: { ...params, n: 50 } });
  controller.activate(params.mode);
});

afterEach(() => {
  controller.dispose();
  document.body.innerHTML = '';
});

describe('mode switching through the real <select id="mode">', () => {
  test('index.html offers exactly the three modes', () => {
    const values = [...document.querySelectorAll('#mode option')].map((o) => o.value);
    expect(values.sort()).toEqual([...MODES].sort());
  });

  test.each(MODES.flatMap((from) => MODES.filter((to) => to !== from).map((to) => [from, to])))(
    'switching %s -> %s calls the previous module dispose() before the next create()',
    (from, to) => {
      if (controller.mode !== from) selectMode(from);
      const prev = modules[from];
      const next = modules[to];
      prev.dispose.mockClear();
      next.create.mockClear();

      selectMode(to);

      expect(controller.mode).toBe(to);
      expect(prev.dispose).toHaveBeenCalledTimes(1);
      expect(next.create).toHaveBeenCalledTimes(1);
      expect(prev.dispose.mock.invocationCallOrder[0]).toBeLessThan(
        next.create.mock.invocationCallOrder[0],
      );
    },
  );

  test('dispose() frees every geometry and material the previous mode created', () => {
    for (const to of [...MODES, ...MODES]) {
      if (controller.mode === to) continue;
      const { geometries, materials } = gpuResources(scene);
      expect(geometries.length).toBeGreaterThan(0);
      expect(materials.length).toBeGreaterThan(0);
      const gSpies = geometries.map((g) => vi.spyOn(g, 'dispose'));
      const mSpies = materials.map((m) => vi.spyOn(m, 'dispose'));

      selectMode(to);

      gSpies.forEach((s) => expect(s).toHaveBeenCalled());
      mSpies.forEach((s) => expect(s).toHaveBeenCalled());
      // none of the old objects remain attached to the scene
      const after = gpuResources(scene);
      geometries.forEach((g) => expect(after.geometries).not.toContain(g));
      materials.forEach((m) => expect(after.materials).not.toContain(m));
    }
  });

  test('20 consecutive switches leave exactly one module mounted (no accumulation)', () => {
    for (let i = 0; i < 20; i += 1) selectMode(MODES[i % MODES.length]);
    // the scene holds only the active module's root object(s)
    expect(scene.children.length).toBe(1);
    const totalCreates = MODES.reduce((sum, m) => sum + modules[m].create.mock.calls.length, 0);
    const totalDisposes = MODES.reduce((sum, m) => sum + modules[m].dispose.mock.calls.length, 0);
    expect(totalCreates - totalDisposes).toBe(1);
  });
});

describe('live angle control through the real <input id="angleInput">', () => {
  test('angle change updates phyllotaxis in place: setParams only, no dispose/create', () => {
    selectMode('phyllotaxis');
    const mesh = scene.children.find((c) => c.isInstancedMesh);
    const before = mesh.instanceMatrix.array.slice(0, 32);
    const versionBefore = mesh.instanceMatrix.version;
    modules.phyllotaxis.create.mockClear();
    modules.phyllotaxis.dispose.mockClear();

    const angle = document.getElementById('angleInput');
    angle.value = '120';
    angle.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(modules.phyllotaxis.setParams).toHaveBeenCalledWith({ angleDeg: 120 });
    expect(modules.phyllotaxis.create).not.toHaveBeenCalled();
    expect(modules.phyllotaxis.dispose).not.toHaveBeenCalled();
    // same mesh object, new positions
    expect(scene.children.find((c) => c.isInstancedMesh)).toBe(mesh);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(versionBefore);
    expect(Array.from(mesh.instanceMatrix.array.slice(0, 32))).not.toEqual(Array.from(before));
    expect(document.getElementById('angleValue').textContent).toBe('120.00°');
  });

  test('reset button restores the golden angle', () => {
    selectMode('phyllotaxis');
    document.getElementById('resetAngle').click();
    expect(controller.params.angleDeg).toBeCloseTo(GOLDEN_ANGLE_DEG, 10);
  });
});
