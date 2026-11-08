# Growther.si Demos

OpenSource demos built with [Growther.si C5](https://growther.si). Each
top-level directory is a self-contained web app, deployed to its own subdomain
of `demos.growther.si` — browse them all at
[demos.growther.si](https://demos.growther.si).

| Demo                           | Live                                                                       | What it is                                                                   |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [fibonacci-vis](fibonacci-vis) | [fibonacci-vis.demos.growther.si](https://fibonacci-vis.demos.growther.si) | Golden spiral, phyllotaxis and Fibonacci sphere in interactive 3D (three.js) |

## Layout

```
<demo>/              one app per directory: its own package.json, tests, wrangler.jsonc
shared/chrome/       the sticky Growther.si header and footer every demo mounts
shared/downloadKit/  the Download button's logic and modal — mirrored verbatim from growther.si
shared/worker/       the Worker every demo deploys with (static assets + /v1/version)
shared/seo/          the Vite plugin that writes every site's sitemap.xml, robots.txt, llms.txt and JSON-LD
shared/home/         demos.growther.si itself: the listing of every demo
```

Only the top-level directories are demos; nothing in `shared/` is one, so you
can copy a demo's directory (plus `shared/chrome`, `shared/downloadKit` and
`shared/worker` if you keep the Growther.si chrome) without the rest.

To run a demo, `cd` into it and follow its README — typically
`npm install && npm run dev`.

## Adding a demo

1. Create `<name>/` with its own `package.json` (add `react`, `react-dom`,
   `wrangler`, `vitest` and `@vitest/coverage-v8`, with
   `"test": "vitest run --coverage"`), and a `vite.config.js` that merges
   `demoViteConfig()` from `../shared/chrome/vite.mjs` and sets a 100% coverage
   threshold on `src/` (copy `fibonacci-vis/vite.config.js`).
2. Put `<div id="gw-header"></div>` and `<div id="gw-footer"></div>` in
   `index.html`, call `mountDemoChrome({ title, story, sourceUrl })` from your
   entry module, and lay the app out between `--gw-header-h` and
   `--gw-footer-h`.
   Give `index.html` a `<title>`, a `<meta name="description">`, a
   `<link rel="canonical">` to `https://<name>.demos.growther.si/` and an
   `og:title` with the short name, and `package.json` a
   `repository.directory`: the build derives the demo's `sitemap.xml`,
   `robots.txt`, `llms.txt`, `llms-full.txt` (with the README) and JSON-LD from
   them (`shared/seo`), and CI's `check:seo` fails the build without them.
   Pass `demoViteConfig({ seo: { app: { applicationCategory, … } } })` for the
   facts only the demo knows.
3. Copy `fibonacci-vis/wrangler.jsonc` and `fibonacci-vis/public/_headers`, and
   change the Worker `name` and the route to `<name>.demos.growther.si`.
4. Add the directory to the matrix in `.github/workflows/demos.yml` and to the
   table above.
5. List it on demos.growther.si: add an entry to `shared/home/demos.json` and
   its square preview image (720×720 WebP) to `shared/home/previews/`. The
   listing's tests fail until every demo is there.

## Quality gate

The repository root holds the tooling every app shares — the same standards as
the other Growther.si apps: ESLint (flat config, `typescript-eslint` for the
TSX), Prettier, `tsc` for `shared/`, husky hooks, and Vitest with a **100%
coverage floor** on every app and on `shared/`. Set it up once:

```bash
npm install              # root tooling; installs the git hooks
npm run apps:install     # npm ci in every app
```

| Script                       | What it does                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `npm run lint`               | ESLint (zero warnings), `tsc`, and the download kit's manifest check             |
| `npm test`                   | The `shared/` suite, then every app's suite — each at 100% coverage              |
| `npm run format`             | Prettier, repository-wide (`shared/downloadKit` excluded: it is a mirror)        |
| `npm run check:test-quality` | Fails on `@ts-nocheck` tests or tests with only existence assertions             |
| `npm run check:seo <dist>`   | After a build: the sitemap, robots.txt, llms.txt and JSON-LD are there and agree |

**pre-commit** checks staged `package.json` files against their lockfiles,
runs Prettier on staged files, then `npm run lint`. **pre-push** checks every
lockfile, the test-quality guard, `npm test` and `npm run lint`. CI runs the
same. Never bypass the hooks (`--no-verify`, `HUSKY=0`): fix what they catch.
Coverage thresholds only ever go up.

The apps are found automatically (`scripts/apps.mjs`: every top-level directory
with a `wrangler.jsonc`, plus `shared/home`), so a new demo joins `npm test`
without registering it.

## Contributing and security

Issues and pull requests are welcome. Please report security problems
privately — see [SECURITY.md](SECURITY.md).

## License

The demos are MIT-licensed — see [LICENSE](LICENSE). The Growther.si name and
logo, and Growther.si C5 itself, are not; see [NOTICE](NOTICE).
