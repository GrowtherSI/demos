/**
 * One call puts the Growther.si chrome on a demo, whatever the demo is built
 * with — the demo never touches React:
 *
 *   import { mountDemoChrome } from "../shared/chrome";
 *   mountDemoChrome({ title: "Fibonacci Visualizer", story: "demo-fibonacci-vis",
 *                     sourceUrl: "https://github.com/GrowtherSI/demos/tree/main/fibonacci-vis" });
 *
 * It renders into #gw-header / #gw-footer when the page provides them (so the
 * header can sit after a skip link), and creates them otherwise. The demo lays
 * itself out around the chrome with --gw-header-h and --gw-footer-h, which
 * the header and footer keep current on <html>.
 *
 * The download kit reads the release catalog from `versionUrl`, same-origin:
 * each demo's Worker (shared/worker) proxies growther.si's /v1/version, and the
 * Vite dev server proxies it too (shared/chrome/vite.mjs).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  configureDownloadKit,
  DownloadGate,
  warmRelease,
} from "../downloadKit";
import { DemoFooter, DemoHeader, SITE_URL, type DemoHeaderProps } from "./DemoChrome";
export type { DemoAbout } from "./AboutModal";
import logoUrl from "./assets/logo.png";
import "./chrome.css";

export interface DemoChromeOptions extends DemoHeaderProps {
  versionUrl?: string;
}

function slot(id: string, where: "start" | "end"): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    if (where === "start") document.body.prepend(el);
    else document.body.append(el);
  }
  el.classList.add("gw-chrome");
  return el;
}

export function mountDemoChrome({
  versionUrl = "/v1/version",
  ...header
}: DemoChromeOptions): void {
  configureDownloadKit({ versionUrl });
  void warmRelease();

  const headerSlot = slot("gw-header", "start");
  const footerSlot = slot("gw-footer", "end");
  const gateSlot = slot("gw-download-gate", "end");

  createRoot(headerSlot).render(
    <StrictMode>
      <DemoHeader {...header} />
    </StrictMode>,
  );
  createRoot(footerSlot).render(
    <StrictMode>
      <DemoFooter />
    </StrictMode>,
  );
  createRoot(gateSlot).render(
    <StrictMode>
      <DownloadGate siteUrl={SITE_URL} logoSrc={logoUrl} />
    </StrictMode>,
  );
}
