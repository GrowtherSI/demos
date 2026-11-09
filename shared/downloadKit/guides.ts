/**
 * ── SHARED DOWNLOAD KIT ── v1.11.0 ────────────────────────────────────────────
 * CANONICAL: growther-marketing/shared/downloadKit/   (edit here)
 * MIRROR:    growther-docs/shared/downloadKit/        (never edit — generated)
 * PAIRED: these two directories are ONE component with two deployments and are
 *         byte-identical; changing one without the other is a bug. Version and
 *         changelog live in ./VERSION.ts — bump it. Rules: ./README.md.
 * SYNC:  npm run sync:download-kit     (growther-marketing)
 * CHECK: npm run check:download-kit    (either repo; runs in lint + CI)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The growther.si guides — the SEO landing pages — as the one list the OTHER
 * sites link from. docs.growther.si and demos.growther.si carry a short
 * "Guides" row in their footers; those are real cross-site links to pages
 * that live only on growther.si, so the list has to travel with the kit or the
 * two footers drift from the pages the moment one is renamed.
 *
 * growther.si itself does not read this file: its footer reads the richer
 * shared/landing/meta.ts. A test there (shared/landing/landing.test.ts) pins
 * every slug and label here to that table, so this copy cannot name a page
 * that does not exist or call it something the page does not.
 *
 * Absolute URLs on purpose: the consumers are other origins.
 *
 * Data only, no JSX: the hosts' Worker tsconfigs (no JSX) type-check tests
 * that read this list. The component is ./GuideLinks.tsx.
 */

export interface Guide {
  /** The path segment on growther.si — permanent once published. */
  slug: string;
  /** As the page's own footer and About tab label it. */
  label: string;
  /** Descriptive anchor text for a link in running copy — says what the
   *  reader gets, which is also what a crawler reads the link as. */
  text: string;
}

export const GUIDES_ORIGIN = "https://growther.si";

export const GUIDES: readonly Guide[] = [
  {
    slug: "local-ai-agent",
    label: "Local AI agent",
    text: "what a local AI agent is and which layers stay on your computer",
  },
  {
    slug: "private-ai-agent",
    label: "Private AI agent",
    text: "exactly what leaves your machine with a private AI agent",
  },
  {
    slug: "offline-ai-agent",
    label: "Offline AI agent",
    text: "an AI agent that keeps working without internet",
  },
  {
    slug: "self-hosted-ai-agent",
    label: "Self-hosted AI agent",
    text: "running a self-hosted AI agent on hardware you control",
  },
  {
    slug: "ai-agent-local-data",
    label: "AI agent + local data",
    text: "an AI agent that works with your local files without uploading them",
  },
  {
    slug: "local-llm-agent",
    label: "Local LLM agent",
    text: "turning Ollama, LM Studio or llama.cpp into a team of agents",
  },
  {
    slug: "scheduled-ai-agent",
    label: "Scheduled AI agent",
    text: "scheduling an AI agent to do recurring work on its own",
  },
  {
    slug: "ai-automation-on-your-computer",
    label: "AI automation",
    text: "AI automation on your own computer, with approvals you set",
  },
  {
    slug: "ai-agent-remote-control",
    label: "Remote control",
    text: "reaching the AI agent on your own computer from a phone",
  },
  {
    slug: "multi-agent-orchestration",
    label: "Multi-agent teams",
    text: "how one prompt becomes a whole team of agents",
  },
  {
    slug: "import-claude-codex-history",
    label: "Import AI history",
    text: "bringing your Claude, Codex and Antigravity sessions into local memory",
  },
  {
    slug: "ai-agent-cost-control",
    label: "AI agent cost control",
    text: "putting a hard cap on what your AI agents spend",
  },
  {
    slug: "ai-agent-for-small-business",
    label: "AI for small business",
    text: "an AI agent team for a small business",
  },
  {
    slug: "ai-agent-for-researchers",
    label: "AI for researchers",
    text: "an AI agent for researchers that keeps data local",
  },
  {
    slug: "ai-agent-for-consultants",
    label: "AI for consultants",
    text: "an AI agent team that produces finished client deliverables",
  },
  {
    slug: "openclaw-alternative",
    label: "OpenClaw alternative",
    text: "C5 as an OpenClaw alternative, or a home for the OpenClaw you run",
  },
  {
    slug: "cloud-ai-agent-alternative",
    label: "Cloud agent alternative",
    text: "a private alternative to cloud AI agents",
  },
];

export function guideUrl(slug: string): string {
  return `${GUIDES_ORIGIN}/${slug}`;
}

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
