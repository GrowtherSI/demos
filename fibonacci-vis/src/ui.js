import {
  fibonacciSequence,
  ratios,
  convergenceError,
  validateInteger,
  formatBigInt,
  GOLDEN_ANGLE_DEG,
  LIMITS,
} from './fibonacci.js';

/** Upper bound for N in each mode (the spiral limit is the number of squares). */
export const MODE_LIMITS = Object.freeze({
  spiral: LIMITS.MAX_SPIRAL_TERMS,
  phyllotaxis: LIMITS.MAX_POINTS,
  sphere: LIMITS.MAX_POINTS,
});

const DEFAULT_N = Object.freeze({ spiral: 12, phyllotaxis: 2000, sphere: 1500 });
const INFO_TERMS_SHOWN = 40; // list length rendered in the DOM
const DIGITS = 24;

const $ = (id) => document.getElementById(id);

/**
 * Wire the DOM controls. Calls `onChange(partialParams, { modeChanged })` whenever
 * a valid change happens. Returns the initial params.
 */
export function initUI({ onChange }) {
  const el = {
    form: $('controls'),
    toggle: $('panelToggle'),
    mode: $('mode'),
    nInput: $('nInput'),
    nRange: $('nRange'),
    nLabel: $('nLabel'),
    validation: $('validation'),
    angle: $('angleInput'),
    angleValue: $('angleValue'),
    resetAngle: $('resetAngle'),
    palette: $('palette'),
    pointSize: $('pointSize'),
    rotationSpeed: $('rotationSpeed'),
    play: $('playBtn'),
    termCount: $('termCount'),
    ratio: $('ratio'),
    error: $('error'),
    terms: $('terms'),
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lastValidN = { ...DEFAULT_N };

  const state = {
    mode: el.mode.value,
    n: DEFAULT_N[el.mode.value],
    angleDeg: GOLDEN_ANGLE_DEG,
    palette: el.palette.value,
    pointSize: Number(el.pointSize.value),
    rotationSpeed: Number(el.rotationSpeed.value),
    playing: !reducedMotion.matches,
  };

  function setPlaying(playing) {
    state.playing = playing;
    el.play.setAttribute('aria-pressed', String(playing));
    el.play.textContent = playing ? 'Pause' : 'Play';
  }

  function syncNControls() {
    const max = MODE_LIMITS[state.mode];
    el.nInput.max = String(max);
    el.nRange.max = String(max);
    el.nInput.value = String(state.n);
    el.nRange.value = String(state.n);
    el.nLabel.textContent = state.mode === 'spiral' ? 'N (squares)' : 'N (points)';
    el.angle.disabled = state.mode !== 'phyllotaxis';
    el.resetAngle.disabled = state.mode !== 'phyllotaxis';
  }

  function renderInfo() {
    const count = Math.max(2, Math.min(LIMITS.MAX_TERMS, state.n + 1));
    const seq = fibonacciSequence(count);
    const k = Math.max(1, Math.min(count - 1, LIMITS.MAX_TERMS - 1));
    const r = ratios(k);
    el.termCount.textContent = `F(0)…F(${count - 1})`;
    el.ratio.textContent = r[k - 1].toPrecision(15);
    el.error.textContent = convergenceError(k).toExponential(3);
    const frag = document.createDocumentFragment();
    const shown = Math.min(INFO_TERMS_SHOWN, seq.length);
    for (let i = seq.length - shown; i < seq.length; i += 1) {
      const li = document.createElement('li');
      li.value = i;
      li.textContent = formatBigInt(seq[i], DIGITS);
      frag.appendChild(li);
    }
    el.terms.replaceChildren(frag);
  }

  function showError(msg) {
    el.validation.textContent = msg;
    el.nInput.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function commitN(raw, source) {
    const res = validateInteger(raw, { min: 1, max: MODE_LIMITS[state.mode], name: 'N' });
    if (!res.ok) {
      showError(res.error);
      if (source === 'range') el.nRange.value = String(state.n);
      return; // keep the last valid value
    }
    showError('');
    state.n = res.value;
    lastValidN[state.mode] = res.value;
    if (source !== 'number') el.nInput.value = String(res.value);
    if (source !== 'range') el.nRange.value = String(res.value);
    renderInfo();
    onChange({ n: state.n }, { modeChanged: false });
  }

  function setAngle(deg) {
    state.angleDeg = deg;
    el.angle.value = String(deg);
    el.angleValue.textContent = `${deg.toFixed(2)}°`;
  }

  // Panel toggle (drawer at <=768px)
  el.toggle.addEventListener('click', () => {
    const open = el.toggle.getAttribute('aria-expanded') !== 'true';
    el.toggle.setAttribute('aria-expanded', String(open));
    el.form.classList.toggle('is-open', open);
    if (open) el.mode.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.toggle.getAttribute('aria-expanded') === 'true') {
      el.toggle.setAttribute('aria-expanded', 'false');
      el.form.classList.remove('is-open');
      el.toggle.focus();
    }
  });

  el.form.addEventListener('submit', (e) => e.preventDefault());

  el.mode.addEventListener('change', () => {
    state.mode = el.mode.value;
    state.n = lastValidN[state.mode];
    showError('');
    syncNControls();
    renderInfo();
    onChange({ mode: state.mode, n: state.n }, { modeChanged: true });
  });

  el.nInput.addEventListener('input', () => commitN(el.nInput.value, 'number'));
  el.nRange.addEventListener('input', () => commitN(el.nRange.value, 'range'));

  // Live angle update: only calls setParams on the active module (see main.js)
  el.angle.addEventListener('input', () => {
    setAngle(Number(el.angle.value));
    onChange({ angleDeg: state.angleDeg }, { modeChanged: false });
  });
  el.resetAngle.addEventListener('click', () => {
    setAngle(GOLDEN_ANGLE_DEG);
    onChange({ angleDeg: state.angleDeg }, { modeChanged: false });
  });

  el.palette.addEventListener('change', () => {
    state.palette = el.palette.value;
    onChange({ palette: state.palette }, { modeChanged: false });
  });
  el.pointSize.addEventListener('input', () => {
    state.pointSize = Number(el.pointSize.value);
    onChange({ pointSize: state.pointSize }, { modeChanged: false });
  });
  el.rotationSpeed.addEventListener('input', () => {
    state.rotationSpeed = Number(el.rotationSpeed.value);
    onChange({ rotationSpeed: state.rotationSpeed }, { modeChanged: false });
  });
  el.play.addEventListener('click', () => {
    setPlaying(!state.playing);
    onChange({ playing: state.playing }, { modeChanged: false });
  });

  reducedMotion.addEventListener('change', (e) => {
    if (e.matches && state.playing) {
      setPlaying(false);
      onChange({ playing: false }, { modeChanged: false });
    }
  });

  setAngle(GOLDEN_ANGLE_DEG);
  setPlaying(state.playing);
  syncNControls();
  renderInfo();

  return { ...state };
}
