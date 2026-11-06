import { describe, expect, it, vi } from "vitest";

vi.mock("../../chrome", () => ({ mountDemoChrome: vi.fn() }));
vi.mock("../src/home.css", () => ({}));

describe("src/main.js", () => {
  it("mounts the chrome as the listing: no All demos button back to itself", async () => {
    await import("../src/main.js");
    const { mountDemoChrome } = await import("../../chrome");
    expect(mountDemoChrome).toHaveBeenCalledTimes(1);
    expect(mountDemoChrome).toHaveBeenCalledWith({
      title: "OpenSource Demos",
      story: "demos-home",
      sourceUrl: "https://github.com/GrowtherSI/demos",
      listing: true,
    });
  });
});
