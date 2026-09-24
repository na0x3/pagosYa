/** Applies a store's colors, fonts, and section backgrounds to the page. */
import { Store } from "../api";
import { sanitizeSiteDocument } from "../site-document";
import { state } from "../state";
import { storePreviewMode } from "../preview-mode";
import { app } from "../ui/app";
import { backgroundTheme, clampAccentLightness, accentContrastColor, DEFAULT_ACCENT_PALETTES } from "../ui/color";


export function applyStoreSectionBackgrounds(store: Store): void {
  const configured = store.sectionBackgrounds && typeof store.sectionBackgrounds === "object"
    ? store.sectionBackgrounds
    : {};
  const targets: Record<string, string> = {
    hero: ".store-carousel, .store-hero",
    products: ".store-products",
    about: ".store-about",
    gallery: ".store-editorial-gallery",
    links: ".store-footer",
    contact: ".store-contact-section",
    location: ".store-location-section",
  };
  Object.entries(targets).forEach(([section, selector]) => {
    app.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.dataset.storeSectionKey = section;
      const color = configured[section];
      if (!/^#[0-9a-f]{6}$/i.test(color || "")) return;
      const text = backgroundTheme(color).textColor;
      element.style.setProperty("--store-section-background", color);
      element.style.setProperty("--store-section-text", text);
      element.style.setProperty("--pg-text", text);
      element.style.setProperty("--pg-text-muted", `color-mix(in srgb, ${text} 76%, ${color})`);
      element.style.setProperty("--pg-text-faint", `color-mix(in srgb, ${text} 62%, ${color})`);
    });
  });
  app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]").forEach((element) => {
    const section = `animation-${element.dataset.animationId}`;
    element.dataset.storeSectionKey = section;
    const color = configured[section];
    if (!/^#[0-9a-f]{6}$/i.test(color || "")) return;
    const text = backgroundTheme(color).textColor;
    element.style.setProperty("--store-section-background", color);
    element.style.setProperty("--store-section-text", text);
    element.style.setProperty("--pg-text", text);
    element.style.setProperty("--pg-text-muted", `color-mix(in srgb, ${text} 76%, ${color})`);
      element.style.setProperty("--pg-text-faint", `color-mix(in srgb, ${text} 62%, ${color})`);
  });
  app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-section]").forEach((element) => {
    const siteId = element.dataset.siteSection;
    if (!siteId) return;
    const section = `site-${siteId}`;
    element.dataset.storeSectionKey = section;
    const authoredSection = store.siteDocument?.sections?.find((candidate) => candidate.id === siteId);
    const configuredColor = configured[section];
    const hasConfiguredColor = /^#[0-9a-f]{6}$/i.test(configuredColor || "");
    const color = hasConfiguredColor ? configuredColor : authoredSection?.backgroundColor;
    if (!color) return;
    const text = hasConfiguredColor ? backgroundTheme(color).textColor : authoredSection?.textColor || backgroundTheme(color).textColor;
    element.style.setProperty("--zone-bg", color);
    element.style.setProperty("--zone-ink", text);
    element.style.setProperty("--store-section-background", color);
    element.style.setProperty("--store-section-text", text);
    element.style.setProperty("--pg-text", text);
    element.style.setProperty("--pg-text-muted", `color-mix(in srgb, ${text} 76%, ${color})`);
    element.style.setProperty("--pg-text-faint", `color-mix(in srgb, ${text} 62%, ${color})`);
  });
}

