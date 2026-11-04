/**
 * Mode controller: owns the lifecycle of the active visualization module.
 *
 * It holds no reference to the renderer, the camera or the DOM, so the exact
 * mode-switching logic that main.js runs in the browser can also run under
 * Vitest in Node (tests/ui.test.js) against a real THREE.Scene.
 *
 * Rules enforced here:
 * - Switching mode always calls `dispose()` on the previous module BEFORE
 *   `create()` on the next one, so GPU geometries and materials are freed.
 * - A non-mode change (N, angle, palette, …) goes through `setParams()` when
 *   the module has it, so nothing is recreated (the renderer never is).
 */

/**
 * @typedef {object} VisualizationModule
 * @property {(scene: object, params: object) => void} create
 * @property {(dt: number) => void} update
 * @property {() => void} dispose
 * @property {(params: object) => void} [setParams]
 * @property {() => number} [fitRadius]
 */

/**
 * @param {object} options
 * @param {object} options.scene              THREE.Scene (or any object with add/remove)
 * @param {Record<string, VisualizationModule>} options.modules  mode name -> module
 * @param {object} options.params             initial params, must include `mode`
 * @param {(module: VisualizationModule, mode: string) => void} [options.onActivate]
 * @returns {{
 *   activate: (mode: string) => void,
 *   apply: (change: object, meta?: { modeChanged?: boolean }) => 'activated' | 'updated' | 'recreated',
 *   dispose: () => void,
 *   readonly active: VisualizationModule | null,
 *   readonly mode: string | null,
 *   readonly params: object,
 * }}
 */
export function createModeController({ scene, modules, params, onActivate }) {
  if (!scene || !modules || !params) {
    throw new TypeError('createModeController: scene, modules and params are required');
  }
  let current = { ...params };
  let active = null;
  let activeMode = null;

  function activate(mode) {
    const next = modules[mode];
    if (!next) throw new RangeError(`Unknown visualization mode: ${mode}`);
    if (active) active.dispose(); // free GPU resources before creating the next one
    active = next;
    activeMode = mode;
    current = { ...current, mode };
    active.create(scene, current);
    if (onActivate) onActivate(active, mode);
  }

  function apply(change, { modeChanged = false } = {}) {
    current = { ...current, ...change };
    if (!active || (modeChanged && current.mode !== activeMode)) {
      activate(current.mode);
      return 'activated';
    }
    if (typeof active.setParams === 'function') {
      active.setParams(change); // in-place update; nothing is recreated
      return 'updated';
    }
    active.dispose();
    active.create(scene, current);
    return 'recreated';
  }

  function dispose() {
    if (active) active.dispose();
    active = null;
    activeMode = null;
  }

  return {
    activate,
    apply,
    dispose,
    get active() {
      return active;
    },
    get mode() {
      return activeMode;
    },
    get params() {
      return { ...current };
    },
  };
}
