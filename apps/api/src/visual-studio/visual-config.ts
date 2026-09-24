/** Store fields the visual editor owns, and conversions between them and the site document. */
import { NotFoundException } from "@nestjs/common";
import { Store, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { STORE_MOTION_EXPERIENCES, type StoreFontStyle, STORE_FONT_STYLES } from "../stores/dto/store-options";
import { type AiSiteDocument, type StoreSiteDocument, siteDocumentJson } from "./site-document";


export const VISUAL_FIELDS = [
  "tagline", "bannerUrl", "backgroundColor", "backgroundMode", "backgroundGradientStart", "backgroundGradientEnd", "backgroundGradientAngle", "backgroundImageUrl", "aboutText", "aboutTitle", "aboutSubtitle", "aboutImageUrl",
  "catalogTitle", "catalogSubtitle", "galleryTitle", "gallerySubtitle", "linksTitle", "contactTitle", "contactSubtitle", "locationTitle", "locationSubtitle", "sectionBackgrounds",
  "accentColor", "fontStyle", "buttonStyle", "boardTexture", "announcement", "announcementMode",
  "announcementSpeed", "announcementSize", "announcementColor", "announcementFont", "announcementEffect", "promotionEnabled", "promotionImageUrl", "promotionTitle",
  "promotionBody", "promotionCtaLabel", "promotionCtaUrl", "heroSlides", "contentOrder", "layoutStyle", "experienceStyle", "motionDuoEnabled", "motionExperience", "motionExperiences", "animations", "editorialGallery",
  "buttonVariant", "buttonMotion", "cartButtonLabel", "siteDocument", "checkoutMode", "leadCaptureUrl", "contactPhone", "contactFormEnabled",
] as const;

export type VisualField = (typeof VISUAL_FIELDS)[number];
export type VisualConfig = Partial<Record<VisualField, unknown>>;
export type StoreProductContext = { id: string; name: string; description: string | null; imageUrls: string[]; tags: string[] };
export type StoreLinkContext = { label: string; url: string };

export type ProposalPreset = {
  title: string;
  rationale: string;
  config: VisualConfig;
};

export type AiDirection = { title: string; rationale: string; siteDocument: AiSiteDocument };
export type MaterializedAiDirection = Omit<AiDirection, "siteDocument"> & { siteDocument: StoreSiteDocument };

export const CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "motion", "links"] as const;
// This is the only animation inventory the AI composition path may use. The
// model never supplies component names or executable motion code.
export const MOTION_EXPERIENCES = STORE_MOTION_EXPERIENCES;
export const TEXT_MOTION_EXPERIENCES = new Set([
  "clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
]);

export function legacyConfigFromSiteDocument(document: StoreSiteDocument): VisualConfig {
  const hero = document.sections.find((section) => section.kind === "hero");
  const story = document.sections.find((section) => section.kind === "story");
  const catalog = document.sections.find((section) => section.kind === "catalog");
  const gallery = document.sections.find((section) => section.kind === "gallery");
  const contact = document.sections.find((section) => section.kind === "contact");
  const location = document.sections.find((section) => section.kind === "location");
  const links = document.sections.find((section) => section.kind === "links");
  const legacyOrder = document.sections.flatMap((section) => {
    if (section.kind === "catalog") return ["products"];
    if (section.kind === "story") return ["about"];
    if (section.kind === "hero" || section.kind === "gallery" || section.kind === "links") return [section.kind];
    return [];
  });
  const contentOrder = [...new Set(legacyOrder)].filter((section) => CONTENT_SECTIONS.includes(section as (typeof CONTENT_SECTIONS)[number]));
  for (const section of CONTENT_SECTIONS) if (!contentOrder.includes(section)) contentOrder.push(section);
  const fontStyle: StoreFontStyle = document.theme.headingFont === "artisan"
    ? "artisan"
    : document.theme.headingFont === "condensed"
      ? "condensed"
      : document.theme.headingFont === "luxury"
        ? "luxury"
        : document.theme.headingFont === "editorial" || document.theme.headingFont === "classic"
          ? "editorial"
          : document.theme.headingFont === "humanist"
            ? "friendly"
            : "modern";
  return {
    siteDocument: siteDocumentJson(document),
    tagline: hero?.title ?? document.direction,
    aboutTitle: story?.title ?? "",
    aboutSubtitle: story?.body ?? "",
    aboutText: story?.body ?? "",
    catalogTitle: catalog?.title ?? "La tienda",
    catalogSubtitle: catalog?.body ?? "",
    galleryTitle: gallery?.title ?? "",
    gallerySubtitle: gallery?.body ?? "",
    contactFormEnabled: true,
    contactTitle: contact?.title ?? "¿Tienes una pregunta?",
    contactSubtitle: contact?.body ?? "",
    locationTitle: location?.title ?? "Visítanos",
    locationSubtitle: location?.body ?? "",
    linksTitle: links?.title ?? "Síguenos",
    backgroundColor: document.theme.pageBackground,
    backgroundMode: "solid",
    backgroundGradientStart: document.theme.pageBackground,
    backgroundGradientEnd: document.theme.pageBackground,
    backgroundGradientAngle: 0,
    backgroundImageUrl: null,
    accentColor: document.theme.accentColor,
    announcementColor: document.theme.secondaryColor,
    fontStyle,
    contentOrder,
    heroSlides: [],
    editorialGallery: [],
    motionDuoEnabled: false,
    motionExperiences: [],
    animations: [],
  };
}

