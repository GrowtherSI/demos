/**
 * The Worker every demo deploys with: static assets, plus one API route.
 *
 * GET /v1/version — the C5 release the Download button offers. The shared
 * download kit fetches it same-origin (that is its contract on growther.si and
 * docs.growther.si too), so this proxies growther.si's endpoint rather than
 * asking that Worker for a CORS grant per demo. The body passes through as-is:
 * the kit validates it in the browser (normalizeBuild, isSafeAssetUrl), the same
 * code that validates it on growther.si.
 *
 * Everything else is a static asset. wrangler.jsonc routes only /v1/* here
 * (run_worker_first), so assets never pay for a Worker invocation, and their
 * security headers come from public/_headers.
 */
const UPSTREAM = "https://growther.si/v1/version";
const UPSTREAM_TIMEOUT_MS = 5000;

const API_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Short edge cache, always revalidated by the browser — the kit asks with
  // cache: "no-cache" on click so a fresh release is picked up within a minute.
  "cache-control": "public, max-age=0, must-revalidate, s-maxage=30",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

function json(status, body, extra = {}) {
  return new Response(body, { status, headers: { ...API_HEADERS, ...extra } });
}

async function version(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(405, '{"error":"method not allowed"}', { allow: "GET, HEAD" });
  }
  try {
    const upstream = await fetch(UPSTREAM, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cf: { cacheTtl: 30, cacheEverything: true },
    });
    if (!upstream.ok) return json(502, '{"error":"upstream unavailable"}');
    return json(200, request.method === "HEAD" ? null : upstream.body);
  } catch {
    // The kit treats any failure as "no catalog" and opens the newsletter
    // modal instead of downloading — never an error at the visitor.
    return json(502, '{"error":"upstream unavailable"}');
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/v1/version") return version(request);
    if (pathname.startsWith("/v1/")) return json(404, '{"error":"not found"}');
    return env.ASSETS.fetch(request);
  },
};
