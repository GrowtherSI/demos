// @vitest-environment jsdom
/**
 * ── SHARED DOWNLOAD KIT ── v1.11.0 ────────────────────────────────────────────
 * Test for the mirrored kit — it runs in BOTH growther-marketing and
 * growther-docs. Edit the canonical copy (growther-marketing) and run
 * `npm run sync:download-kit`; see ./README.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SocialLinks, SOCIALS, X_URL } from "./Socials";

afterEach(cleanup);

describe("SOCIALS", () => {
  /** These are the addresses of real accounts; a typo here is a broken link on
   *  four surfaces across two sites, and nothing else would catch it. */
  it("points at the accounts we actually have", () => {
    expect(SOCIALS.map((s) => s.href)).toEqual([
      "https://x.com/GrowtherAI",
      "https://www.instagram.com/GrowtherSI/",
      "https://www.youtube.com/@GrowtherSI",
      "https://www.linkedin.com/company/GrowtherSI",
      "https://github.com/GrowtherSI/release",
    ]);
    expect(X_URL).toBe("https://x.com/GrowtherAI");
  });

  it("gives every network a key, a name and a handle", () => {
    for (const s of SOCIALS) {
      expect(s.key).toMatch(/^[a-z]+$/);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.handle.length).toBeGreaterThan(0);
      expect(s.href.startsWith("https://")).toBe(true);
    }
    expect(new Set(SOCIALS.map((s) => s.key)).size).toBe(SOCIALS.length);
  });
});

describe("SocialLinks", () => {
  it("renders every network, each opening safely in a new tab", () => {
    render(<SocialLinks />);
    for (const s of SOCIALS) {
      const link = screen.getByTestId(`social-${s.key}`);
      expect(link.getAttribute("href")).toBe(s.href);
      expect(link.getAttribute("target")).toBe("_blank");
      // Without noopener the destination gets a handle on our window.
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  /** The mark alone is not a label. Someone on a screen reader gets the network
   *  name whether or not the row shows handles. */
  it("names each network for assistive tech even with no visible label", () => {
    render(<SocialLinks />);
    for (const s of SOCIALS) {
      expect(
        screen.getByLabelText(`Growther.si on ${s.name}`).getAttribute("href"),
      ).toBe(s.href);
    }
    expect(screen.queryByText("@GrowtherAI")).toBeNull();
    expect(screen.queryByText("@GrowtherSI")).toBeNull();
    expect(screen.queryByText("GrowtherSI")).toBeNull();
  });

  it("shows handles when asked", () => {
    render(<SocialLinks labels />);
    expect(screen.getAllByText("@GrowtherAI").length).toBe(1);
    expect(screen.getAllByText("@GrowtherSI").length).toBe(2);
    expect(screen.getAllByText("GrowtherSI").length).toBe(2);
  });

  /** One geometry, scaled — the About tab's 4× row is this component at
   *  scale 4, not a second set of styles that can drift from the modal's. */
  it("scales every dimension together", () => {
    const { container: one } = render(<SocialLinks />);
    const small = one.querySelector<SVGElement>("svg")!;
    cleanup();
    const { container: four } = render(<SocialLinks scale={4} />);
    const large = four.querySelector<SVGElement>("svg")!;

    expect(small.getAttribute("width")).toBe("13");
    expect(large.getAttribute("width")).toBe("52");
    // The nominal size is the px; the CSS caps it against the viewport so a 4×
    // block shrinks into a phone instead of overflowing it.
    expect(large.style.width).toBe("min(52px, 9vw)");
    expect(
      four.querySelector<HTMLAnchorElement>('[data-testid="social-x"]')!.style
        .fontSize,
    ).toBe("min(48px, 8vw)");
  });

  /** The footer wants marks, not buttons: no border, no card background. */
  it("drops the chip entirely in the bare variant", () => {
    const { container } = render(<SocialLinks variant="bare" />);
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="social-x"]',
    )!;
    expect(link.style.border).toBe("");
    expect(link.style.background).toBe("");
  });

  it("reports the network a visitor chose", () => {
    const onSelect = vi.fn();
    render(<SocialLinks onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("social-youtube"));
    expect(onSelect).toHaveBeenCalledWith("youtube");
  });
  /**
   * The layout must not depend on how long a handle is.
   *
   * Wrapping did: at scale 4 the "@GrowtherAI" chips came out 491px wide, two
   * needed 1000px, the container was 975 — so they stacked one per row, and
   * only "Growther-AI" (462px, the shortest) ever shared a row. Equal columns
   * make a block of buttons a block at any width.
   */
  it("lays out in equal columns when asked for a grid", () => {
    const { container } = render(
      <SocialLinks scale={4} labels layout="grid" />,
    );
    const row = container.querySelector<HTMLElement>(
      '[data-testid="social-links"]',
    )!;
    expect(row.style.display).toBe("grid");
    // auto-fit + a floor: as many equal columns as fit, one on a phone.
    expect(row.style.gridTemplateColumns).toContain("repeat(auto-fit");
    expect(row.style.gridTemplateColumns).toContain("380px"); // 95 × 4
    expect(row.style.gridTemplateColumns).toContain("1fr");
  });

  it("still wraps as a row by default, for the modal line and the footer", () => {
    const { container } = render(<SocialLinks />);
    const row = container.querySelector<HTMLElement>(
      '[data-testid="social-links"]',
    )!;
    expect(row.style.display).toBe("inline-flex");
    expect(row.style.flexWrap).toBe("wrap");
    expect(row.style.gridTemplateColumns).toBe("");
  });
});
