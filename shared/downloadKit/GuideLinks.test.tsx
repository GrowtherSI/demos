// @vitest-environment jsdom
/**
 * ── SHARED DOWNLOAD KIT ── v1.11.0 ────────────────────────────────────────────
 * Test for the mirrored kit — it runs in growther-marketing, growther-docs and
 * the demos repo. Edit the canonical copy (growther-marketing) and run
 * `npm run sync:download-kit`; see ./README.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GuideLinks } from "./GuideLinks";
import { GUIDES, guideBySlug, guideUrl } from "./guides";

afterEach(cleanup);

describe("GUIDES", () => {
  it("names each page once, with a URL-shaped slug and a descriptive anchor", () => {
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      expect(g.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(g.label.length).toBeLessThanOrEqual(26);
      // Anchor text says what the reader gets, never the bare label.
      expect(g.text.split(" ").length).toBeGreaterThanOrEqual(5);
      expect(g.text).not.toBe(g.label);
    }
    expect(guideUrl("local-ai-agent")).toBe(
      "https://growther.si/local-ai-agent",
    );
    expect(guideBySlug("local-ai-agent")?.label).toBe("Local AI agent");
    expect(guideBySlug("nope")).toBeUndefined();
  });
});

describe("GuideLinks", () => {
  it("renders the picked guides, in order, as absolute links with titles", () => {
    render(
      <GuideLinks pick={["scheduled-ai-agent", "private-ai-agent", "nope"]} />,
    );
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Scheduled AI agent",
      "Private AI agent",
    ]);
    expect(links[0]!.getAttribute("href")).toBe(
      "https://growther.si/scheduled-ai-agent",
    );
    expect(links[0]!.getAttribute("title")).toBe(
      "scheduling an AI agent to do recurring work on its own",
    );
    expect(screen.getByText("Guides:").textContent).toBe("Guides:");
    expect(
      screen.getByRole("navigation", { name: "Guides on growther.si" }),
    ).toBe(links[0]!.parentElement);
  });

  it("renders nothing when no picked slug exists", () => {
    const { container } = render(<GuideLinks pick={["nope"]} />);
    expect(container.innerHTML).toBe("");
  });
});
