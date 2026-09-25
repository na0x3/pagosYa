// Blob characters (B1): the animation player. An animation is data — `[{ expression, hold, motion }]` — played
// once or looped, and it always ends back on the blob's resting expression. Expressions morph through Blobatar's
// own CSS (blobatar/motion.css); body motion comes from blob-motion.css (bounce, hop, shake, celebrate, talk).
// Reduced motion shows the target expression at once, with no body motion.
import { _parts, serializeVars } from "blobatar/internal";
import { EXPRESSIONS, blobOptions, blobSvg } from "./render.mjs";

export const MOTIONS = Object.freeze(["bounce", "hop", "shake", "celebrate", "talk"]);

/** The moods from the Blob characters spec (section 4), as data. B1 uses `unlock` and `cheer`; B2 and B3 use the rest. */
export const ANIMATIONS = Object.freeze({
  cheer: Object.freeze([{ expression: "happy", hold: 900, motion: "celebrate" }]),
  unlock: Object.freeze([{ expression: "surprised", hold: 600, motion: "hop" }, { expression: "happy", hold: 1400, motion: "celebrate" }]),
  newOrder: Object.freeze([{ expression: "surprised", hold: 700, motion: "hop" }]),
  paymentSuccess: Object.freeze([{ expression: "happy", hold: 900, motion: "celebrate" }, { expression: "love", hold: 1200, motion: null }]),
  paymentFailed: Object.freeze([{ expression: "unsure", hold: 500, motion: null }, { expression: "sad", hold: 1400, motion: "shake" }]),
  waiting: Object.freeze([{ expression: "thinking", hold: 1800, motion: null }]),
  talking: Object.freeze([{ expression: "idle", hold: 360, motion: "talk" }, { expression: "surprised", hold: 280, motion: "talk" }]),
});

/** Normalizes and checks an animation. Throws a TypeError naming the bad step (a programming error, never user input). */
export function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) throw new TypeError("A blob animation needs at least one step");
  return steps.map((step, index) => {
    const { expression, hold, motion = null } = step ?? {};
    if (!Object.hasOwn(EXPRESSIONS, expression)) throw new TypeError(`Step ${index}: unknown expression ${expression}`);
    if (!Number.isFinite(hold) || hold < 0) throw new TypeError(`Step ${index}: hold must be milliseconds >= 0`);
    if (motion !== null && !MOTIONS.includes(motion)) throw new TypeError(`Step ${index}: unknown motion ${motion}`);
    return { expression, hold, motion };
  });
}

/**
 * Runs an animation against `io` ({ apply(step), wait(ms), cancelled() }), which `mountBlob` wires to the DOM
 * and tests wire to a log. Once: every step, then `rest`. Loop: until cancelled. Reduced motion: the last
 * step's expression at once with no motion, held for the animation's length, then `rest` (loops stay on it).
 */
export async function runAnimation(steps, { loop = false, rest = "idle", reducedMotion = false } = {}, io) {
  const plan = validateSteps(steps);
  if (!Object.hasOwn(EXPRESSIONS, rest)) throw new TypeError(`Unknown rest expression: ${rest}`);
  if (reducedMotion) {
    io.apply({ expression: plan[plan.length - 1].expression, motion: null });
    if (loop) return;
    await io.wait(plan.reduce((total, step) => total + step.hold, 0));
    if (!io.cancelled()) io.apply({ expression: rest, motion: null });
    return;
  }
  do {
    for (const step of plan) {
      io.apply(step);
      await io.wait(step.hold);
      if (io.cancelled()) return;
    }
  } while (loop);
  io.apply({ expression: rest, motion: null });
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Renders an animated blob into `host` and returns a handle to play animations on it. The `<svg>` subtree is
 * never replaced after mounting — only the root group's class and the svg's custom properties change — which
 * is what lets Blobatar's CSS morph between expressions.
 * `reducedMotion` overrides the media query (a motion-off preference); omitted, the media query decides.
 */
export function mountBlob(host, { seed, look, expression = "idle", title, plate = false, animate = "always", reducedMotion } = {}) {
  const mode = animate === "hover" ? "hover" : "always";
  host.classList.add("blob-host");
  host.innerHTML = blobSvg(seed, { look, expression, title, plate, animate: mode });
  host.setAttribute("data-blob-expression", expression);
  const svg = host.querySelector("svg");
  const root = svg.querySelector("g.mo-root");
  let rest = expression;
  let current = expression;
  let run = 0;
  const reduce = () => reducedMotion ?? prefersReducedMotion();

  function setExpression(name) {
    const parts = _parts(String(seed), blobOptions({ look, expression: name, plate, animate: mode }));
    root.setAttribute("class", parts.cls);
    svg.setAttribute("style", serializeVars(parts.vars));
    host.setAttribute("data-blob-expression", name);
    current = name;
  }
  function setMotion(name) {
    host.removeAttribute("data-blob-motion");
    if (!name || reduce()) return;
    void host.offsetWidth; // restarts the keyframes when the same motion plays twice in a row
    host.setAttribute("data-blob-motion", name);
  }
  function apply({ expression: next, motion }) {
    if (next !== current) setExpression(next);
    setMotion(motion);
  }

  return {
    svg,
    get expression() { return current; },
    setRest(name) {
      if (!Object.hasOwn(EXPRESSIONS, name)) throw new TypeError(`Unknown rest expression: ${name}`);
      rest = name;
    },
    play(steps, { loop = false, rest: restOverride } = {}) {
      const token = ++run;
      return runAnimation(steps, { loop, rest: restOverride ?? rest, reducedMotion: reduce() }, {
        apply: (step) => { if (token === run) apply(step); },
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        cancelled: () => token !== run,
      });
    },
    stop() {
      run += 1;
      apply({ expression: rest, motion: null });
    },
    destroy() {
      run += 1;
      host.removeAttribute("data-blob-motion");
      host.removeAttribute("data-blob-expression");
      host.replaceChildren();
    },
  };
}
