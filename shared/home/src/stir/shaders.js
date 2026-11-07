/**
 * GLSL for the stirred-ink background.
 *
 * Every pass draws one full-screen quad (see fluid.js), so they share a vertex
 * shader that passes the UV through untouched. The fluid passes are a compact
 * stable-fluids solver: advect, vorticity confinement, pressure projection, and
 * a Gaussian splat for the pointer. The display pass paints the page's own
 * background — the same radial gradient as home.css, so the canvas is
 * indistinguishable from the CSS fallback until the pointer stirs it — and
 * darkens it to pure black wherever ink floats.
 */

export const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Moves `uSource` along `uVelocity` (sim texels per second) and dampens it. */
export const ADVECT_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uDt;
  uniform float uDecay;
  void main() {
    vec2 back = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
    gl_FragColor = texture2D(uSource, back) * uDecay;
  }
`;

export const DIVERGENCE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float t = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
  }
`;

export const CURL_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
    float r = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
    float b = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
    gl_FragColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
  }
`;

/** Vorticity confinement: pushes the flow back into the little eddies that
    numerical damping smears away, which is what makes the ink swirl. */
export const VORTICITY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform vec2 uTexel;
  uniform float uCurlStrength;
  uniform float uDt;
  void main() {
    float l = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
    float c = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
    force /= length(force) + 0.0001;
    force *= uCurlStrength * c;
    force.y *= -1.0;
    vec2 velocity = texture2D(uVelocity, vUv).xy + force * uDt;
    gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
  }
`;

export const PRESSURE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float divergence = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((l + r + b + t - divergence) * 0.25, 0.0, 0.0, 1.0);
  }
`;

export const GRADIENT_SUBTRACT_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(r - l, t - b);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

/** Adds a Gaussian blob of `uColor` to `uTarget` around `uPoint` (UV). */
export const SPLAT_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float uAspect;
  uniform vec3 uColor;
  uniform vec2 uPoint;
  uniform float uRadius;
  void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }
`;

/** The page background, exactly as home.css paints it: the body colour with
    the brand glow `radial-gradient(1100px 520px at 50% -160px, #2ecb8f21,
    transparent 70%)`. Measured in CSS pixels from the top of the document, so
    it scrolls with the page like the fallback does. */
export const GRADIENT = Object.freeze({
  base: [0x07 / 255, 0x0b / 255, 0x12 / 255],
  glow: [0x2e / 255, 0xcb / 255, 0x8f / 255],
  glowAlpha: 0x21 / 255,
  radiusX: 1100,
  radiusY: 520,
  centerY: -160,
  fadeAt: 0.7,
});

export const DISPLAY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uDye;
  uniform sampler2D uVelocity;
  uniform vec2 uDyeTexel;
  uniform vec2 uVelocityTexel;
  uniform vec2 uSize;
  uniform float uScroll;
  uniform vec3 uBase;
  uniform vec3 uGlow;
  uniform float uGlowAlpha;
  uniform vec2 uGlowRadius;
  uniform float uGlowCenterY;
  uniform float uGlowFade;
  uniform float uRipple;
  uniform float uRim;

  void main() {
    // The resting surface: CSS pixel position within the document, y down.
    vec2 px = vec2(vUv.x * uSize.x, (1.0 - vUv.y) * uSize.y + uScroll);
    vec2 d = vec2(px.x - 0.5 * uSize.x, px.y - uGlowCenterY) / uGlowRadius;
    float a = uGlowAlpha * clamp(1.0 - length(d) / uGlowFade, 0.0, 1.0);
    vec3 surface = mix(uBase, uGlow, a);

    // Around a stroke the surface is agitated (the ink's green channel) and
    // ripples while it is still moving: eddies (curl) tilt it towards and
    // away from the light, and the flow itself catches a little more of it.
    // The flow spreads page-wide through the pressure solve; the agitation
    // keeps the ripples to where the pointer was.
    float agitation = smoothstep(0.03, 0.3, texture2D(uDye, vUv).y);
    vec2 vl = texture2D(uVelocity, vUv - vec2(uVelocityTexel.x, 0.0)).xy;
    vec2 vr = texture2D(uVelocity, vUv + vec2(uVelocityTexel.x, 0.0)).xy;
    vec2 vb = texture2D(uVelocity, vUv - vec2(0.0, uVelocityTexel.y)).xy;
    vec2 vt = texture2D(uVelocity, vUv + vec2(0.0, uVelocityTexel.y)).xy;
    float curl = 0.5 * ((vr.y - vl.y) - (vt.x - vb.x));
    float flow = length(texture2D(uVelocity, vUv).xy);
    float moving = agitation * smoothstep(8.0, 60.0, flow);
    float ripple = clamp(curl * uRipple, -0.06, 0.06) * moving + 0.03 * moving;
    surface *= 1.0 + ripple;

    // The black beneath, where the surface has been parted.
    float ink = texture2D(uDye, vUv).x;
    float il = texture2D(uDye, vUv - vec2(uDyeTexel.x, 0.0)).x;
    float ir = texture2D(uDye, vUv + vec2(uDyeTexel.x, 0.0)).x;
    float ib = texture2D(uDye, vUv - vec2(0.0, uDyeTexel.y)).x;
    float it = texture2D(uDye, vUv + vec2(0.0, uDyeTexel.y)).x;
    // The surface dips into the opening, so its slope there faces away from
    // the black; lit from the upper left, one side of the rim shines and the
    // other falls into shadow — the meniscus that makes it read as liquid.
    vec2 slope = -vec2(ir - il, it - ib);
    float lit = dot(slope / (length(slope) + 1e-4), normalize(vec2(-0.6, 0.8)));
    float rim = smoothstep(0.0, 0.12, ink) * (1.0 - smoothstep(0.08, 0.45, ink));
    surface *= 1.0 + uRim * rim * lit;
    surface += vec3(0.85, 0.95, 0.92) * uRim * 0.35 * rim * pow(max(lit, 0.0), 3.0);

    float hole = smoothstep(0.06, 0.4, ink);
    gl_FragColor = vec4(mix(surface, vec3(0.0), hole), 1.0);
  }
`;

/** The jacks: polished silver lit by a procedural studio — a bright softbox
    overhead, the page's dark green floor below, and two hard key lights whose
    glints sweep across the metal as each jack tumbles. `aFade` is the
    per-instance opacity the pool drives while a jack surfaces and sinks. */
export const JACK_VERTEX = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vFade = aFade;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vView = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const JACK_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vFade;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3 uFloor;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    vec3 r = reflect(-v, n);
    float up = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(uFloor, vec3(0.92, 0.94, 0.98), pow(up, 1.6));
    float softbox = smoothstep(0.55, 0.95, r.y) * 0.9;
    float key1 = pow(max(dot(r, normalize(vec3(-0.55, 0.65, 0.5))), 0.0), 60.0);
    float key2 = pow(max(dot(r, normalize(vec3(0.7, 0.35, 0.6))), 0.0), 90.0);
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 silver = vec3(0.74, 0.77, 0.82);
    vec3 color = silver * (sky * 0.75 + softbox) + (key1 * 1.4 + key2 * 1.1) + fresnel * 0.35;
    gl_FragColor = vec4(color, vFade);
  }
`;
