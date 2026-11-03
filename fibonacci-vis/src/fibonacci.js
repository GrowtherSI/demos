/**
 * Pure Fibonacci mathematics module.
 * No imports, no DOM, no Three.js, no module-level mutable state.
 */

/** PHI – the golden ratio, (1 + √5) / 2. */
export const PHI = (1 + Math.sqrt(5)) / 2;

/** GOLDEN_ANGLE_RAD – golden divergence angle in radians, π(3 − √5). */
export const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

/** GOLDEN_ANGLE_DEG – golden divergence angle in degrees (≈137.50776). */
export const GOLDEN_ANGLE_DEG = GOLDEN_ANGLE_RAD * (180 / Math.PI);

/**
 * LIMITS – input limits used by the UI and the visualizations.
 * MAX_TERMS – sequence terms shown in the info panel
 * MAX_POINTS – points for phyllotaxis / sphere
 * MAX_SPIRAL_TERMS – squares in the golden spiral
 */
export const LIMITS = Object.freeze({
  MAX_TERMS: 1000,
  MAX_POINTS: 20000,
  MAX_SPIRAL_TERMS: 30,
});

/** Largest n for which F(n) is exactly representable as a Number. */
const MAX_EXACT_NUMBER_INDEX = 78;

function assertNonNegativeInteger(value, name) {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
    return Number(value);
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${String(value)}`);
  }
  return value;
}

/**
 * fibonacci(n) – the n-th Fibonacci number as a BigInt.
 * Iterative fast doubling (O(log n) BigInt multiplications); no recursion.
 * @param {number|bigint} n
 * @returns {bigint}
 */
export function fibonacci(n) {
  const idx = assertNonNegativeInteger(n, 'n');
  let a = 0n; // F(k)
  let b = 1n; // F(k+1)
  const bits = idx.toString(2);
  for (let i = 0; i < bits.length; i += 1) {
    const c = a * (2n * b - a); // F(2k)
    const d = a * a + b * b; // F(2k+1)
    if (bits[i] === '1') {
      a = d;
      b = c + d;
    } else {
      a = c;
      b = d;
    }
  }
  return idx === 0 ? 0n : a;
}

/**
 * fibonacciSequence(count) – F(0) … F(count−1) as BigInts (linear additions only).
 * @param {number} count
 * @returns {bigint[]}
 */
export function fibonacciSequence(count) {
  const n = assertNonNegativeInteger(count, 'count');
  const result = new Array(n);
  let a = 0n;
  let b = 1n;
  for (let i = 0; i < n; i += 1) {
    result[i] = a;
    const next = a + b;
    a = b;
    b = next;
  }
  return result;
}

/**
 * fibonacciNumber(n) – F(n) as a Number. Exact for n ≤ 78.
 * @param {number} n
 * @returns {number}
 */
export function fibonacciNumber(n) {
  return Number(fibonacci(n));
}

/**
 * ratios(count) – [F(2)/F(1), F(3)/F(2), …], i.e. ratios(count)[k−1] = F(k+1)/F(k).
 * @param {number} count – number of ratios (≥ 1)
 * @returns {number[]}
 */
export function ratios(count) {
  const n = assertNonNegativeInteger(count, 'count');
  if (n < 1) throw new RangeError('count must be at least 1');
  const result = new Array(n);
  let a = 1n; // F(k)
  let b = 1n; // F(k+1)
  for (let i = 0; i < n; i += 1) {
    result[i] = Number(b) / Number(a);
    const next = a + b;
    a = b;
    b = next;
  }
  return result;
}

/**
 * convergenceError(k) – |F(k+1)/F(k) − φ| for k ≥ 1.
 * @param {number} k
 * @returns {number}
 */
export function convergenceError(k) {
  const idx = assertNonNegativeInteger(k, 'k');
  if (idx < 1) throw new RangeError('k must be at least 1');
  const r = ratios(idx);
  return Math.abs(r[idx - 1] - PHI);
}

/**
 * validateInteger(value, {min, max, name}) – validate user input.
 * Accepts integer Numbers and integer strings (surrounding whitespace allowed).
 * @returns {{ok:boolean, value:any, error?:string}}
 */
export function validateInteger(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, name = 'Value' } = {}) {
  let v = value;
  if (typeof v === 'string') {
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(v)) {
      v = parseFloat(v);
    } else {
      return { ok: false, value, error: `${name} must be a numeric string` };
    }
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return { ok: false, value, error: `${name} cannot be NaN or Infinity` };
  }
  if (!Number.isInteger(v)) {
    return { ok: false, value, error: `${name} must be an integer` };
  }
  if (v < min || v > max) {
    return { ok: false, value, error: `${name} must be between ${min} and ${max}` };
  }
  return { ok: true, value: v };
}

/**
 * formatBigInt(b, maxDigits) – decimal string, truncated as "1234…(N digits)".
 * @param {bigint|number} b
 * @param {number} [maxDigits=20]
 * @returns {string}
 */
export function formatBigInt(b, maxDigits = 20) {
  const s = b.toString();
  const negative = s.startsWith('-');
  const digits = negative ? s.slice(1) : s;
  if (digits.length > maxDigits) {
    return `${negative ? '-' : ''}${digits.slice(0, maxDigits)}…(${digits.length} digits)`;
  }
  return s;
}

/**
 * phyllotaxisPoint(i, c, angleRad) – Vogel's model: r = c√i, θ = i·angle.
 * @returns {{x:number, y:number, r:number, theta:number}}
 */
export function phyllotaxisPoint(i, c = 1, angleRad = GOLDEN_ANGLE_RAD) {
  const r = c * Math.sqrt(i);
  const theta = i * angleRad;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), r, theta };
}

/**
 * fibonacciSpherePoint(i, count) – unit vector of point i on a Fibonacci sphere.
 * @returns {{x:number, y:number, z:number}}
 */
export function fibonacciSpherePoint(i, count) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(i) || i < 0 || i >= count) {
    throw new RangeError(`fibonacciSpherePoint: need integers 0 <= i < count, got i=${i}, count=${count}`);
  }
  const y = 1 - (2 * (i + 0.5)) / count; // uniform in y => equal-area bands
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * GOLDEN_ANGLE_RAD;
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
}

/**
 * spiralLayout(nTerms) – golden-spiral tiling of squares of side F(1) … F(nTerms).
 * Square k is placed counter-clockwise (right, up, left, down) around the bounding
 * box of the previous squares; (x, y) is its lower-left corner. Each quarter arc of
 * radius `size` is centred on (arcCenterX, arcCenterY) and runs from startAngle to
 * endAngle; consecutive arcs join end-to-start, forming a continuous spiral.
 * @param {number} nTerms – 0 … 78
 * @returns {Array<{size:number,x:number,y:number,arcCenterX:number,arcCenterY:number,startAngle:number,endAngle:number}>}
 */
export function spiralLayout(nTerms) {
  const n = assertNonNegativeInteger(nTerms, 'nTerms');
  if (n > MAX_EXACT_NUMBER_INDEX) {
    throw new RangeError(`nTerms must be <= ${MAX_EXACT_NUMBER_INDEX} so sizes stay exact`);
  }
  const result = [];
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let prev = 0; // F(k-1)
  let curr = 1; // F(k)
  for (let k = 1; k <= n; k += 1) {
    const size = curr;
    let x;
    let y;
    let cx;
    let cy;
    let start;
    // square 1 behaves like a "down" square so its arc ends where square 2's begins
    const dir = k === 1 ? 3 : (k - 2) % 4;
    if (k === 1) {
      x = 0;
      y = 0;
    } else if (dir === 0) {
      x = maxX;
      y = minY;
    } else if (dir === 1) {
      x = minX;
      y = maxY;
    } else if (dir === 2) {
      x = minX - size;
      y = minY;
    } else {
      x = minX;
      y = minY - size;
    }
    if (dir === 0) {
      cx = x; cy = y + size; start = -Math.PI / 2;
    } else if (dir === 1) {
      cx = x; cy = y; start = 0;
    } else if (dir === 2) {
      cx = x + size; cy = y; start = Math.PI / 2;
    } else {
      cx = x + size; cy = y + size; start = Math.PI;
    }
    result.push({
      size,
      x,
      y,
      arcCenterX: cx,
      arcCenterY: cy,
      startAngle: start,
      endAngle: start + Math.PI / 2,
    });
    if (k === 1) {
      minX = 0; minY = 0; maxX = 1; maxY = 1;
    } else {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + size);
      maxY = Math.max(maxY, y + size);
    }
    const next = prev + curr;
    prev = curr;
    curr = next;
  }
  return result;
}
