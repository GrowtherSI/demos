// The three visualization modules, driven directly against a real THREE.Scene:
// what each builds, how it grows while playing, what an in-place setParams()
// rewrites, and that dispose() frees everything. No WebGL is needed — none of
// this touches a renderer.
import { afterEach, describe, expect, test, vi } from "vitest";
import * as THREE from "three";
import * as spiral from "../src/visualizations/spiral.js";
import * as phyllotaxis from "../src/visualizations/phyllotaxis.js";
import * as sphere from "../src/visualizations/sphere.js";
import { LIMITS } from "../src/fibonacci.js";

const BASE = {
  n: 12,
  angleDeg: 137.5,
  palette: "sunflower",
  pointSize: 1,
  rotationSpeed: 1,
  playing: false,
};

afterEach(() => {
  spiral.dispose();
  phyllotaxis.dispose();
  sphere.dispose();
  vi.restoreAllMocks();
});

describe.each([
  ["phyllotaxis", phyllotaxis, "z", 10 * 1.05],
  ["sphere", sphere, "y", 6 * 1.15],
])("%s", (name, mod, spinAxis, radius) => {
  const mount = (params = {}) => {
    const scene = new THREE.Scene();
    mod.create(scene, { ...BASE, n: 100, ...params });
    return { scene, mesh: scene.children[0] };
  };

  test("before create(), update() and setParams() are no-ops", () => {
    expect(() => mod.update(0.1)).not.toThrow();
    expect(() => mod.setParams({ n: 5 })).not.toThrow();
    expect(() => mod.dispose()).not.toThrow();
  });

  test("create() adds one instanced mesh sized for the maximum point count", () => {
    const { scene, mesh } = mount();
    expect(scene.children).toHaveLength(1);
    expect(mesh.isInstancedMesh).toBe(true);
    expect(mesh.instanceMatrix.count).toBe(LIMITS.MAX_POINTS);
    expect(mesh.count).toBe(100); // paused: everything shown at once
    expect(mesh.instanceColor.count).toBe(LIMITS.MAX_POINTS);
  });

  test("N is clamped to 1 … MAX_POINTS and a non-number reads as 1", () => {
    expect(mount({ n: 1e9 }).mesh.count).toBe(LIMITS.MAX_POINTS);
    mod.dispose();
    expect(mount({ n: 0 }).mesh.count).toBe(1);
    mod.dispose();
    expect(mount({ n: "x" }).mesh.count).toBe(1);
  });

  test("while playing it grows from one point, spins, and starts over", () => {
    const { mesh } = mount({ playing: true });
    expect(mesh.count).toBe(1);

    mod.update(2); // half of the 4 s growth
    expect(mesh.count).toBe(50);
    expect(mesh.rotation[spinAxis]).not.toBe(0);

    mod.update(2);
    expect(mesh.count).toBe(100);
    mod.update(1.5); // holding at full size
    expect(mesh.count).toBe(100);

    mod.update(1); // past grow + hold: regrow from the start
    expect(mesh.count).toBe(1);
  });

  test("paused, update() keeps every point visible", () => {
    const { mesh } = mount();
    mesh.count = 3;
    mod.update(1);
    expect(mesh.count).toBe(100);
  });

  test("setParams() rewrites positions and colours in place only when they change", () => {
    const { scene, mesh } = mount();
    const pos = () => mesh.instanceMatrix.version;
    const col = () => mesh.instanceColor.version;
    let [p, c] = [pos(), col()];

    mod.setParams({ rotationSpeed: 2 });
    expect([pos(), col()]).toEqual([p, c]);

    mod.setParams({ pointSize: 2 });
    expect(pos()).toBeGreaterThan(p);
    expect(col()).toBe(c);

    [p, c] = [pos(), col()];
    mod.setParams({ palette: "ocean" });
    expect(pos()).toBe(p);
    expect(col()).toBeGreaterThan(c);

    [p, c] = [pos(), col()];
    mod.setParams({ n: 40 });
    expect(pos()).toBeGreaterThan(p);
    expect(col()).toBeGreaterThan(c);
    expect(mesh.count).toBe(40);
    expect(scene.children[0]).toBe(mesh); // nothing was recreated
  });

  test("setParams() while playing leaves the growth animation to update()", () => {
    const { mesh } = mount({ playing: true });
    mod.setParams({ n: 60 });
    expect(mesh.count).toBe(1);
  });

  test("a single point takes the first palette colour", () => {
    const { mesh } = mount({ n: 1, palette: "mono" });
    const c = new THREE.Color();
    mesh.getColorAt(0, c);
    expect(`#${c.getHexString()}`).toBe("#555b6e");
  });

  test("fitRadius() bounds the pattern", () => {
    expect(mod.fitRadius()).toBeCloseTo(radius, 10);
  });

  test("dispose() removes the mesh and frees its GPU resources, once", () => {
    const { scene, mesh } = mount();
    const spies = [
      vi.spyOn(mesh.geometry, "dispose"),
      vi.spyOn(mesh.material, "dispose"),
      vi.spyOn(mesh, "dispose"),
    ];
    mod.dispose();
    mod.dispose();
    expect(scene.children).toHaveLength(0);
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });

  if (name === "phyllotaxis") {
    test("the divergence angle moves the points without recolouring them", () => {
      const { mesh } = mount();
      const c = mesh.instanceColor.version;
      const before = Array.from(mesh.instanceMatrix.array.slice(16, 32));
      mod.setParams({ angleDeg: 90 });
      expect(Array.from(mesh.instanceMatrix.array.slice(16, 32))).not.toEqual(
        before,
      );
      expect(mesh.instanceColor.version).toBe(c);
    });
  }
});

