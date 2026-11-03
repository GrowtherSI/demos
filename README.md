# Growther.si Demos

Open-source demos built with [Growther.si C5](https://growther.si). Each
directory is a self-contained web app, deployed to its own subdomain of
`demos.growther.si`.

| Demo | Live | What it is |
| --- | --- | --- |
| [fibonacci-vis](fibonacci-vis) | [fibonacci-vis.demos.growther.si](https://fibonacci-vis.demos.growther.si) | Golden spiral, phyllotaxis and Fibonacci sphere in interactive 3D (three.js) |

## Layout

```
<demo>/              one app per directory: its own package.json, tests, wrangler.jsonc
shared/chrome/       the sticky Growther.si header and footer every demo mounts
shared/downloadKit/  the Download button's logic and modal — mirrored verbatim from growther.si
shared/worker/       the Worker every demo deploys with (static assets + /v1/version)
```

To run a demo, `cd` into it and follow its README — typically
`npm install && npm run dev`.

## Adding a demo

1. Create `<name>/` with its own `package.json` (add `react`, `react-dom` and
   `wrangler`), and a `vite.config.js` that merges `demoViteConfig()` from
   `../shared/chrome/vite.mjs`.
2. Put `<div id="gw-header"></div>` and `<div id="gw-footer"></div>` in
   `index.html`, call `mountDemoChrome({ title, story, sourceUrl })` from your
   entry module, and lay the app out between `--gw-header-h` and
   `--gw-footer-h`.
3. Copy `fibonacci-vis/wrangler.jsonc` and `fibonacci-vis/public/_headers`, and
   change the Worker `name` and the route to `<name>.demos.growther.si`.
4. Add the directory to the matrix in `.github/workflows/demos.yml` and to the
   table above.

## Contributing and security

Issues and pull requests are welcome. Please report security problems
privately — see [SECURITY.md](SECURITY.md).

## License

The demos are MIT-licensed — see [LICENSE](LICENSE). The Growther.si name and
logo, and Growther.si C5 itself, are not; see [NOTICE](NOTICE).
