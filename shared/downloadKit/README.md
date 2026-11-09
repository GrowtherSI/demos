# Shared download kit — v1.11.0

**Read this before changing anything in this directory.**

This directory is **one component with two deployments**. It exists in two
repositories and the two copies are **byte-identical**:

| Role          | Path                                     |
| ------------- | ---------------------------------------- |
| **Canonical** | `growther-marketing/shared/downloadKit/` |
| **Mirror**    | `growther-docs/shared/downloadKit/`      |

Edit the canonical copy. Never edit the mirror — it is generated, and a hand
edit there is reverted by the next sync (and fails CI before that).

```bash
# in growther-marketing
npm run sync:download-kit          # canonical -> mirror, re-stamps MANIFEST.sha256
npm run sync:download-kit -- --check   # exit 1 if the two working trees differ

# in EITHER repo (also runs inside `npm run lint` and in CI)
npm run check:download-kit         # exit 1 if this repo's copy != its MANIFEST.sha256
```

## What it does

A Download button anywhere on either site calls one function:

```ts
requestDownload({ story: "fleet" }); // -> "download" | "modal"
```

It reads the C5 release catalog through that site's Worker (`GET /v1/version`),
matches the visitor's OS and architecture, and either starts that build or —
when there is nothing for them — announces a miss on `window`, which the
`<DownloadGate/>` mounted at each app's root turns into the newsletter modal
(launch notes by email, plus 𝕏 [@GrowtherAI](https://x.com/GrowtherAI)).

| File                           | Role                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release.ts`                   | Pure logic: validate the catalog, detect the platform, pick an asset. No DOM, no React, **no imports** — the Workers use it too.                                                                                                              |
| `client.ts`                    | Browser glue: one catalog fetch per page, `requestDownload`, the miss event.                                                                                                                                                                  |
| `DownloadModal.tsx`            | The modal itself. Newsletter POST and Turnstile are **injected**, never imported — that is what lets one component serve two origins.                                                                                                         |
| `DownloadGate.tsx`             | Mount once per app; renders nothing until a miss.                                                                                                                                                                                             |
| `Socials.tsx`                  | The one list of Growther.si's social accounts + the component that renders them at any scale. Used by the modal, BOTH footers, and the marketing About tab.                                                                                   |
| `guides.ts` + `GuideLinks.tsx` | The growther.si guides (SEO landing pages) as one list (data, no JSX) + `GuideLinks`, the short "Guides:" footer row docs.growther.si and demos.growther.si carry. growther.si reads its own richer table; a test there pins this list to it. |
| `turnstile.ts`                 | The (public) site-key loader both sites' forms use.                                                                                                                                                                                           |
| `VERSION.ts`                   | `DOWNLOAD_KIT_VERSION` + the changelog. Bump on every change.                                                                                                                                                                                 |
| `MANIFEST.sha256`              | Generated. The machine half of the pairing contract.                                                                                                                                                                                          |

## Rules for changing it

1. **Edit the canonical copy, then run `npm run sync:download-kit`.** Commit
   both repos in the same sitting; a synced mirror that is not committed is
   drift waiting to happen.
2. **Bump `DOWNLOAD_KIT_VERSION`** in `VERSION.ts` and add a changelog line.
3. **Keep the files import-free of their hosts.** Nothing here may import from
   `src/`, from a repo-specific path, or from anything outside this directory
   except `react`. If you need something from the site, take it as a prop or a
   config field — see `NewsletterAdapter` and `configureDownloadKit`.
4. **Files must be prettier-clean before they are committed.** growther-docs
   runs `prettier --write` on staged files, so an unformatted mirror file would
   be silently reformatted at commit time and the two copies would diverge in
   the same commit that added them. `npm run check:download-kit` catches that,
   but formatting first is how you avoid the round trip.
5. **Both suites must pass**, in both repos. The kit's own tests
   (`release.test.ts`, `client.test.ts`) run in each — that is deliberate, and
   it is why they carry no repo-specific imports either.
6. **Do not let the two Workers and this code drift on the wire shape.** Each
   repo has a seam test that feeds its real Worker response into this real
   client (`growther-marketing/src/lib/versionSeam.test.ts`,
   `growther-docs/src/test/versionSeam.test.ts`). They exist because both halves
   were once unit-tested against hand-written fixtures of _different_ shapes,
   both suites passed, and every Download button on both sites was broken.

## Wiring a new site into it

```ts
// once, at app start
configureDownloadKit({ versionUrl: "/v1/version", track });
void warmRelease();

// once, at the app root
<DownloadGate newsletter={adapter} siteUrl="https://growther.si" logoSrc="/logo.png" />

// every button
<button onClick={() => void requestDownload({ story: "…" })}>Download C5</button>
```

The host supplies three things and nothing else: where `/v1/version` lives, an
analytics sink, and a newsletter adapter (omit it and the modal offers links
instead of a form). That Worker must serve **one flattened channel** —
`{version, channel, releasedAt, assets[]}` — validated with `normalizeCatalog`,
not the channel-keyed catalog the release pipeline publishes.
