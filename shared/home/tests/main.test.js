import { describe, expect, it, vi } from "vitest";

vi.mock("../../chrome", () => ({ mountDemoChrome: vi.fn() }));
vi.mock("../src/home.css", () => ({}));
vi.mock("../src/stir/background.js", () => ({ mountStirBackground: vi.fn() }));

describe("src/main.js", () => {
  it("mounts the chrome as the listing (no All demos button back to itself), then the background", async () => {
    await import("../src/main.js");
    const { mountDemoChrome } = await import("../../chrome");
    expect(mountDemoChrome).toHaveBeenCalledTimes(1);
    expect(mountDemoChrome).toHaveBeenCalledWith({
      title: "OpenSource Demos",
      story: "demos-home",
      sourceUrl: "https://github.com/GrowtherSI/demos",
      listing: true,
    });
    const { mountStirBackground } = await import("../src/stir/background.js");
    expect(mountStirBackground).toHaveBeenCalledTimes(1);
    expect(mountStirBackground).toHaveBeenCalledWith();
    expect(mountStirBackground.mock.invocationCallOrder[0]).toBeGreaterThan(
      mountDemoChrome.mock.invocationCallOrder[0],
    );
  });
});
