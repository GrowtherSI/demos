// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kit = vi.hoisted(() => ({
  configureDownloadKit: vi.fn(),
  warmRelease: vi.fn(async () => null),
  gateProps: [] as unknown[],
}));
vi.mock("../downloadKit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../downloadKit")>()),
  configureDownloadKit: kit.configureDownloadKit,
  warmRelease: kit.warmRelease,
  DownloadGate: (props: unknown) => {
    kit.gateProps.push(props);
    return <div data-testid="gate" />;
  },
}));

const { mountDemoChrome } = await import("./index");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  kit.configureDownloadKit.mockClear();
  kit.warmRelease.mockClear();
  kit.gateProps.length = 0;
  document.body.innerHTML = "";
});

describe("mountDemoChrome", () => {
  it("renders into the page's own #gw-header / #gw-footer slots", async () => {
    document.body.innerHTML =
      '<a href="#main">Skip</a><div id="gw-header"></div><main id="main"></main><div id="gw-footer"></div>';

    await act(async () =>
      mountDemoChrome({
        title: "Fibonacci Visualizer",
        story: "demo-fibonacci-vis",
      }),
    );

    const ids = [...document.body.children].map((el) => el.id || el.tagName);
    // the page's order is kept (skip link first); only the gate slot is added
    expect(ids).toEqual([
      "A",
      "gw-header",
      "main",
      "gw-footer",
      "gw-download-gate",
    ]);
    const header = document.getElementById("gw-header")!;
    expect(header.classList.contains("gw-chrome")).toBe(true);
    expect(header.querySelector("h1")!.textContent).toBe(
      "Fibonacci Visualizer",
    );
    expect(
      document.getElementById("gw-footer")!.querySelector("footer"),
    ).toBeInstanceOf(HTMLElement);
  });

  it("creates the slots when the page has none: header first, footer last", async () => {
    document.body.innerHTML = '<main id="app"></main>';

    await act(async () =>
      mountDemoChrome({ title: "T", story: "s", listing: true }),
    );

    const ids = [...document.body.children].map((el) => el.id);
    expect(ids).toEqual(["gw-header", "app", "gw-footer", "gw-download-gate"]);
    for (const id of ["gw-header", "gw-footer", "gw-download-gate"]) {
      expect(document.getElementById(id)!.className).toBe("gw-chrome");
    }
    expect(document.querySelector('a[aria-label="All demos"]')).toBeNull();
  });

  it("points the download kit at the same-origin /v1/version and warms it", async () => {
    await act(async () => mountDemoChrome({ title: "T", story: "s" }));

    expect(kit.configureDownloadKit).toHaveBeenCalledWith({
      versionUrl: "/v1/version",
    });
    expect(kit.warmRelease).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector('[data-testid="gate"]')!.parentElement!.id,
    ).toBe("gw-download-gate");
    expect(kit.gateProps[0]).toMatchObject({ siteUrl: "https://growther.si" });
  });

  it("accepts another versionUrl", async () => {
    await act(async () =>
      mountDemoChrome({
        title: "T",
        story: "s",
        versionUrl: "https://x.test/v",
      }),
    );

    expect(kit.configureDownloadKit).toHaveBeenCalledWith({
      versionUrl: "https://x.test/v",
    });
  });
});