describe("spiral", () => {
  const mount = (params = {}) => {
    const scene = new THREE.Scene();
    spiral.create(scene, { ...BASE, ...params });
    const group = scene.children[0];
    const squares = group.children.filter((c) => c.isMesh);
    const edges = group.children.filter((c) => c.isLineSegments);
    const arc = group.children.find((c) => c.isLine && !c.isLineSegments);
    return { scene, group, squares, edges, arc };
  };
  const visible = (objs) => objs.filter((o) => o.visible).length;

  test("before create(), update() and setParams() are no-ops", () => {
    expect(() => spiral.update(0.1)).not.toThrow();
    expect(() => spiral.setParams({ n: 5 })).not.toThrow();
    expect(() => spiral.dispose()).not.toThrow();
  });

  test("create() builds a square, its outline and one arc per term", () => {
    const { scene, squares, edges, arc } = mount();
    expect(scene.children).toHaveLength(1);
    expect(squares).toHaveLength(12);
    expect(edges).toHaveLength(12);
    // 33 points for the first arc, 32 for each after (joints are shared)
    expect(arc.geometry.getAttribute("position").count).toBe(33 + 11 * 32);
    expect(visible(squares)).toBe(12);
  });

  test("the largest square is 10 units and the tiling is centred on the origin", () => {
    const { squares, group } = mount();
    const sizes = squares.map((m) => m.geometry.parameters.width);
    expect(Math.max(...sizes)).toBeCloseTo(10, 10);
    const box = new THREE.Box3().setFromObject(group);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
    expect((box.min.y + box.max.y) / 2).toBeCloseTo(0, 6);
    expect(spiral.fitRadius()).toBeCloseTo(
      (Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y) / 2) * 1.1,
      4,
    );
  });

  test("N is clamped to 1 … MAX_SPIRAL_TERMS", () => {
    expect(mount({ n: 999 }).squares).toHaveLength(LIMITS.MAX_SPIRAL_TERMS);
    spiral.dispose();
    const one = mount({ n: "x" });
    expect(one.squares).toHaveLength(1);
    // one square takes the first palette colour
    expect(`#${one.squares[0].material.color.getHexString()}`).toBe("#3b1f0b");
  });

  test("while playing it reveals one term per step, sways, and starts over", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const { squares, arc, group } = mount({ playing: true });
    expect(visible(squares)).toBe(1);
    expect(arc.geometry.drawRange.count).toBe(33);

    spiral.update(0.7); // two 0.35 s steps
    expect(visible(squares)).toBe(2);
    expect(arc.geometry.drawRange.count).toBe(65);
    expect(group.rotation.y).toBeCloseTo(Math.sin(1000 / 4000) * 0.25, 10);

    spiral.update(12 * 0.35); // all terms, then into the 2 s hold
    expect(visible(squares)).toBe(12);
    spiral.update(2); // past the hold: start over
    expect(visible(squares)).toBe(1);
  });

  test("paused, update() shows every term", () => {
    const { squares } = mount();
    squares.forEach((m) => (m.visible = false));
    spiral.update(1);
    expect(visible(squares)).toBe(12);
  });

  test("setParams() rebuilds for a new N or palette, and frees what it replaces", () => {
    const { scene, group, squares } = mount();
    const freed = squares.map((m) => vi.spyOn(m.geometry, "dispose"));
    group.rotation.y = 0.5;

    spiral.setParams({ rotationSpeed: 2 });
    expect(group.children.filter((c) => c.isMesh)).toEqual(squares);

    spiral.setParams({ n: 5 });
    expect(scene.children[0]).toBe(group); // the group itself stays
    expect(group.children.filter((c) => c.isMesh)).toHaveLength(5);
    expect(group.rotation.y).toBe(0);
    freed.forEach((s) => expect(s).toHaveBeenCalledTimes(1));

    const before = group.children.find((c) => c.isMesh);
    spiral.setParams({ palette: "ocean" });
    expect(group.children.find((c) => c.isMesh)).not.toBe(before);
  });

  test("setParams() while playing leaves the reveal to update()", () => {
    const { group } = mount({ playing: true });
    spiral.setParams({ n: 4 });
    expect(visible(group.children.filter((c) => c.isMesh))).toBe(4);
    // a rebuild while playing restarts the reveal on the next frame
    spiral.update(0.01);
    expect(visible(group.children.filter((c) => c.isMesh))).toBe(1);
  });

  test("dispose() removes the group and frees every geometry and material", () => {
    const { scene, group } = mount();
    const spies = [];
    group.traverse((o) => {
      if (o.geometry) spies.push(vi.spyOn(o.geometry, "dispose"));
      if (o.material) spies.push(vi.spyOn(o.material, "dispose"));
    });
    spiral.dispose();
    expect(scene.children).toHaveLength(0);
    expect(spies).toHaveLength(2 * 25);
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });
});
