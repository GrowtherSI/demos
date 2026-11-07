import { mountDemoChrome } from "../../chrome";
import { mountStirBackground } from "./stir/background.js";
import "./home.css";

mountDemoChrome({
  title: "OpenSource Demos",
  story: "demos-home",
  sourceUrl: "https://github.com/GrowtherSI/demos",
  // This page IS the listing, so the header leaves out its "All demos" button.
  listing: true,
});

// The stirrable background. Without WebGL (or with reduced motion) this is a
// no-op and body's CSS gradient — the same image — stays.
mountStirBackground();
