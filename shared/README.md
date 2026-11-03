# shared/

Code every demo uses. Nothing here is a package: demos import it by relative
path (`../shared/...`), and `chrome/vite.mjs` sets Vite up for that.

## chrome/

The sticky Growther.si header (brand left, demo title centred; right, a
"How it was made" info button, Source and **Download C5**) and footer (the growther.si footer: links, socials,
tagline, legal line; collapsible on phones). Framework-agnostic from the demo's
side — one call mounts it:

```js
import { mountDemoChrome } from '../../shared/chrome';

mountDemoChrome({
  title: 'Fibonacci Visualizer',
  story: 'demo-fibonacci-vis', // source label for the download kit
  sourceUrl: 'https://github.com/GrowtherSI/demos/tree/main/fibonacci-vis',
  about: { prompt, hours, costUsd, passedSteps, reworkSteps, tokens,
           inference, humanHours, humanRateUsd }, // optional; see AboutModal.tsx
});
```

`about` drives the info button's modal: the prompt C5 was given, what the build
took (time, cost, steps passed and reworked, tokens), where the models ran, and
the human-developer comparison — whose hours and hourly rate are stated in the
copy so readers can see the assumption.

Its colours are scoped to `.gw-chrome`, so they never touch the demo's own
styles. The demo positions itself with `--gw-header-h` and `--gw-footer-h`,
which the chrome keeps current on `<html>`.

## downloadKit/

**Do not edit.** A byte-for-byte mirror of growther.si's shared download kit
(canonical copy: `growther-marketing/shared/downloadKit/`, also mirrored into
docs.growther.si), so every Download button behaves the same on every Growther
property. To check this copy is intact:

```bash
cd shared/downloadKit && shasum -a 256 -c MANIFEST.sha256
```

To update it, copy the canonical directory over this one and commit.

## worker/

The Worker every demo deploys with. Static assets are served directly; the
script handles only `GET /v1/version`, proxying growther.si's release endpoint
so the download kit can fetch it same-origin.
