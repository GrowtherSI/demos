// @vitest-environment jsdom
//
// Every control initUI() wires, through the real index.html markup: what it
// shows, what it validates, and what it reports through onChange.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initUI, MODE_LIMITS } from "../src/ui.js";
import { GOLDEN_ANGLE_DEG, LIMITS } from "../src/fibonacci.js";

// A string path: under jsdom, URL is jsdom's, which fileURLToPath() refuses.
const html = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../index.html"),
  "utf8",
);
const $ = (id) => document.getElementById(id);

let onChange;
let motion; // the fake prefers-reduced-motion MediaQueryList

function mount({ reduced = false } = {}) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, "");
  motion = { matches: reduced, listeners: [] };
  motion.addEventListener = (type, fn) => motion.listeners.push(fn);
  window.matchMedia = vi.fn(() => motion);
  onChange = vi.fn();
  return initUI({ onChange });
}

const fire = (el, type) =>
  el.dispatchEvent(new window.Event(type, { bubbles: true }));
const setValue = (id, value, type = "input") => {
  $(id).value = String(value);
  fire($(id), type);
};

beforeEach(() => {
  onChange = undefined;
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("initial state", () => {
  test("returns the params the markup and defaults describe", () => {
    const params = mount();
    expect(window.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    expect(params).toEqual({
      mode: "phyllotaxis",
      n: 2000,
      angleDeg: GOLDEN_ANGLE_DEG,
      palette: $("palette").value,
      pointSize: 1,
      rotationSpeed: 0.5,
      playing: true,
    });
    expect($("playBtn").textContent).toBe("Pause");
    expect($("playBtn").getAttribute("aria-pressed")).toBe("true");
    expect($("angleValue").textContent).toBe(`${GOLDEN_ANGLE_DEG.toFixed(2)}°`);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("starts paused when the visitor prefers reduced motion", () => {
    expect(mount({ reduced: true }).playing).toBe(false);
    expect($("playBtn").textContent).toBe("Play");
    expect($("playBtn").getAttribute("aria-pressed")).toBe("false");
  });

  test("the info panel shows the sequence up to F(N), capped at MAX_TERMS", () => {
    mount();
    expect($("termCount").textContent).toBe(`F(0)…F(${LIMITS.MAX_TERMS - 1})`);
    const items = $("terms").querySelectorAll("li");
    expect(items).toHaveLength(40);
    expect(items[39].value).toBe(LIMITS.MAX_TERMS - 1);
    expect(items[39].textContent).toMatch(/…\(209 digits\)$/);
    expect(Number($("ratio").textContent)).toBeCloseTo(1.618033988749895, 12);
    // converged to within one ULP of φ
    expect(Number($("error").textContent)).toBeLessThan(1e-15);
    expect($("error").textContent).toMatch(/^\d\.\d{3}e[+-]\d+$/);
  });
});

describe("N", () => {
  test("a valid N updates both inputs, the info panel and the scene", () => {
    mount();
    setValue("nInput", 5);
    expect($("nRange").value).toBe("5");
    expect($("validation").textContent).toBe("");
    expect($("nInput").getAttribute("aria-invalid")).toBe("false");
    expect($("termCount").textContent).toBe("F(0)…F(5)");
    expect([...$("terms").children].map((li) => li.textContent)).toEqual([
      "0",
      "1",
      "1",
      "2",
      "3",
      "5",
    ]);
    expect($("ratio").textContent).toBe((8 / 5).toPrecision(15));
    expect(onChange).toHaveBeenLastCalledWith({ n: 5 }, { modeChanged: false });
  });

  test("the slider updates the number box", () => {
    mount();
    setValue("nRange", 300);
    expect($("nInput").value).toBe("300");
    expect(onChange).toHaveBeenLastCalledWith(
      { n: 300 },
      { modeChanged: false },
    );
  });

  test("N = 1 still shows F(0) and F(1)", () => {
    mount();
    setValue("nInput", 1);
    expect($("termCount").textContent).toBe("F(0)…F(1)");
    expect($("ratio").textContent).toBe((1).toPrecision(15));
  });

  test("an invalid N is reported and the last valid one is kept", () => {
    mount();
    setValue("nInput", 50000);
    expect($("validation").textContent).toBe(
      `N must be between 1 and ${MODE_LIMITS.phyllotaxis}`,
    );
    expect($("nInput").getAttribute("aria-invalid")).toBe("true");
    expect($("nRange").value).toBe("2000");
    expect(onChange).not.toHaveBeenCalled();

    setValue("nInput", "abc");
    expect($("validation").textContent).toBe("N must be a numeric string");
  });

  test("an invalid slider value snaps the slider back", () => {
    mount();
    // a range input sanitises its value, so stand in for one it cannot hold
    Object.defineProperty($("nRange"), "value", {
      configurable: true,
      get: () => "0",
      set: vi.fn(),
    });
    fire($("nRange"), "input");
    expect($("validation").textContent).toBe("N must be between 1 and 20000");
    expect(
      Object.getOwnPropertyDescriptor($("nRange"), "value").set,
    ).toHaveBeenCalledWith("2000");
  });
});

describe("mode", () => {
  test("switching mode restores that mode’s last valid N and its limits", () => {
    mount();
    setValue("nInput", 700);
    setValue("mode", "spiral", "change");
    expect(onChange).toHaveBeenLastCalledWith(
      { mode: "spiral", n: 12 },
      { modeChanged: true },
    );
    expect($("nInput").max).toBe(String(MODE_LIMITS.spiral));
    expect($("nRange").max).toBe(String(MODE_LIMITS.spiral));
    expect($("nInput").value).toBe("12");
    expect($("nLabel").textContent).toBe("N (squares)");
    expect($("angleInput").disabled).toBe(true);
    expect($("resetAngle").disabled).toBe(true);

    setValue("mode", "phyllotaxis", "change");
    expect(onChange).toHaveBeenLastCalledWith(
      { mode: "phyllotaxis", n: 700 },
      { modeChanged: true },
    );
    expect($("nLabel").textContent).toBe("N (points)");
    expect($("angleInput").disabled).toBe(false);
  });

  test("switching mode clears a validation error", () => {
    mount();
    setValue("nInput", -1);
    setValue("mode", "sphere", "change");
    expect($("validation").textContent).toBe("");
    expect($("nInput").value).toBe("1500");
  });
});

describe("look and motion controls", () => {
  test("angle slider and reset", () => {
    mount();
    setValue("angleInput", 120.5);
    expect($("angleValue").textContent).toBe("120.50°");
    expect(onChange).toHaveBeenLastCalledWith(
      { angleDeg: 120.5 },
      { modeChanged: false },
    );

    $("resetAngle").click();
    expect($("angleValue").textContent).toBe(`${GOLDEN_ANGLE_DEG.toFixed(2)}°`);
    expect(onChange).toHaveBeenLastCalledWith(
      { angleDeg: GOLDEN_ANGLE_DEG },
      { modeChanged: false },
    );
  });

  test("palette, point size and rotation speed", () => {
    mount();
    setValue("palette", "ocean", "change");
    expect(onChange).toHaveBeenLastCalledWith(
      { palette: "ocean" },
      { modeChanged: false },
    );
    setValue("pointSize", 1.5);
    expect(onChange).toHaveBeenLastCalledWith(
      { pointSize: 1.5 },
      { modeChanged: false },
    );
    setValue("rotationSpeed", 2);
    expect(onChange).toHaveBeenLastCalledWith(
      { rotationSpeed: 2 },
      { modeChanged: false },
    );
  });

  test("Play / Pause toggles", () => {
    mount();
    $("playBtn").click();
    expect($("playBtn").textContent).toBe("Play");
    expect(onChange).toHaveBeenLastCalledWith(
      { playing: false },
      { modeChanged: false },
    );
    $("playBtn").click();
    expect($("playBtn").getAttribute("aria-pressed")).toBe("true");
    expect(onChange).toHaveBeenLastCalledWith(
      { playing: true },
      { modeChanged: false },
    );
  });

  test("turning on reduced motion pauses a playing animation, and only then", () => {
    mount();
    motion.listeners.forEach((fn) => fn({ matches: false }));
    expect(onChange).not.toHaveBeenCalled();

    motion.listeners.forEach((fn) => fn({ matches: true }));
    expect($("playBtn").textContent).toBe("Play");
    expect(onChange).toHaveBeenCalledWith(
      { playing: false },
      { modeChanged: false },
    );

    onChange.mockClear();
    motion.listeners.forEach((fn) => fn({ matches: true })); // already paused
    expect(onChange).not.toHaveBeenCalled();
  });

  test("the form never submits", () => {
    mount();
    const event = new window.Event("submit", { cancelable: true });
    $("controls").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("panel drawer", () => {
  const key = (k) =>
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: k }));

  test("the toggle opens and closes it, moving focus into it", () => {
    mount();
    $("panelToggle").click();
    expect($("panelToggle").getAttribute("aria-expanded")).toBe("true");
    expect($("controls").classList.contains("is-open")).toBe(true);
    expect(document.activeElement).toBe($("mode"));

    $("panelToggle").click();
    expect($("panelToggle").getAttribute("aria-expanded")).toBe("false");
    expect($("controls").classList.contains("is-open")).toBe(false);
  });

  test("Escape closes an open drawer and returns focus to the toggle", () => {
    mount();
    $("panelToggle").click();
    key("Enter");
    expect($("controls").classList.contains("is-open")).toBe(true);

    key("Escape");
    expect($("panelToggle").getAttribute("aria-expanded")).toBe("false");
    expect($("controls").classList.contains("is-open")).toBe(false);
    expect(document.activeElement).toBe($("panelToggle"));
  });

  test("Escape does nothing while the drawer is closed", () => {
    mount();
    $("nInput").focus();
    key("Escape");
    expect(document.activeElement).toBe($("nInput"));
  });
});
