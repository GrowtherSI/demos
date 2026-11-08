# shared/

Code every demo uses, and the demos.growther.si listing. None of it is a
demo, which is why it lives here rather than beside them at the top level.

`chrome/`, `downloadKit/` and `worker/` are not packages: demos import them by
relative path (`../shared/...`), and `chrome/vite.mjs` sets Vite up for that.

## chrome/

The sticky Growther.si header (brand left with an **All demos** button back to
demos.growther.si, demo title centred; right, a
"How it was made" info button, Source and **Download C5**) and footer (the growther.si footer: links, socials,
tagline, legal line; collapsible on phones). Framework-agnostic from the demo's
side — one call mounts it:

```js
import { mountDemoChrome } from "../../shared/chrome";

mountDemoChrome({
  title: "Fibonacci Visualizer",
  story: "demo-fibonacci-vis", // source label for the download kit
  sourceUrl: "https://github.com/GrowtherSI/demos/tree/main/fibonacci-vis",
  about: {
    prompt,
    hours,
    costUsd,
    passedSteps,
    reworkSteps,
    tokens,
    inference,
    humanHours,
    humanRateUsd,
  }, // optional; see AboutModal.tsx
});
```

`about` drives the info button's modal: the prompt C5 was given, what the build
took (time, cost, steps passed and reworked, tokens), where the models ran, and
the human-developer comparison — whose hours and hourly rate are stated in the
copy so readers can see the assumption.

Its colours are scoped to `.gw-chrome`, so they never touch the demo's own
styles. The demo positions itself with `--gw-header-h` and `--gw-footer-h`,
which the chrome keeps current on `<html>`.

The listing passes `listing: true`, which leaves out the All demos button.

## seo/

What crawlers and LLMs fetch, generated rather than kept by hand. `vite.mjs`
is a Vite plugin that `chrome/vite.mjs` adds to every demo; it reads the
app's `index.html` (title, description, canonical, `og:title`),
`package.json` (`repository.directory`, for the Source links) and `README.md`,
and emits into `dist/`:

| File            | What it is                                                                           |
| --------------- | ------------------------------------------------------------------------------------ |
| `sitemap.xml`   | This page; on the listing, every demo too                                            |
| `robots.txt`    | Everyone allowed, the AI agents named, the sitemap(s), a pointer to `llms.txt`       |
| `llms.txt`      | The [llmstxt.org](https://llmstxt.org) map: what this is, where it runs, its source  |
| `llms-full.txt` | `llms.txt` plus the README, for a pipeline that fetches once                         |
| `<head>`        | A JSON-LD graph: WebApplication + SoftwareSourceCode (CollectionPage on the listing) |

The dev server serves the same files from memory, so `/llms.txt` on
`localhost:5173` is what deploys. `render.js` holds the pure renderers; the
Growther.si URLs in it are checked against the chrome's. A demo adds facts the
page does not state with `demoViteConfig({ seo: { app: { … } } })`; the
listing passes `{ demos, readme }`.

## home/

demos.growther.si: a static page that lists every demo, wearing the same
chrome. `home/demos.json` is the listing: slug, title, a description of up to
110 characters, and a 720×720 preview (shown at 240px) in `home/previews/`.
`demoCards.js` (a plugin in `vite.config.js`) renders it into `index.html` at build time, so the cards are
plain HTML. Its tests check
`demos.json` against the repository — every top-level directory with a
`wrangler.jsonc` must be listed, with a preview, linking to the subdomain its
Worker deploys to.

```bash
cd shared/home && npm install && npm run dev
```

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
