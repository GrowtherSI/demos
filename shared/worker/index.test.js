import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.js";

const UPSTREAM = "https://growther.si/v1/version";
const env = { ASSETS: { fetch: vi.fn(async () => new Response("asset")) } };

const call = (path, init) =>
  worker.fetch(new Request(`https://x.demos.growther.si${path}`, init), env);

afterEach(() => {
  vi.unstubAllGlobals();
  env.ASSETS.fetch.mockClear();
});

describe("GET /v1/version", () => {
  it("proxies growther.si's release catalog with API headers", async () => {
    const fetchMock = vi.fn(async () => new Response('{"version":"3.1.0"}'));
    vi.stubGlobal("fetch", fetchMock);

    const res = await call("/v1/version");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"version":"3.1.0"}');
    expect(res.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toContain("s-maxage=30");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(UPSTREAM);
    expect(init.headers).toEqual({ accept: "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.cf).toEqual({ cacheTtl: 30, cacheEverything: true });
  });

  it("answers HEAD with headers and no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"v":1}')),
    );

    const res = await call("/v1/version", { method: "HEAD" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.text()).toBe("");
  });

  it("refuses other methods with 405 and an Allow header", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await call("/v1/version", { method: "POST" });

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    expect(await res.json()).toEqual({ error: "method not allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the upstream answers with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );

    const res = await call("/v1/version");

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream unavailable" });
  });

  it("returns 502 when the upstream cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );

    const res = await call("/v1/version");

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream unavailable" });
  });
});

describe("routing", () => {
  it("404s any other /v1/ route without touching the assets", async () => {
    const res = await call("/v1/other");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("serves everything else from static assets", async () => {
    const req = new Request("https://x.demos.growther.si/index.html");

    const res = await worker.fetch(req, env);

    expect(await res.text()).toBe("asset");
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
  });
});
