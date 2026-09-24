/** Store motion experiences, canvas text styles, and site section sizing. */
import { type StoreMotionExperience } from "../api";
import { type StoreCanvasTextStyle } from "../site-document";


export const STORE_MOTION_EXPERIENCES: readonly StoreMotionExperience[] = [
  "story-scroll", "hero-carousel", "image-stream",
  "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials",
  "portfolio-scroller", "circle-reveal", "clarity-marquee",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
  "full-screen-chapters", "magnetic-target", "frame-sequence",
  "video-background",
  "draggable-cards", "perspective-carousel", "link-preview", "video-pin-reveal",
  "gallery-accordion", "split-scroll", "sticky-gallery", "sticky-story", "text-parallax",
];
export const STORE_TEXT_ANIMATION_EXPERIENCES = new Set<StoreMotionExperience>([
  "clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
]);

export function isStoreMotionExperience(value: unknown): value is StoreMotionExperience {
  return typeof value === "string" && STORE_MOTION_EXPERIENCES.includes(value as StoreMotionExperience);
}

export const STORE_MOTION_EXPERIENCE_LABELS: Record<StoreMotionExperience, string> = {
  "story-scroll": "Story Scroll",
  "hero-carousel": "Slider principal",
  "image-stream": "Image Stream",
  "scroll-expansion": "Scroll Expansion",
  "hero-gallery-scroll": "Hero Gallery",
  "stagger-testimonials": "Reseñas",
  "portfolio-scroller": "Menú de momentos",
  "circle-reveal": "Revelado circular",
  "clarity-marquee": "Preguntas en movimiento",
  "layered-text": "Texto en capas",
  "text-rotate": "Texto mecanografiado",
  "text-glitch": "Texto revelado",
  "text-reveal-block": "Revelado por bloques",
  "text-along-path": "Texto en recorrido",
  "full-screen-chapters": "Capítulos completos",
  "magnetic-target": "Llamado magnético",
  "frame-sequence": "Secuencia de cuadros",
  "video-background": "Video de fondo",
  "draggable-cards": "Tarjetas arrastrables",
  "perspective-carousel": "Carrusel con perspectiva",
  "link-preview": "Vista previa de enlace",
  "video-pin-reveal": "Video revelado al desplazarse",
  "gallery-accordion": "Galería acordeón",
  "split-scroll": "Relato dividido",
  "sticky-gallery": "Galería fija",
  "sticky-story": "Historia fija",
  "text-parallax": "Texto en paralaje",
};

export function storeAnimationMediaRequirement(type: StoreMotionExperience): { min: number; max: number } {
  if (STORE_TEXT_ANIMATION_EXPERIENCES.has(type)) return { min: 0, max: 0 };
  if (["circle-reveal", "magnetic-target", "video-background", "link-preview", "video-pin-reveal"].includes(type)) return { min: 1, max: 1 };
  if (type === "scroll-expansion") return { min: 2, max: 2 };
  if (["hero-gallery-scroll", "gallery-accordion", "split-scroll", "sticky-gallery"].includes(type)) return { min: 3, max: 8 };
  return { min: 2, max: 8 };
}

export function canvasTextStyleAttributes(style?: StoreCanvasTextStyle): string {
  const scale = Number.isInteger(style?.textScale) ? style!.textScale! : 100;
  const width = Number.isInteger(style?.textWidthPercent) ? style!.textWidthPercent! : 62;
  const align = style?.textAlign || "";
  const color = style?.textColor && /^#[0-9a-f]{6}$/i.test(style.textColor) ? style.textColor : "";
  const font = style?.fontStyle || "";
  const offsetX = Number.isInteger(style?.textOffsetX) ? style!.textOffsetX! : 0;
  const offsetY = Number.isInteger(style?.textOffsetY) ? style!.textOffsetY! : 0;
  const offsetBasis = style?.textOffsetBasis === "section" ? "section" : "element";
  return ` data-canvas-text-style data-canvas-text-scale="${scale}" data-canvas-text-width="${width}" data-canvas-text-offset-x="${offsetX}" data-canvas-text-offset-y="${offsetY}" data-canvas-text-offset-basis="${offsetBasis}"${offsetX || offsetY ? " data-canvas-text-custom-layout" : ""}${align ? ` data-canvas-text-align="${align}"` : ""}${color ? ` data-canvas-text-color="${color}"` : ""}${font ? ` data-animation-font-style="${font}"` : ""} style="--canvas-text-scale:${scale / 100};--canvas-text-width:${width}%;--canvas-text-offset-x:${offsetX}%;--canvas-text-offset-y:${offsetY}%;${align ? `--canvas-text-align:${align};` : ""}${color ? `--canvas-text-color:${color};` : ""}"`;
}

export type SiteSectionViewport = "desktop" | "mobile";
export const SITE_SECTION_MIN_HEIGHT = 180;
export const SITE_SECTION_MAX_HEIGHT = 1800;

export function activeSiteSectionViewport(): SiteSectionViewport {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches
    ? "mobile"
    : "desktop";
}

export function applySiteSectionPreviewHeight(section: HTMLElement, heightPx: number | null, viewport: SiteSectionViewport): void {
  const attribute = viewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const property = viewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  if (heightPx === null) {
    section.removeAttribute(attribute);
    section.style.removeProperty(property);
    return;
  }
  const height = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(heightPx)));
  section.setAttribute(attribute, String(height));
  section.style.setProperty(property, `${height}px`);
}
