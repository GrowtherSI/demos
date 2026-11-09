// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const requestDownload = vi.fn(async () => "download" as const);
vi.mock("../downloadKit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../downloadKit")>()),
  requestDownload: (...args: unknown[]) => requestDownload(...(args as [])),
}));

const { DemoFooter, DemoHeader, DEMOS_URL, DOCS_URL, SITE_URL } =
  await import("./DemoChrome");

/** jsdom has no ResizeObserver; record each one so a test can fire it. */
const observers: { cb: () => void; disconnect: ReturnType<typeof vi.fn> }[] =
  [];
class FakeResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(cb: () => void) {
    observers.push({ cb, disconnect: this.disconnect });
  }
}

const ABOUT = {
  prompt: "Build it.",
  hours: 5,
  costUsd: 33.38,
  passedSteps: 204,
  reworkSteps: 22,
  tokens: "1.1M",
  inference: [{ where: "Cloud" as const, via: "Anthropic API" }],
  humanHours: 4,
  humanRateUsd: 50,
};

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  requestDownload.mockClear();
  document.documentElement.removeAttribute("style");
});

describe("DemoHeader", () => {
  it("shows the title as the page heading, the brand and the way back to all demos", () => {
    render(<DemoHeader title="Fibonacci Visualizer" story="demo-x" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Fibonacci Visualizer" }),
    ).toBeInstanceOf(HTMLHeadingElement);
    expect(
      screen
        .getByRole("link", { name: "Growther.si home" })
        .getAttribute("href"),
    ).toBe(SITE_URL);
    expect(
      screen.getByRole("link", { name: "All demos" }).getAttribute("href"),
    ).toBe(DEMOS_URL);
  });

  it("leaves out All demos on the listing itself", () => {
    render(<DemoHeader title="OpenSource Demos" story="home" listing />);

    expect(screen.queryByRole("link", { name: "All demos" })).toBeNull();
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("aria-label")),
    ).toEqual(["Growther.si home", "Download C5"]);
  });

  it("shows Source and the info button only when given a sourceUrl and about", () => {
    const { rerender } = render(<DemoHeader title="T" story="s" />);
    expect(screen.queryByRole("link", { name: /Source code/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "How this demo was made" }),
    ).toBeNull();

    rerender(
      <DemoHeader
        title="T"
        story="s"
        sourceUrl="https://github.com/x"
        about={ABOUT}
      />,
    );

    const source = screen.getByRole("link", {
      name: "Source code on GitHub (opens in a new tab)",
    });
    expect(source.getAttribute("href")).toBe("https://github.com/x");
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      screen
        .getByRole("button", { name: "How this demo was made" })
        .getAttribute("aria-haspopup"),
    ).toBe("dialog");
  });

  it("Download C5 hands the click to the download kit instead of navigating", () => {
    render(<DemoHeader title="T" story="demo-fibonacci-vis" />);
    const cta = screen.getByRole("link", { name: "Download C5" });
    expect(cta.getAttribute("href")).toBe(SITE_URL);

    const notPrevented = fireEvent.click(cta);

    expect(notPrevented).toBe(false);
    expect(requestDownload).toHaveBeenCalledWith({
      story: "demo-fibonacci-vis",
    });
  });

  it("publishes its height as --gw-header-h and keeps it current", () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 56 } as DOMRect);
    const { unmount } = render(<DemoHeader title="T" story="s" />);
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--gw-header-h")).toBe("56px");

    rect.mockReturnValue({ height: 80 } as DOMRect);
    observers[0]!.cb();
    expect(root.getPropertyValue("--gw-header-h")).toBe("80px");

    unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("DemoFooter", () => {
  it("links six growther.si guides as real cross-site links", () => {
    render(<DemoFooter />);
    const nav = screen.getByRole("navigation", {
      name: "Guides on growther.si",
    });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "https://growther.si/local-ai-agent",
      "https://growther.si/local-llm-agent",
      "https://growther.si/self-hosted-ai-agent",
      "https://growther.si/multi-agent-orchestration",
      "https://growther.si/openclaw-alternative",
      "https://growther.si/cloud-ai-agent-alternative",
    ]);
  });

  it("links Docs and every growther.si section, as hash-routed modals", () => {
    render(<DemoFooter />);
    const nav = screen.getByRole("navigation", { name: "Growther.si" });
    const links = [...nav.querySelectorAll("a")];

    expect(links[0]!.textContent).toBe("Docs");
    expect(links[0]!.getAttribute("href")).toBe(DOCS_URL);
    expect(links).toHaveLength(13);
    expect(links.slice(1).map((a) => a.getAttribute("href"))).toContain(
      `${SITE_URL}/#modal=pricing`,
    );
    expect(
      screen
        .getByRole("link", { name: "Help & Feedback" })
        .getAttribute("href"),
    ).toBe(`${SITE_URL}/#modal=help`);
  });

  it("shows the current year and the patent notice", () => {
    render(<DemoFooter />);

    expect(
      screen.getByText(
        new RegExp(`© ${new Date().getFullYear()} Growther\\.si\\.`),
      ),
    ).toBeInstanceOf(HTMLParagraphElement);
    expect(
      screen
        .getByRole("link", { name: "U.S. Patent Application No. 64/130,388" })
        .getAttribute("href"),
    ).toBe(`${SITE_URL}/patent`);
  });

  it("picks a tagline at random, with the italic phrase where it has one", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = render(<DemoFooter />);
    expect(first.container.querySelector(".gw-tagline")!.textContent).toBe(
      "“You're busy, too busy… achieve more over-the-loop.”",
    );
    first.unmount();

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const last = render(<DemoFooter />);
    expect(last.container.querySelector(".gw-tagline i")!.textContent).toBe(
      "actually productive",
    );
  });

  it("More / Less toggles the collapsed phone footer", () => {
    const { container } = render(<DemoFooter />);
    const toggle = screen.getByRole("button", { name: "More ▴" });
    expect(toggle.getAttribute("aria-controls")).toBe("gw-footer-more");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("Less ▾");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("footer")!.className).toBe(
      "gw-footer is-open",
    );

    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("More ▴");
    expect(container.querySelector("footer")!.className).toBe("gw-footer");
  });

  it("publishes its height as --gw-footer-h", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 41,
    } as DOMRect);
    render(<DemoFooter />);

    expect(
      document.documentElement.style.getPropertyValue("--gw-footer-h"),
    ).toBe("41px");
  });
});
