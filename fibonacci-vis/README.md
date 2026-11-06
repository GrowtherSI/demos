# Fibonacci Visualizer

**Live demo: <https://fibonacci-vis.demos.growther.si>**

An interactive 3D look at the Fibonacci sequence and the golden ratio, built with
[three.js](https://threejs.org). It computes exact Fibonacci numbers with
`BigInt`, shows F(k)/F(k−1) converging on φ, and draws three classic patterns:

| Mode                 | What you see                                                                | Animation                                                         |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Golden spiral**    | Squares of side F(k) tiled counter-clockwise, joined by quarter-circle arcs | Grows term by term, with a gentle sway                            |
| **Phyllotaxis**      | A sunflower head: point _i_ at radius √i, turned by the divergence angle    | Grows outward; drag the angle slider to see why 137.5° packs best |
| **Fibonacci sphere** | Points spread evenly over a sphere along a golden-angle spiral              | Grows, then rotates slowly                                        |

Four palettes, adjustable point size and rotation speed, orbit/zoom with mouse
or touch, and a sequence panel listing the last 40 terms.

## Run it

Requires Node.js 20.19 or later.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script            | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `npm run dev`     | Vite dev server with hot reload                                 |
| `npm test`        | Vitest with a 100% coverage floor: math, UI, modes, entry point |
| `npm run perf`    | Timing budget for the math behind one N update (< 200 ms)       |
| `npm run build`   | Production build into `dist/`                                   |
| `npm run preview` | Serve `dist/` locally                                           |
| `npm run cf:dev`  | Build, then run the production Worker locally (`wrangler dev`)  |
| `npm run deploy`  | Build and deploy to Cloudflare (maintainers)                    |

## How it is put together

```
src/
  fibonacci.js         pure math: no DOM, no three.js, no module state
  ui.js                DOM wiring, input validation, the sequence panel
  modeController.js    dispose-before-create lifecycle for the active mode
  main.js              WebGL probe, one renderer, the animation loop
  visualizations/      spiral, phyllotaxis, sphere (+ shared palettes)
tests/                 Vitest suites and the perf budget check
```

- **One renderer, never recreated.** Each visualization exports
  `create(scene, params)`, `update(dt)`, `setParams(params)` and `dispose()`.
  Parameter changes are coalesced into a single animation-frame update and
  applied in place; switching modes disposes the old module's geometries and
  materials before the next one is created. `tests/ui.test.js` checks both
  against a real `THREE.Scene`.
- **Instanced rendering.** Phyllotaxis and the sphere draw up to 20,000 points
  as a single `InstancedMesh`, so N changes are cheap.
- **Exact arithmetic.** `fibonacci(n)` uses iterative fast doubling over
  `BigInt`; the spiral is capped where square sizes stop being exact Numbers.
- **Graceful without WebGL.** The page probes for WebGL first and shows a
  fallback message; the sequence panel still works.
- **Accessible.** Keyboard-reachable controls with visible focus, a skip link,
  an `aria-live` region for validation errors, 44 px touch targets, and
  `prefers-reduced-motion` starts the animation paused.

### Input limits

| Context             | N means                  | Range           |
| ------------------- | ------------------------ | --------------- |
| Golden spiral       | number of squares        | 1–30            |
| Phyllotaxis, sphere | number of points         | 1–20,000        |
| Sequence panel      | terms F(0)…F(N) computed | capped at 1,000 |

Invalid input shows an inline message and keeps the last valid value. Each mode
remembers its own N.

## The Growther.si header and footer

The **How it was made** button opens the story of this demo's build: Growther.si
C5 produced it from a one-sentence prompt in under five hours, for $33.38.

The sticky header and footer come from [`../shared/chrome`](../shared/chrome),
which every demo in this repository shares, and are mounted with one call in
`src/main.js`. The **Download C5** button uses the same download kit as
growther.si: it fetches the current release from `/v1/version` (proxied by the
demo's Worker in [`../shared/worker`](../shared/worker)), matches your OS, and
either starts the download or offers launch notes.

If you fork this demo for your own use, delete the `mountDemoChrome(…)` call
and the `#gw-header` / `#gw-footer` placeholders in `index.html`; the
visualizer runs the same without them. The Growther.si name and logo are not
covered by the MIT License (see [NOTICE](../NOTICE)).

## Deployment

The demo deploys as a Cloudflare Worker with static assets
([`wrangler.jsonc`](wrangler.jsonc)) on the custom domain
`fibonacci-vis.demos.growther.si`. Static files are served directly from
`dist/` with the security headers in [`public/_headers`](public/_headers)
(a strict, self-only Content Security Policy); the Worker script runs only for
`/v1/*`.

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Made with
[Growther.si C5](https://growther.si).
