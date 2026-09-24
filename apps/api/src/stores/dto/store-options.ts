/** Allowed values for store presentation settings, shared by the store DTOs and the services that normalize them. */

export const STORE_MOTION_EXPERIENCES = [
  "story-scroll",
  "hero-carousel",
  "image-stream",
  "scroll-expansion",
  "hero-gallery-scroll",
  "stagger-testimonials",
  "portfolio-scroller",
  "circle-reveal",
  "clarity-marquee",
  "layered-text",
  "text-rotate",
  "text-glitch",
  "text-reveal-block",
  "text-along-path",
  "full-screen-chapters",
  "magnetic-target",
  "frame-sequence",
  "video-background",
  "draggable-cards",
  "perspective-carousel",
  "link-preview",
  "video-pin-reveal",
  "gallery-accordion",
  "split-scroll",
  "sticky-gallery",
  "sticky-story",
  "text-parallax",
] as const;
export const STORE_ANIMATION_TEXT_ALIGNS = ["left", "center", "right"] as const;
export const STORE_ANIMATION_TEXT_SIZES = ["small", "medium", "large"] as const;
export const STORE_ANIMATION_TEXT_WIDTHS = ["narrow", "medium", "wide"] as const;
export const STORE_FONT_STYLES = ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"] as const;
export type StoreFontStyle = (typeof STORE_FONT_STYLES)[number];
export const STORE_ANNOUNCEMENT_FONTS = ["store", ...STORE_FONT_STYLES] as const;
export const STORE_ANNOUNCEMENT_EFFECTS = ["none", "wave", "pulse", "sparkle"] as const;
export const STORE_ANIMATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
export const STORE_ANIMATION_SECTION_PATTERN = /^animation-[a-z0-9][a-z0-9_-]{0,47}$/;
export const STORE_SITE_SECTION_PATTERN = /^site-[a-z][a-z0-9-]{1,47}$/;
export const STORE_BASE_CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "links", "contact", "location"] as const;
export const STORE_LEGACY_REQUIRED_CONTENT_SECTIONS = STORE_BASE_CONTENT_SECTIONS.filter((section) => !["contact", "location"].includes(section));
export const STORE_MOTION_CONTENT_SECTIONS = [
  "motion-story-scroll",
  "motion-hero-carousel",
  "motion-image-stream",
  "motion-scroll-expansion",
  "motion-hero-gallery-scroll",
  "motion-stagger-testimonials",
  "motion-portfolio-scroller",
  "motion-circle-reveal",
  "motion-clarity-marquee",
  "motion-layered-text",
  "motion-text-rotate",
  "motion-text-glitch",
  "motion-text-reveal-block",
  "motion-text-along-path",
  "motion-full-screen-chapters",
  "motion-magnetic-target",
  "motion-frame-sequence",
  "motion-video-background",
] as const;
// `motion` remains accepted so stores saved by the previous editor can be
// expanded in place. New editors persist one section key per animation.
export const STORE_CONTENT_SECTIONS = [
  ...STORE_BASE_CONTENT_SECTIONS,
  "motion",
  ...STORE_MOTION_CONTENT_SECTIONS,
] as const;
