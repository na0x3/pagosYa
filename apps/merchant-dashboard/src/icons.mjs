import { escapeHtml } from "./html.mjs";
import { ICON_PATHS } from "./icon-paths.mjs";

// The dashboard's one icon set (Lucide line icons, see icon-paths.mjs). The same size, stroke and
// colour everywhere is what makes the screens read as one product.

export const ICON_NAMES = Object.freeze(Object.keys(ICON_PATHS));

/**
 * One icon as an inline SVG string: 1.5 stroke in the text colour, decorative unless labelled.
 * @param {string} name a Lucide name listed in scripts/build-icons.mjs
 * @param {{ size?: number, label?: string }} [options]
 */
export function icon(name, options = {}) {
  const drawing = ICON_PATHS[name];
  if (!drawing) throw new Error(`Unknown icon: ${name}`);
  const px = Number(options.size) || 18;
  const a11y = options.label ? `role="img" aria-label="${escapeHtml(options.label)}"` : 'aria-hidden="true"';
  return `<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false" ${a11y}>${drawing}</svg>`;
}
