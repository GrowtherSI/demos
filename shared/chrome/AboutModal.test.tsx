// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DemoAbout } from "./AboutModal";

const requestDownload = vi.fn(async () => "download" as const);
vi.mock("../downloadKit", () => ({
  requestDownload: (...args: unknown[]) => requestDownload(...(args as [])),
}));

const { AboutButton, InfoIcon } = await import("./AboutModal");

const ABOUT: DemoAbout = {
  prompt: "Write a responsive web app.",
  hours: 5,
  costUsd: 33.38,
  passedSteps: 204,
  reworkSteps: 22,
  tokens: "1.1M",
  inference: [
    { where: "Cloud", via: "Anthropic API" },
    { where: "Local", via: "LM Studio" },
  ],
  humanHours: 4,
  humanRateUsd: 50,
};

function open(about: DemoAbout = ABOUT) {
  render(<AboutButton about={about} story="demo-x" />);
  const trigger = screen.getByRole("button", {
    name: "How this demo was made",
  });
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog") };
}

const key = (k: string, shiftKey = false) =>
  fireEvent.keyDown(window, { key: k, shiftKey });

afterEach(() => {
  cleanup();
  requestDownload.mockClear();
  document.body.innerHTML = "";
});

describe("AboutButton", () => {
  it("opens a labelled modal dialog and reports it as expanded", () => {
    const { trigger, dialog } = open();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(
      dialog.getAttribute("aria-labelledby")!,
    );
    expect(title!.textContent).toBe("One sentence in. A finished app out.");
  });

  it("portals the dialog outside the header, into one reusable root", () => {
    const { dialog } = open();
    const root = document.getElementById("gw-modal-root")!;

    expect(root.parentElement).toBe(document.body);
    expect(root.className).toBe("gw-chrome");
    expect(root.contains(dialog)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "How this demo was made" }),
    );
    expect(document.querySelectorAll("#gw-modal-root")).toHaveLength(1);
    expect(root.contains(screen.getByRole("dialog"))).toBe(true);
  });
});

describe("the story it tells", () => {
  it("quotes the prompt and lists where the models ran", () => {
    open();

    expect(screen.getByText("“Write a responsive web app.”").tagName).toBe(
      "BLOCKQUOTE",
    );
    const chips = screen.getByRole("list", { name: "Where the models ran" });
    expect(
      [...chips.querySelectorAll("li")].map((li) => [
        li.className,
        li.textContent,
      ]),
    ).toEqual([
      ["gw-chip gw-chip-cloud", "CloudAnthropic API"],
      ["gw-chip gw-chip-local", "LocalLM Studio"],
    ]);
  });

  it("derives the stats and the human comparison from the facts", () => {
    const { dialog } = open();
    const stats = [...dialog.querySelectorAll(".gw-stats dd")].map(
      (d) => d.textContent,
    );

    // cents only when the amount has them
    expect(stats).toEqual(["< 5 hrs", "$33.38", "226", "1.1M"]);
    expect(dialog.textContent).toContain(
      "Even at a modest $50 an hour, that’s $200",
    );
    expect(dialog.textContent).toContain("about 6× C5’s bill");
    const bar = dialog.querySelector<HTMLElement>(".gw-bar-c5")!;
    expect(parseFloat(bar.style.width)).toBeCloseTo((33.38 / 200) * 100, 6);
  });

  it("never draws C5's bar thinner than 4%", () => {
    const { dialog } = open({ ...ABOUT, costUsd: 1, humanHours: 100 });

    expect(dialog.querySelector<HTMLElement>(".gw-bar-c5")!.style.width).toBe(
      "4%",
    );
    expect(dialog.textContent).toContain("about 5000× C5’s bill");
  });

  it("its Download C5 goes through the download kit with an -about story", () => {
    open();
    const cta = screen.getByRole("link", { name: "Download C5" });

    expect(fireEvent.click(cta)).toBe(false);
    expect(requestDownload).toHaveBeenCalledWith({ story: "demo-x-about" });
    expect(
      screen
        .getByRole("link", { name: "Explore Mothership" })
        .getAttribute("href"),
    ).toBe("https://growther.si/#modal=mothership");
  });
});

describe("dialog keyboard and pointer contract", () => {
  it("moves focus to Close on open, and back to the trigger on close", () => {
    const { trigger } = open();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("Escape closes it", () => {
    const { trigger } = open();

    const notPrevented = key("Escape");

    expect(notPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Tab from the last control wraps to the first, Shift+Tab from the first to the last", () => {
    open();
    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("link", { name: "Explore Mothership" });

    last.focus();
    expect(key("Tab")).toBe(false);
    expect(document.activeElement).toBe(close);

    expect(key("Tab", true)).toBe(false);
    expect(document.activeElement).toBe(last);
  });

  it("leaves Tab alone between the ends, and ignores other keys", () => {
    open();
    const middle = screen.getByRole("link", { name: "Download C5" });
    middle.focus();

    expect(key("Tab")).toBe(true);
    expect(key("Tab", true)).toBe(true);
    expect(key("a")).toBe(true);
    expect(document.activeElement).toBe(middle);
    expect(screen.getByRole("dialog")).toBeInstanceOf(HTMLDivElement);
  });

  it("closes on a press on the backdrop, not on one inside the dialog", () => {
    const { dialog } = open();

    fireEvent.mouseDown(dialog);
    expect(screen.getByRole("dialog")).toBe(dialog);

    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stops listening for keys once closed", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(key("Escape")).toBe(true);
  });
});

describe("InfoIcon", () => {
  it("is decorative and 18px unless sized", () => {
    const { container, rerender } = render(<InfoIcon />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("18");

    rerender(<InfoIcon size={24} />);
    expect(container.querySelector("svg")!.getAttribute("height")).toBe("24");
  });
});
