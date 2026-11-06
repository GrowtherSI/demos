import { describe, expect, test, vi } from "vitest";
import { createModeController } from "../src/modeController.js";

const fakeModule = ({ setParams = true } = {}) => ({
  create: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
  ...(setParams ? { setParams: vi.fn() } : {}),
});

const setup = (opts = {}) => {
  const modules = {
    a: fakeModule(),
    b: fakeModule(),
    c: fakeModule({ setParams: false }),
  };
  const scene = { add: vi.fn(), remove: vi.fn() };
  const controller = createModeController({
    scene,
    modules,
    params: { mode: "a", n: 1 },
    ...opts,
  });
  return { modules, scene, controller };
};

describe("createModeController", () => {
  test.each([
    [{ modules: {}, params: {} }],
    [{ scene: {}, params: {} }],
    [{ scene: {}, modules: {} }],
  ])("requires a scene, modules and params", (opts) => {
    expect(() => createModeController(opts)).toThrow(
      new TypeError(
        "createModeController: scene, modules and params are required",
      ),
    );
  });

  test("starts with nothing active", () => {
    const { controller } = setup();
    expect(controller.active).toBeNull();
    expect(controller.mode).toBeNull();
    expect(controller.params).toEqual({ mode: "a", n: 1 });
  });

  test("activate() creates the module with the scene and current params", () => {
    const onActivate = vi.fn();
    const { controller, modules, scene } = setup({ onActivate });
    controller.activate("b");
    expect(modules.b.create).toHaveBeenCalledWith(scene, { mode: "b", n: 1 });
    expect(controller.active).toBe(modules.b);
    expect(controller.mode).toBe("b");
    expect(onActivate).toHaveBeenCalledWith(modules.b, "b");
  });

  test("activate() rejects an unknown mode and leaves the active one alone", () => {
    const { controller, modules } = setup();
    controller.activate("a");
    expect(() => controller.activate("zzz")).toThrow(
      new RangeError("Unknown visualization mode: zzz"),
    );
    expect(controller.active).toBe(modules.a);
    expect(modules.a.dispose).not.toHaveBeenCalled();
  });

  test("apply() activates the current mode when nothing is active yet", () => {
    const { controller, modules } = setup();
    expect(controller.apply({ n: 5 })).toBe("activated");
    expect(modules.a.create).toHaveBeenCalledWith(expect.anything(), {
      mode: "a",
      n: 5,
    });
  });

  test("apply() switches mode only when the mode really changed", () => {
    const { controller, modules } = setup();
    controller.activate("a");
    expect(controller.apply({ mode: "a" }, { modeChanged: true })).toBe(
      "updated",
    );
    expect(controller.apply({ mode: "b" }, { modeChanged: true })).toBe(
      "activated",
    );
    expect(modules.a.dispose).toHaveBeenCalledTimes(1);
    expect(controller.mode).toBe("b");
  });

  test("apply() updates in place through setParams() when the module has it", () => {
    const { controller, modules } = setup();
    controller.activate("a");
    expect(controller.apply({ n: 9 })).toBe("updated");
    expect(modules.a.setParams).toHaveBeenCalledWith({ n: 9 });
    expect(modules.a.create).toHaveBeenCalledTimes(1);
    expect(controller.params.n).toBe(9);
  });

  test("apply() recreates a module that has no setParams()", () => {
    const { controller, modules, scene } = setup();
    controller.activate("c");
    expect(controller.apply({ n: 3 })).toBe("recreated");
    expect(modules.c.dispose).toHaveBeenCalledTimes(1);
    expect(modules.c.create).toHaveBeenLastCalledWith(scene, {
      mode: "c",
      n: 3,
    });
  });

  test("dispose() frees the active module and is safe to repeat", () => {
    const { controller, modules } = setup();
    controller.activate("a");
    controller.dispose();
    controller.dispose();
    expect(modules.a.dispose).toHaveBeenCalledTimes(1);
    expect(controller.active).toBeNull();
    expect(controller.mode).toBeNull();
  });

  test("params is a copy", () => {
    const { controller } = setup();
    controller.params.n = 99;
    expect(controller.params.n).toBe(1);
  });
});
