// Timing budget: the math behind one N update must stay under 200 ms.
// Run: npm run perf
import { performance } from 'node:perf_hooks';
import { fibonacciSequence, ratios, phyllotaxisPoint, GOLDEN_ANGLE_RAD } from '../src/fibonacci.js';

const BUDGET_MS = 200;
const POINTS = 20000;

function time(label, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  console.log(`${label}: ${ms.toFixed(3)} ms`);
  return { ms, result };
}

const seq = time('fibonacciSequence(1000)', () => fibonacciSequence(1000));
const rat = time('ratios(1000)', () => ratios(1000));
const phy = time(`phyllotaxisPoint x ${POINTS}`, () => {
  let checksum = 0;
  for (let i = 0; i < POINTS; i += 1) {
    const p = phyllotaxisPoint(i, 1, GOLDEN_ANGLE_RAD);
    checksum += p.x + p.y;
  }
  return checksum;
});

// Sanity checks so the timing is not measuring dead code.
if (seq.result.length !== 1000 || rat.result.length !== 1000 || !Number.isFinite(phy.result)) {
  console.error('FAIL: unexpected result shape');
  process.exit(2);
}

const total = seq.ms + rat.ms + phy.ms;
console.log(`Total: ${total.toFixed(3)} ms (budget < ${BUDGET_MS} ms)`);
if (total >= BUDGET_MS) {
  console.error('FAIL: total exceeds budget');
  process.exit(1);
}
console.log('PASS');
