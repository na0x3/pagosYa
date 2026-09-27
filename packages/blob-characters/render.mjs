// Blob characters (B1): renders a Blobatar as inline SVG markup. Everything is local and deterministic:
// the same seed and options always give the same markup, and nothing touches the network.
//
// Built on `blobatar/internal`'s `_parts` (the seam Blobatar's own React/Vue adapters use) because the
// public string API ignores `animate`. `blobatar` is pinned to an exact version in package.json; the
// tests in test/render.test.mjs pin the parts of that seam this file relies on.
import { _parts, serializeVars } from "blobatar/internal";
import { happy, idle, love, mad, sad, scared, shy, sick, sleepy, smug, surprised, thinking, unsure, wink } from "blobatar/expression";

/** Blobatar's 14 held expressions, by name. */
export const EXPRESSIONS = Object.freeze({ idle, happy, sad, mad, surprised, wink, sleepy, smug, unsure, scared, love, shy, sick, thinking });
export const EXPRESSION_NAMES = Object.freeze(Object.keys(EXPRESSIONS));

/** The `traits.shape` position that pins each of Blobatar 2.7's ten silhouettes (frozen within the major). */
export const SHAPES = Object.freeze({ round: 0.1, organic: 0.3, boxy: 0.5, capsule: 0.65, nub: 0.74, cloud: 0.82, droplet: 0.88, hexagon: 0.93, sun: 0.96, triangle: 0.99 });

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Options for `_parts`, validated. Throws a TypeError on an unknown expression or shape (a programming error). */
export function blobOptions({ look = {}, expression = "idle", plate = false, animate = false } = {}) {
  if (!Object.hasOwn(EXPRESSIONS, expression)) throw new TypeError(`Unknown blob expression: ${expression}`);
  const options = { expression: EXPRESSIONS[expression] };
  if (look.shape !== undefined) {
    if (!Object.hasOwn(SHAPES, look.shape)) throw new TypeError(`Unknown blob shape: ${look.shape}`);
    options.traits = { shape: SHAPES[look.shape] };
  }
  if (look.hue !== undefined) options.hue = look.hue;
  if (look.tone !== undefined) options.tone = look.tone;
  if (plate) options.background = "circle";
  if (animate) options.animate = animate === "always" ? "always" : "hover";
  return options;
}

const cache = new Map();
const CACHE_LIMIT = 256;
/** How many rendered blobs are memoized (bounded, least recently used out first). */
export const blobCacheSize = () => cache.size;

/**
 * One blob as an `<svg>` string.
 * - `title` given: `role="img"` with a `<title>` (the accessible name). No title: `aria-hidden`, decorative.
 * - `plate`: a circle behind the figure, so pale blobs still read on any background.
 * - `animate` ("hover" | "always"): markup for Blobatar's idle layer (needs blobatar/motion.css) and for `mountBlob`.
 */
export function blobSvg(seed, { look, expression = "idle", title, plate = false, animate = false, className = "" } = {}) {
  const key = JSON.stringify([String(seed), look ?? null, expression, title ?? null, plate, animate, className]);
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const parts = _parts(String(seed), blobOptions({ look, expression, plate, animate }));
  const label = typeof title === "string" ? title.trim() : "";
  const classes = ["blob-figure", className].filter(Boolean).join(" ");
  const a11y = label ? 'role="img"' : 'aria-hidden="true" focusable="false"';
  const style = parts.vars ? ` style="${escapeXml(serializeVars(parts.vars))}"` : "";
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="${escapeXml(classes)}" ${a11y}${style}>`
    + (label ? `<title>${escapeXml(label)}</title>` : "")
    + (parts.bg ? `<path class="blob-plate" d="${parts.bg.d}" fill="${parts.bg.fill}"/>` : "")
    + `<g${parts.cls ? ` class="${parts.cls}"` : ""}>${parts.inner}</g></svg>`;
  cache.set(key, markup);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return markup;
}

/** A static, decorative blob as a `data:` URI, for `background-image` or `<img src>`. */
export function blobDataUri(seed, { look, expression = "idle", plate = false } = {}) {
  return `data:image/svg+xml,${encodeURIComponent(blobSvg(seed, { look, expression, plate }))}`;
}
