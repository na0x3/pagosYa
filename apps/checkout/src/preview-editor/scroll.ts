/** Scrolls the preview to the section or item being edited. */
import { type StorePreviewSection } from "../preview-mode";
import { app } from "../ui/app";


export function scrollStorePreviewToSection(section: StorePreviewSection | `animation-${string}` | `site-${string}`): void {
  if (section.startsWith("animation-")) {
    window.requestAnimationFrame(() => {
      const id = section.slice("animation-".length);
      const target = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
        .find((entry) => entry.dataset.animationId === id);
      if (target) scrollStorePreviewToElement(target);
    });
    return;
  }
  if (section.startsWith("site-")) {
    window.requestAnimationFrame(() => {
      const id = section.slice("site-".length);
      const target = Array.from(app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-section]"))
        .find((entry) => entry.dataset.siteSection === id);
      if (target) scrollStorePreviewToElement(target);
    });
    return;
  }
  const selectors: Record<StorePreviewSection, string> = {
    brand: ".merchant-header",
    navigation: ".store-site-nav, .merchant-header",
    announcement: ".store-announcement, .merchant-header",
    hero: ".store-carousel, .store-hero, .merchant-header",
    products: ".store-products",
    about: ".store-about, .store-products",
    gallery: ".store-editorial-gallery, .store-products",
    motion: ".store-motion-section, .store-editorial-gallery, .store-products",
    contact: ".store-contact-section, .store-footer, .secure-note",
    links: ".store-footer, .secure-note",
    location: ".store-location-section, .secure-note",
    footer: ".store-site-footer, .secure-note",
    promotion: ".promotion-dialog, .merchant-header",
  };
  window.requestAnimationFrame(() => {
    const target = app.querySelector<HTMLElement>(selectors[section as StorePreviewSection]);
    if (!target) return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // scrollIntoView can propagate through an iframe and move the merchant
    // dashboard. Scrolling this window directly keeps all movement inside the
    // storefront preview while preserving the editor's page position.
    window.scrollTo({ top: storePreviewScrollTop(target), behavior: reduceMotion ? "auto" : "smooth" });
  });
}

export function storePreviewScrollTop(target: HTMLElement): number {
  const targetRect = target.getBoundingClientRect();
  const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const maxTop = Math.max(0, documentHeight - window.innerHeight);
  const absoluteTop = window.scrollY + targetRect.top;
  // Center compact controls, but align long storefront sections near their
  // beginning. Centering a multi-viewport animation jumps thousands of pixels
  // into its scroll track and makes the preview appear blank or broken.
  const topInset = Math.min(96, Math.max(20, Math.round(window.innerHeight * .14)));
  const proposedTop = targetRect.height >= window.innerHeight * .9
    ? absoluteTop - topInset
    : absoluteTop - (window.innerHeight - targetRect.height) / 2;
  return Math.max(0, Math.min(proposedTop, maxTop));
}

export function scrollStorePreviewToElement(target: HTMLElement): void {
  const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: storePreviewScrollTop(target), behavior: reduceMotion ? "auto" : "smooth" });
}

export function scrollStorePreviewToMotion(): void {
  window.requestAnimationFrame(() => {
    const target = app.querySelector<HTMLElement>(".store-motion-section, .store-editorial-gallery");
    if (target) scrollStorePreviewToElement(target);
  });
}

export function scrollStorePreviewToHeroItem(index: number): void {
  window.requestAnimationFrame(() => {
    const carousel = app.querySelector<HTMLElement>(".store-carousel");
    const dots = Array.from(app.querySelectorAll<HTMLButtonElement>(".store-carousel-dots [data-slide-to]"));
    if (dots.length) dots[Math.min(Math.max(0, index), dots.length - 1)]?.click();
    const target = carousel || app.querySelector<HTMLElement>(".store-hero, .merchant-header");
    if (target) scrollStorePreviewToElement(target);
  });
}

export function scrollStorePreviewToEditorialItem(index: number, _kind: "media" | "text"): void {
  window.requestAnimationFrame(() => {
    const safeIndex = Math.max(0, index);
    const storyTabs = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-story-to]"));
    const storyPanels = Array.from(app.querySelectorAll<HTMLElement>(".store-story-panel"));
    if (storyTabs.length && storyPanels.length) {
      const targetIndex = Math.min(safeIndex, Math.min(storyTabs.length, storyPanels.length) - 1);
      storyTabs.forEach((tab, tabIndex) => tab.setAttribute("aria-selected", String(tabIndex === targetIndex)));
      storyPanels.forEach((panel, panelIndex) => {
        const active = panelIndex === targetIndex;
        panel.classList.toggle("active", active);
        panel.setAttribute("aria-hidden", String(!active));
        panel.inert = !active;
      });
      const gallery = app.querySelector<HTMLElement>(".store-editorial-gallery");
      if (gallery) scrollStorePreviewToElement(gallery);
      return;
    }

    const flowSections = Array.from(app.querySelectorAll<HTMLElement>(".store-flow-section"));
    if (flowSections.length) {
      scrollStorePreviewToElement(flowSections[Math.min(safeIndex, flowSections.length - 1)]);
      return;
    }

    const motionSection = app.querySelector<HTMLElement>(".store-motion-section");
    if (motionSection) {
      scrollStorePreviewToElement(motionSection);
      return;
    }

    scrollStorePreviewToSection("gallery");
  });
}
