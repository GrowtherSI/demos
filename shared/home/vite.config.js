import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import { demoViteConfig } from '../chrome/vite.mjs';

const MANIFEST = fileURLToPath(new URL('./demos.json', import.meta.url));
const REPO = 'https://github.com/GrowtherSI/demos/tree/main';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One card per demos.json entry. The image src is root-relative, so Vite
    fingerprints it into /assets like any other asset in index.html. */
export function renderCards(demos) {
  return demos
    .map((d, i) => {
      const url = `https://${d.slug}.demos.growther.si/`;
      return `<li class="demo">
          <img class="demo-preview" src="/${esc(d.preview)}" alt="" width="720" height="720"${
            i > 3 ? ' loading="lazy"' : ''
          } decoding="async" />
          <div class="demo-body">
            <h2 class="demo-title"><a class="demo-link" href="${url}">${esc(d.title)}</a></h2>
            <p class="demo-desc">${esc(d.description)}</p>
            <p class="demo-meta">
              <a class="demo-source" href="${REPO}/${esc(d.slug)}" target="_blank" rel="noopener noreferrer"
                aria-label="${esc(d.title)} source on GitHub (opens in a new tab)">Source</a>
            </p>
          </div>
        </li>`;
    })
    .join('\n        ');
}

/** Fills <!--demos--> in index.html from demos.json, and reloads the dev page when it changes. */
function demoCards() {
  return {
    name: 'demo-cards',
    configureServer(server) {
      server.watcher.add(MANIFEST);
      server.watcher.on('change', (file) => {
        if (file === MANIFEST) server.ws.send({ type: 'full-reload' });
      });
    },
    transformIndexHtml: {
      // 'pre', so Vite's own HTML pass then picks up the cards' image srcs.
      order: 'pre',
      handler(html) {
        const demos = JSON.parse(readFileSync(MANIFEST, 'utf8'));
        return html.replace('<!--demos-->', renderCards(demos));
      },
    },
  };
}

export default mergeConfig(
  demoViteConfig(),
  defineConfig({
    plugins: [demoCards()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react')) return 'react';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'node',
    },
  }),
);
