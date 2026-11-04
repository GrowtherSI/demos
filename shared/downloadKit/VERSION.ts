/**
 * ── SHARED DOWNLOAD KIT ── v1.10.5 ────────────────────────────────────────────
 * CANONICAL: growther-marketing/shared/downloadKit/    (edit here)
 * MIRROR:    growther-docs/shared/downloadKit/         (never edit — generated)
 * PAIRED WITH: the mirror above. These two directories are ONE component with
 *              two deployments; a change to either that is not a change to both
 *              is a bug. See ./README.md before touching anything here.
 * SYNC:  npm run sync:download-kit          (in growther-marketing)
 * CHECK: npm run check:download-kit         (in EITHER repo; runs in lint + CI)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The version below is the human-readable half of the pairing contract; the
 * machine half is MANIFEST.sha256, which both repos verify in lint and in CI.
 *
 * BUMP IT whenever anything in this directory changes, so a person diffing two
 * checkouts can tell "same code" from "same shape, different behaviour" without
 * hashing files. The manifest catches drift between the two copies; the version
 * catches a copy that is simply OLD — a stale branch, an unmerged PR, a repo
 * someone forgot to sync.
 *
 *   MAJOR  the kit's contract with its host changed (a new required adapter
 *          field, a renamed export, a different event name). Both sites need
 *          code changes to keep working.
 *   MINOR  new capability, hosts keep working untouched.
 *   PATCH  fix or copy change, no contract movement.
 *
 * CHANGELOG (newest first — keep it short; git carries the detail):
 *   1.10.5  Updated asset hosts and test URLs to growther.si.
 *  1.10.4  Updated default siteUrl to https://growther.si and added growther.si to ASSET_HOSTS.
 *  1.10.3  Update text name to Growther.si across social aria-labels and logo alt text.
 *  1.10.2  Updated release repository links to GrowtherSI/release.
 *  1.10.1  Socials.tsx: updated Instagram, YouTube, LinkedIn, and GitHub
 *          handles to GrowtherSI (X.com stays @GrowtherAI).
 *  1.10.0  downloadDetailsFor() — the chosen file AND the hash/size/sidecar
 *          describing THAT file, one decision instead of two. requestDownload
 *          uses it; growther-docs' build-time download table uses it too, in
 *          place of the private copy of the catalog shape that kept it linking
 *          the archive after macOS moved to the signed .pkg.
 *          requestDownload also takes an `arch` alongside `os`, for a surface
 *          that NAMES the build it offers (that same table, one row per triple)
 *          and must not have detection overrule it; currentPlatform and
 *          resolveCurrentDownload take the same second argument.
 *   1.9.0  macOS downloads the SIGNED .pkg (Developer ID Installer, notarized,
 *          stapled) and never a wrong-arch one; ReleaseAsset gains
 *          installer{Url,Filename,Sha256,SizeBytes} and the card verifies it
 *          with pkgutil --check-signature. Other platforms keep the zip.
 *   1.8.0  The card leads with ONE 'run it' line (macOS/Linux) or plain words
 *          (Windows); hash + checks fold under an optional disclosure.
 *          DownloadStartedDetail gains `run` and `verify`; `steps` stays.
 *   1.7.0  A click REVALIDATES the catalog (cache:"no-cache", cached copy as
 *          fallback); warm() reuses for 60 s; a tab re-warms on becoming
 *          visible. No more "refresh to see the new version".
 *   1.6.1  Download card: the numbered steps scroll inside the panel and keep
 *          their Copy button (grid items no longer widen past the card)
 *   1.6.0  The download is a ZIP on every platform (icon inside on macOS);
 *          ReleaseAsset.binaryEntry names the executable in it, and the
 *          card's steps verify → extract → run
 *   1.5.0  Raw binary preferred on EVERY platform (was Windows-only);
 *          postDownloadSteps() gives the unlock lines the sites render
 *   1.4.0  A catalog asset may carry a RAW executable beside its archive
 *          (binaryUrl/binaryFilename/binarySha256/binarySizeBytes), validated
 *          to the same rules. Windows downloads the .exe directly — the icon is
 *          inside the PE and there is no exec bit to lose; macOS/Linux keep the
 *          archive, since a browser drops the exec bit on a bare binary and tar
 *          preserves it. downloadTargetFor() is that rule, exported and tested.
 *   1.3.1  Socials.tsx: center the last pill across columns in grid layout
 *          when the pill count is odd; GitHub handle set to GrowtherAI.
 *   1.3.0  Socials.tsx: added GitHub (https://github.com/GrowtherSI/release)
 *          to SOCIALS after LinkedIn.
 *   1.2.0  SocialLinks gains layout="grid": equal columns, as many as fit.
 *          "row" wrapping let the LABEL decide the layout — at scale 4 the
 *          491px chips needed 1000px for two and the container had 975, so
 *          only the shortest handle ever shared a row and the About tab came
 *          out ragged instead of two-up.
 *   1.1.0  Socials.tsx: the one list of where Growther.ai is off Growther.ai
 *          (𝕏, Instagram, YouTube, LinkedIn) plus the component that renders
 *          it at any scale. Four surfaces across both repos show these links —
 *          the newsletter modal, both footers, and the marketing About tab —
 *          and they must not be four hand-maintained copies. The modal's lone
 *          𝕏 chip became the full row; X_URL still exports from here.
 *   1.0.0  First shared version. Download buttons on growther.ai and
 *          docs.growther.ai resolve the visitor's OS + arch against the
 *          published C5 release and either start that build or open the
 *          newsletter modal (with the 𝕏 link) when there is nothing to give.
 */
export const DOWNLOAD_KIT_VERSION = "1.10.5";

/** Where the canonical copy lives, for anything that wants to say so out loud. */
export const DOWNLOAD_KIT_CANONICAL = "growther-marketing/shared/downloadKit/";