export function snapshot(store: Store): Prisma.InputJsonObject {
  return Object.fromEntries(VISUAL_FIELDS.map((field) => [field, store[field] ?? null])) as Prisma.InputJsonObject;
}

export function normalizeStoreFontStyle(value: unknown): StoreFontStyle {
  return STORE_FONT_STYLES.includes(value as StoreFontStyle) ? value as StoreFontStyle : "modern";
}

export function storedSiteDocument(value: unknown): StoreSiteDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const document = value as Partial<StoreSiteDocument>;
  return document.version === 1 && Array.isArray(document.sections) && document.theme && document.navigation
    ? document as StoreSiteDocument
    : null;
}

export function storedSectionLocks(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && /^[a-z][a-z0-9-]{1,47}$/.test(id)).slice(0, 12)
    : [];
}

export function toStoreUpdate(config: unknown): Prisma.StoreUpdateInput {
  const value = config && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : {};
  const allowed = Object.fromEntries(VISUAL_FIELDS.filter((field) => field in value).map((field) => [field, value[field]]));
  if ("fontStyle" in allowed) allowed.fontStyle = normalizeStoreFontStyle(allowed.fontStyle);
  if (typeof allowed.experienceStyle === "string") {
    allowed.experienceStyle = allowed.experienceStyle === "story-scroller" ? "story-scroller" : "editorial-grid";
  }
  if (Array.isArray(allowed.motionExperiences)) {
    allowed.motionExperiences = allowed.motionExperiences.filter((entry) =>
      typeof entry === "string" && MOTION_EXPERIENCES.includes(entry as (typeof MOTION_EXPERIENCES)[number]),
    );
  }
  if (typeof allowed.motionExperience === "string" && !MOTION_EXPERIENCES.includes(allowed.motionExperience as (typeof MOTION_EXPERIENCES)[number])) {
    allowed.motionExperience = "clarity-marquee";
  }
  if (Array.isArray(allowed.animations)) {
    const supportedAnimations = allowed.animations.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      return MOTION_EXPERIENCES.includes((entry as Record<string, unknown>).type as (typeof MOTION_EXPERIENCES)[number]);
    });
    allowed.animations = supportedAnimations;
    allowed.motionDuoEnabled = supportedAnimations.length > 0;
  }
  if (allowed.siteDocument && typeof allowed.siteDocument === "object" && !Array.isArray(allowed.siteDocument)) {
    const document = structuredClone(allowed.siteDocument) as Record<string, any>;
    if (document.experience && typeof document.experience === "object" && !TEXT_MOTION_EXPERIENCES.has(document.experience.type)) {
      document.experience = { ...document.experience, type: "none", mediaUrls: [] };
    }
    allowed.siteDocument = document;
  }
  return allowed as Prisma.StoreUpdateInput;
}

/** A store the merchant owns, or 404. */
export async function ownedStore(prisma: PrismaService, merchantId: string, storeId: string): Promise<Store> {
  const store = await prisma.store.findFirst({ where: { id: storeId, merchantId } });
  if (!store) throw new NotFoundException("Store not found");
  return store;
}