export function applyStoreTheme(slug: string, store: Store): void {
  state.currentStoreSlug = slug;
  if (storePreviewMode) state.activePreviewStore = { slug, store };
  document.body.classList.remove("payment-page", "payment-success-page", "debt-collection-page");
  document.body.classList.add("store-page");
  const siteDocument = sanitizeSiteDocument(store.siteDocument);
  document.body.classList.toggle("has-bespoke-site", Boolean(siteDocument));
  if (siteDocument) {
    store.siteDocument = siteDocument;
    document.body.dataset.siteArtDirection = siteDocument.artDirection || "custom";
    document.body.dataset.siteHeadingFont = siteDocument.theme.headingFont;
    document.body.dataset.siteBodyFont = siteDocument.theme.bodyFont;
    document.body.dataset.siteNav = siteDocument.navigation.layout;
    document.body.dataset.siteHeaderStyle = "full";
    document.body.dataset.siteBrandPosition = siteDocument.navigation.brandPosition || (siteDocument.navigation.layout === "centered" ? "center" : "left");
    document.body.dataset.siteNavPosition = siteDocument.navigation.navPosition || (siteDocument.navigation.layout === "split" ? "left" : "center");
    document.body.dataset.siteSearchPosition = siteDocument.navigation.searchPosition || "right";
    document.body.dataset.siteProfilePosition = siteDocument.navigation.profilePosition || "right";
    document.body.dataset.siteCartPosition = siteDocument.navigation.cartPosition || "right";
    document.body.dataset.siteSticky = String(siteDocument.navigation.sticky);
    document.body.dataset.siteTransparent = String(siteDocument.navigation.transparent);
    document.body.dataset.siteProducts = siteDocument.theme.productLayout;
    document.body.dataset.siteShadow = siteDocument.theme.shadow;
    document.body.dataset.siteScale = siteDocument.theme.displayScale;
    document.body.dataset.siteDensity = siteDocument.theme.density;
    document.body.dataset.siteImageTreatment = siteDocument.theme.imageTreatment;
    document.body.dataset.siteLogoTreatment = siteDocument.navigation.logoTreatment;
    document.body.dataset.siteMotionIntensity = siteDocument.motion.intensity;
    document.body.dataset.siteSpotlight = siteDocument.merchandising.spotlightLayout;
    document.body.dataset.siteComposition = siteDocument.designGenome.composition;
    document.body.dataset.siteRhythm = siteDocument.designGenome.rhythm;
    document.body.dataset.siteGeometry = siteDocument.designGenome.geometry;
    document.body.dataset.siteColorStrategy = siteDocument.designGenome.colorStrategy;
    document.body.dataset.siteMediaStrategy = siteDocument.designGenome.mediaStrategy;
    document.body.dataset.siteTypeScale = siteDocument.designGenome.typeScale;
    document.body.dataset.siteMotionLanguage = siteDocument.designGenome.motionLanguage;
    document.documentElement.style.setProperty("--site-page", siteDocument.theme.pageBackground);
    document.documentElement.style.setProperty("--site-ink", siteDocument.theme.textColor);
    document.documentElement.style.setProperty("--site-accent", siteDocument.theme.accentColor);
    document.documentElement.style.setProperty("--site-secondary", siteDocument.theme.secondaryColor);
    document.documentElement.style.setProperty("--site-surface", siteDocument.theme.surfaceColor);
    document.documentElement.style.setProperty("--site-muted", siteDocument.theme.mutedColor);
    document.documentElement.style.setProperty("--site-border", siteDocument.theme.borderColor);
    document.documentElement.style.setProperty("--site-radius", `${siteDocument.theme.radius}px`);
  } else {
    delete document.body.dataset.siteArtDirection;
    delete document.body.dataset.siteHeadingFont;
    delete document.body.dataset.siteBodyFont;
    delete document.body.dataset.siteNav;
    delete document.body.dataset.siteHeaderStyle;
    delete document.body.dataset.siteBrandPosition;
    delete document.body.dataset.siteNavPosition;
    delete document.body.dataset.siteSearchPosition;
    delete document.body.dataset.siteProfilePosition;
    delete document.body.dataset.siteCartPosition;
    delete document.body.dataset.siteSticky;
    delete document.body.dataset.siteTransparent;
    delete document.body.dataset.siteProducts;
    delete document.body.dataset.siteShadow;
    delete document.body.dataset.siteScale;
    delete document.body.dataset.siteDensity;
    delete document.body.dataset.siteImageTreatment;
    delete document.body.dataset.siteLogoTreatment;
    delete document.body.dataset.siteMotionIntensity;
    delete document.body.dataset.siteSpotlight;
    delete document.body.dataset.siteComposition;
    delete document.body.dataset.siteRhythm;
    delete document.body.dataset.siteGeometry;
    delete document.body.dataset.siteColorStrategy;
    delete document.body.dataset.siteMediaStrategy;
    delete document.body.dataset.siteTypeScale;
    delete document.body.dataset.siteMotionLanguage;
  }

  // Storefront branding is per-store, not per-page. Set it for both the
  // catalog and product routes so a shared product link still feels wholly
  // owned by the merchant and never inherits another store's appearance.
  const solidBackground = siteDocument?.theme.pageBackground || store.backgroundColor || "#0a0a0a";
  document.documentElement.style.setProperty("--pg-page-bg", solidBackground);
  const pageTheme = { background: solidBackground, ...backgroundTheme(solidBackground) };
  document.documentElement.style.setProperty("--pg-page-background", pageTheme.background);
  // The store canvas is always color-led. Legacy backgroundImageUrl values are
  // intentionally ignored; photography belongs to heroes and story sections.
  document.body.classList.remove("has-bg-image");
  const useLightTheme = pageTheme.light;
  if (useLightTheme) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  // Storefront copy is deliberately binary: never let a generic gray token
  // drift into a merchant canvas where it can blend with a mid-tone color.
  // The higher-contrast choice between pure black and pure white becomes the
  // primary, muted, and faint foreground for every catalog and product route.
  for (const property of ["--pg-text", "--pg-text-muted", "--pg-text-faint"]) {
    document.documentElement.style.setProperty(property, pageTheme.textColor);
  }

  const authoredAccent = siteDocument?.theme.accentColor || store.accentColor;
  if (authoredAccent) {
    const effectiveAccent = clampAccentLightness(authoredAccent);
    document.documentElement.style.setProperty("--pg-accent", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-2", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-contrast", accentContrastColor(effectiveAccent));
  } else {
    const palette = DEFAULT_ACCENT_PALETTES[useLightTheme ? "light" : "dark"];
    document.documentElement.style.setProperty("--pg-accent", palette.accent);
    document.documentElement.style.setProperty("--pg-accent-2", palette.accent2);
    document.documentElement.style.setProperty("--pg-accent-contrast", palette.contrast);
  }
  document.body.classList.toggle("has-custom-accent", !!authoredAccent);
  document.body.dataset.fontStyle = store.fontStyle || "modern";
  document.body.dataset.buttonStyle = store.buttonStyle || "rounded";
  document.body.dataset.buttonVariant = store.buttonVariant || "solid";
  document.body.dataset.buttonMotion = store.buttonMotion || "lift";
  document.body.dataset.boardTexture = store.boardTexture || "chalkboard";
  // A generated site document owns its composition. Letting an older store
  // layout leak through here made otherwise-desktop heroes inherit compact
  // catalog-first heights or collage insets inside the appearance preview.
  document.body.dataset.layoutStyle = siteDocument ? "cinematic" : store.layoutStyle || "cinematic";
}
