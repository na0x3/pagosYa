import { Store } from "../api";
import { escapeHtml } from "../ui/html";
import { storeImagePosition } from "./catalog";

// Animated transforms can make the browser reuse a low-resolution compositor
// texture, especially when a portrait upload is stretched into a wide frame.
// Keep the real image unscaled and contained; a cached, decorative copy fills
// the frame behind it so portrait and modest-resolution assets stay crisp.
export const storeFidelityImageHtml = (store: Store) => (
  mediaUrl: string,
  sourceUrl: string,
  alt: string,
  options: { eager?: boolean; className?: string } = {},
) => {
  const position = storeImagePosition(store, sourceUrl);
  const sourceLoading = options.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const backdropLoading = options.eager ? 'loading="eager"' : 'loading="lazy"';
  const extraClass = options.className ? ` ${options.className}` : "";
  return `<span class="store-fidelity-media${extraClass}">
    <img class="store-fidelity-media-source" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(alt)}" ${sourceLoading} decoding="async" style="object-position:${position}">
    <img class="store-fidelity-media-backdrop" src="${escapeHtml(mediaUrl)}" alt="" aria-hidden="true" ${backdropLoading} decoding="async" style="object-position:${position}">
  </span>`;
};
export type FidelityImageHtml = ReturnType<typeof storeFidelityImageHtml>;
