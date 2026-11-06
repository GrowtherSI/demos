import { describe, test, expect } from "vitest";
import {
  fibonacci,
  fibonacciSequence,
  fibonacciNumber,
  ratios,
  convergenceError,
  validateInteger,
  formatBigInt,
  phyllotaxisPoint,
  fibonacciSpherePoint,
  spiralLayout,
  PHI,
  GOLDEN_ANGLE_RAD,
  GOLDEN_ANGLE_DEG,
  LIMITS,
} from "../src/fibonacci.js";

describe("Basic Fibonacci values", () => {
  test("F(0) is 0n", () => {
    expect(fibonacci(0)).toBe(0n);
  });
  test("F(1) is 1n", () => {
    expect(fibonacci(1)).toBe(1n);
  });
  test("F(10) is 55n", () => {
    expect(fibonacci(10)).toBe(55n);
  });
  test("F(78) equals 8944394323791464n", () => {
    expect(fibonacci(78)).toBe(8944394323791464n);
  });
  test("F(100) equals 354224848179261915075n", () => {
    expect(fibonacci(100)).toBe(354224848179261915075n);
  });
});

describe("Sequence generation", () => {
  test("fibonacciSequence(5) produces correct array", () => {
    const expected = [0n, 1n, 1n, 2n, 3n];
    expect(fibonacciSequence(5)).toEqual(expected);
  });
  test("fibonacciSequence length matches count", () => {
    expect(fibonacciSequence(10).length).toBe(10);
  });
});

describe("Ratio and convergence", () => {
  test("convergenceError(30) < 1e-10", () => {
    expect(convergenceError(30)).toBeLessThan(1e-10);
  });
  test("GOLDEN_ANGLE_DEG close to 137.508", () => {
    expect(GOLDEN_ANGLE_DEG).toBeCloseTo(137.508, 3);
  });
  test("radians and degrees are consistent", () => {
    const rad = GOLDEN_ANGLE_RAD;
    const deg = GOLDEN_ANGLE_DEG;
    expect(rad * (180 / Math.PI)).toBeCloseTo(deg, 3);
  });
});

describe("Validation", () => {
  const cases = [
    {
      value: -1,
      opts: { min: 0, max: 100, name: "test" },
      error: /must be between 0 and 100/,
    },
    {
      value: 2.5,
      opts: { min: 0, max: 10, name: "test" },
      error: /must be an integer/,
    },
    {
      value: NaN,
      opts: { min: 0, max: 10, name: "test" },
      error: /cannot be NaN or Infinity/,
    },
    {
      value: "abc",
      opts: { min: 0, max: 10, name: "test" },
      error: /must be a numeric string/,
    },
    {
      value: "",
      opts: { min: 0, max: 10, name: "test" },
      error: /must be a numeric string/,
    },
    {
      value: 150,
      opts: { min: 0, max: 100, name: "test" },
      error: /must be between 0 and 100/,
    },
  ];

  test.each(cases)("validation fails for $value", ({ value, opts, error }) => {
    const result = validateInteger(value, opts);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(error);
  });

  test("valid integer passes", () => {
    const result = validateInteger("42", { min: 0, max: 100, name: "test" });
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });
});

describe("Format BigInt", () => {
  test("formatBigInt with maxDigits 5 truncates", () => {
    const big = 123456789n;
    expect(formatBigInt(big, 5)).toBe("12345…(9 digits)");
  });
  test("formatBigInt without truncation returns full string", () => {
    const big = 98765n;
    expect(formatBigInt(big, 20)).toBe("98765");
  });
});

describe("Unit tests for helper functions", () => {
  test("phyllotaxisPoint computes correct r", () => {
    const point = phyllotaxisPoint(10, 1, GOLDEN_ANGLE_RAD);
    expect(point.r).toBeCloseTo(Math.sqrt(10), 6);
  });

  test("fibonacciSpherePoint returns unit length", () => {
    const count = 100;
    const point = fibonacciSpherePoint(10, count);
    const length = Math.sqrt(point.x ** 2 + point.y ** 2 + point.z ** 2);
    expect(length).toBeCloseTo(1, 9);
  });

  test("spiralLayout produces correct number of terms", () => {
    const layout = spiralLayout(5);
    expect(layout.length).toBe(5);
    expect(layout[0].size).toBe(1);
  });
});

describe("QA regression tests (Step 3 patches)", () => {
  test("fibonacci() matches the iterative sequence for n = 0..300", () => {
    const seq = fibonacciSequence(301);
    for (let n = 0; n <= 300; n += 1) expect(fibonacci(n)).toBe(seq[n]);
  });

  test("convergenceError(k) equals |F(k+1)/F(k) - PHI|", () => {
    expect(convergenceError(1)).toBeCloseTo(Math.abs(1 - PHI), 12);
    expect(convergenceError(10)).toBeCloseTo(Math.abs(89 / 55 - PHI), 15);
  });

  test("phyllotaxisPoint returns non-zero Cartesian x/y on radius r", () => {
    const p = phyllotaxisPoint(10, 2, GOLDEN_ANGLE_RAD);
    expect(p.r).toBe(2 * Math.sqrt(10));
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(p.r, 9);
    expect(p.x).not.toBe(0);
    expect(p.y).not.toBe(0);
  });

  test("fibonacciSpherePoint: every one of 1500 points is unit length", () => {
    for (let i = 0; i < 1500; i += 1) {
      const s = fibonacciSpherePoint(i, 1500);
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 9);
    }
  });

  test("spiralLayout sizes equal F(k) for all MAX_SPIRAL_TERMS terms", () => {
    spiralLayout(LIMITS.MAX_SPIRAL_TERMS).forEach((sq, idx) => {
      expect(sq.size).toBe(fibonacciNumber(idx + 1));
    });
  });

  test("spiralLayout arcs join end-to-start (continuous spiral)", () => {
    const layout = spiralLayout(12);
    for (let k = 1; k < layout.length; k += 1) {
      const a = layout[k - 1];
      const b = layout[k];
      const endX = a.arcCenterX + a.size * Math.cos(a.endAngle);
      const endY = a.arcCenterY + a.size * Math.sin(a.endAngle);
      const startX = b.arcCenterX + b.size * Math.cos(b.startAngle);
      const startY = b.arcCenterY + b.size * Math.sin(b.startAngle);
      expect(Math.abs(endX - startX)).toBeLessThan(1e-6);
      expect(Math.abs(endY - startY)).toBeLessThan(1e-6);
    }
  });

  test("spiralLayout rejects nTerms > 78", () => {
    expect(() => spiralLayout(79)).toThrow(RangeError);
  });
});
