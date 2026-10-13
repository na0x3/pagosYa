import { resolveSiteSectionFamily } from "@pagosya/shared-types";
import { assetUrl } from "../api";
import { type StoreSiteDocument } from "../site-document";
import { escapeHtml } from "../ui/html";
import { ICON_ARROW_RIGHT } from "../ui/icons";
import { isVideoMediaUrl } from "../ui/media";
import { canvasTextStyleAttributes } from "./motion";
import type { FidelityImageHtml } from "./store-fidelity-media";

export type StoreBespokeSectionContext = {
  siteDocument: StoreSiteDocument | null;
  siteSectionsForPage: StoreSiteDocument["sections"];
  visibleStoreName: string;
  fidelityImageHtml: FidelityImageHtml;
  carouselHtml: string;
  editorialGalleryHtml: string;
  productsHtml: string;
  appointmentsHtml: string;
  contactHtml: string;
  locationHtml: string;
  linksHtml: string;
};

/** Renders an AI-authored site section (hero, story, gallery, catalog, contact, location, links) into its bespoke zone. */
export function storeBespokeSectionRenderer({
  siteDocument,
  siteSectionsForPage,
  visibleStoreName,
  fidelityImageHtml,
  carouselHtml,
  editorialGalleryHtml,
  productsHtml,
  appointmentsHtml,
  contactHtml,
  locationHtml,
  linksHtml,
}: StoreBespokeSectionContext) {
  const siteBlockAttribute = (block: NonNullable<StoreSiteDocument["sections"][number]["blocks"]>[number]) => ` data-site-block="${escapeHtml(block.id)}" data-site-slot="${escapeHtml(block.slot)}" data-site-block-kind="${block.kind}" data-site-block-role="${block.role}"`;
  const siteBlocks = (section: StoreSiteDocument["sections"][number]) => section.blocks ?? [];
  const siteBlockMedia = (section: StoreSiteDocument["sections"][number]) => siteBlocks(section).filter((block) => block.kind === "media" && block.mediaUrl);
  const bespokeMediaHtml = (section: StoreSiteDocument["sections"][number]) => {
    const blocks = siteBlockMedia(section);
    const sources = blocks.length ? blocks.map((block) => block.mediaUrl!).filter(Boolean) : section.mediaUrls;
    const media = sources.flatMap((source, index) => {
      const resolved = assetUrl(source);
      if (!resolved) return [];
      const label = section.title || `${visibleStoreName || "La tienda"}, imagen ${index + 1}`;
      const attribute = blocks[index] ? siteBlockAttribute(blocks[index]) : "";
      return [isVideoMediaUrl(resolved)
        ? `<video${attribute} src="${escapeHtml(resolved)}" aria-label="${escapeHtml(label)}" muted loop playsinline preload="metadata" ${index === 0 ? "autoplay" : ""}></video>`
        : `<div class="site-block-media"${attribute}>${fidelityImageHtml(resolved, source, label, { eager: section.kind === "hero" && index === 0 })}</div>`];
    }).join("");
    if (!media) return "";
    const family = resolveSiteSectionFamily(section.kind, section.family, siteDocument!.designGenome);
    const horizontallyScrollable = sources.length > 1 && (section.layout === "rail" || (section.kind === "gallery" && family === "cinematic"));
    const scrollRegion = horizontallyScrollable
      ? ` data-store-drag-scroll role="region" aria-label="${escapeHtml(section.title ? `Galería desplazable: ${section.title}` : "Galería desplazable")}" tabindex="0"`
      : "";
    return `<div class="bespoke-media" data-count="${sources.length}"${scrollRegion}>${media}</div>`;
  };
  const bespokeStoryFlowHtml = (section: StoreSiteDocument["sections"][number]) => {
    const chapterBlocks = siteBlocks(section).filter((block) => block.kind === "group" && block.slot === "chapters").slice(0, 3);
    const scenes = chapterBlocks.length >= 2 ? chapterBlocks.flatMap((block) => {
      const heading = block.children.find((child) => child.kind === "heading");
      const body = block.children.find((child) => child.kind === "text");
      const media = block.children.find((child) => child.kind === "media" && child.mediaUrl);
      const resolved = media?.mediaUrl ? assetUrl(media.mediaUrl) : null;
      return resolved ? [{
        source: media!.mediaUrl!, resolved, title: heading?.text || section.title, body: body?.text || section.body,
        titleStyle: heading?.style || section.titleStyle, bodyStyle: body?.style || section.bodyStyle,
        block, headingBlock: heading, bodyBlock: body, mediaBlock: media,
      }] : [];
    }) : section.mediaUrls.slice(0, 3).flatMap((source, index) => {
      const resolved = assetUrl(source);
      if (!resolved) return [];
      const item = section.items.find((candidate) => candidate.mediaUrl === source) ?? section.items[index];
      return [{
        source,
        resolved,
        title: item?.title || section.title,
        body: item?.body || section.body,
        titleStyle: item?.titleStyle || section.titleStyle,
        bodyStyle: item?.bodyStyle || section.bodyStyle,
        block: null,
        headingBlock: null,
        bodyBlock: null,
        mediaBlock: null,
      }];
    });
    if (scenes.length < 2) return "";
    return `<div class="store-flow-art bespoke-story-flow" data-motion-flow aria-label="${escapeHtml(section.title || "Historia de la marca")}">
      ${scenes.map((scene, index) => `<article class="store-flow-section" style="--flow-index:${index}"${scene.block ? siteBlockAttribute(scene.block) : ""}>
        <div class="store-flow-inner">
          <div class="store-flow-copy"><span>${String(index + 1).padStart(2, "0")}</span>${scene.title ? `<h3${scene.headingBlock ? siteBlockAttribute(scene.headingBlock) : ""}${canvasTextStyleAttributes(scene.titleStyle)}>${escapeHtml(scene.title)}</h3>` : ""}${scene.body ? `<p${scene.bodyBlock ? siteBlockAttribute(scene.bodyBlock) : ""}${canvasTextStyleAttributes(scene.bodyStyle)}>${escapeHtml(scene.body)}</p>` : ""}</div>
          <figure${scene.mediaBlock ? siteBlockAttribute(scene.mediaBlock) : ""}>${isVideoMediaUrl(scene.resolved)
            ? `<video src="${escapeHtml(scene.resolved)}" aria-label="${escapeHtml(scene.title || `Escena ${index + 1}`)}" muted loop playsinline preload="metadata" controls></video>`
            : fidelityImageHtml(scene.resolved, scene.source, scene.title || `Escena ${index + 1}`)}</figure>
        </div>
      </article>`).join("")}
    </div>`;
  };
  const bespokeFrame = (
    section: StoreSiteDocument["sections"][number],
    content: string,
    element: "section" | "div" = "section",
    modifier = "",
  ) => {
    if (!content) return "";
    const label = section.title ? ` aria-label="${escapeHtml(section.title)}"` : "";
    const family = resolveSiteSectionFamily(section.kind, section.family, siteDocument!.designGenome);
    const position = siteSectionsForPage.findIndex((candidate) => candidate.id === section.id);
    const opening = position === 0 ? " is-site-opening" : "";
    const desktopHeight = Number.isInteger(section.heightPx) ? section.heightPx! : null;
    const mobileHeight = Number.isInteger(section.mobileHeightPx) ? section.mobileHeightPx! : null;
    const positionedPrimaryCopy = Boolean(
      section.titleStyle?.textOffsetBasis === "section"
      || section.bodyStyle?.textOffsetBasis === "section"
      || siteBlocks(section).some((block) => ["heading", "body", "action"].includes(block.id) && block.style?.textOffsetBasis === "section"),
    );
    const sizingClass = positionedPrimaryCopy ? " has-section-positioned-copy" : "";
    const sizingAttributes = `${desktopHeight !== null ? ` data-site-height-desktop="${desktopHeight}"` : ""}${mobileHeight !== null ? ` data-site-height-mobile="${mobileHeight}"` : ""}`;
    const sizingStyle = `${desktopHeight !== null ? `;--site-section-height-desktop:${desktopHeight}px` : ""}${mobileHeight !== null ? `;--site-section-height-mobile:${mobileHeight}px` : ""}`;
    return `<${element} id="site-section-${escapeHtml(section.id)}" class="bespoke-zone bespoke-${section.kind}${opening}${sizingClass}${modifier ? ` ${modifier}` : ""}" data-site-section="${escapeHtml(section.id)}" data-site-kind="${section.kind}" data-site-position="${position}" data-site-family="${family}" data-site-layout="${section.layout}" data-site-width="${section.width}" data-site-align="${section.align}" data-site-motion="${section.motion}"${sizingAttributes} style="--zone-bg:${section.backgroundColor};--zone-ink:${section.textColor}${sizingStyle}"${label}>${content}</${element}>`;
  };
  const bespokeCopy = (section: StoreSiteDocument["sections"][number], showCta = false) => {
    const headingElement = section.kind === "hero" ? "h1" : "h2";
    const copyBlocks = siteBlocks(section).filter((block) => ["heading", "text", "action"].includes(block.kind));
    if (!copyBlocks.length) return `<div class="bespoke-copy">
      ${section.title ? `<${headingElement}${canvasTextStyleAttributes(section.titleStyle)}>${escapeHtml(section.title)}</${headingElement}>` : ""}
      ${section.body ? `<p${canvasTextStyleAttributes(section.bodyStyle)}>${escapeHtml(section.body)}</p>` : ""}
      ${showCta && section.ctaLabel ? `<button type="button" class="bespoke-cta hero-catalog-cta">${escapeHtml(section.ctaLabel)}${ICON_ARROW_RIGHT}</button>` : ""}
    </div>`;
    const renderCopyBlock = (block: (typeof copyBlocks)[number], free = false) => {
      const attributes = siteBlockAttribute(block);
      const freeClass = free ? " class=\"site-free-canvas-text\"" : "";
      if (block.kind === "heading") return block.text ? `<${headingElement}${freeClass}${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</${headingElement}>` : "";
      if (block.kind === "text") return block.text ? `<p${freeClass}${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</p>` : "";
      return block.text ? `<button type="button" class="bespoke-cta hero-catalog-cta${free ? " site-free-canvas-text" : ""}"${attributes}${free ? canvasTextStyleAttributes(block.style) : ""}>${escapeHtml(block.text)}${ICON_ARROW_RIGHT}</button>` : "";
    };
    const flowBlocks = copyBlocks.filter((block) => ["heading", "body", "action"].includes(block.id));
    const freeBlocks = copyBlocks.filter((block) => !["heading", "body", "action"].includes(block.id));
    return `<div class="bespoke-copy">${flowBlocks.map((block) => renderCopyBlock(block)).join("")}</div>${freeBlocks.length ? `<div class="bespoke-free-copy-layer">${freeBlocks.map((block) => renderCopyBlock(block, true)).join("")}</div>` : ""}`;
  };
  const bespokeAdditionalCopy = (section: StoreSiteDocument["sections"][number]) => {
    const additionalBlocks = siteBlocks(section).filter((block) =>
      ["heading", "text", "action"].includes(block.kind) && !["heading", "body", "action"].includes(block.id));
    if (!additionalBlocks.length) return "";
    return `<div class="bespoke-free-copy-layer bespoke-copy-additional">${additionalBlocks.map((block) => {
      const attributes = siteBlockAttribute(block);
      if (block.kind === "heading") return block.text ? `<h2 class="site-free-canvas-text"${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</h2>` : "";
      if (block.kind === "text") return block.text ? `<p class="site-free-canvas-text"${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</p>` : "";
      return block.text ? `<button type="button" class="bespoke-cta hero-catalog-cta site-free-canvas-text"${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}${ICON_ARROW_RIGHT}</button>` : "";
    }).join("")}</div>`;
  };
  const visualFamilyContent = (copy: string, media: string) => `${copy}${media}`;
  const trustedFamilyContent = (section: StoreSiteDocument["sections"][number], trusted: string) => {
    const additional = bespokeAdditionalCopy(section);
    const family = resolveSiteSectionFamily(section.kind, section.family, siteDocument!.designGenome);
    return family === "product-led" || family === "cinematic" ? `${trusted}${additional}` : `${additional}${trusted}`;
  };
  const renderBespokeSection = (section: StoreSiteDocument["sections"][number]): string => {
    if (section.kind === "hero") return carouselHtml && section.motion !== "none" && !(section.layout === "split" && section.motion === "clip" && section.mediaUrls.length >= 2)
      ? bespokeFrame(section, carouselHtml, "div", "has-site-carousel")
      : bespokeFrame(section, visualFamilyContent(bespokeCopy(section, true), bespokeMediaHtml(section)));
    if (section.kind === "story") {
      const storyFlow = section.motion === "story-scroll" ? bespokeStoryFlowHtml(section) : "";
      return storyFlow
        ? bespokeFrame(section, storyFlow, "section", "has-story-flow")
        : bespokeFrame(section, visualFamilyContent(bespokeCopy(section), bespokeMediaHtml(section)));
    }
    if (section.kind === "gallery") {
      const authoredGallery = bespokeMediaHtml(section);
      return bespokeFrame(section, visualFamilyContent(bespokeCopy(section), authoredGallery || editorialGalleryHtml));
    }
    if (section.kind === "catalog") return bespokeFrame(
      section,
      trustedFamilyContent(section, productsHtml + appointmentsHtml),
      "div",
      section.productIds ? "is-curated-products" : "",
    );
    if (section.kind === "contact") return bespokeFrame(section, trustedFamilyContent(section, contactHtml), "div");
    if (section.kind === "location") return bespokeFrame(section, trustedFamilyContent(section, locationHtml), "div");
    if (section.kind === "links") return bespokeFrame(section, trustedFamilyContent(section, linksHtml), "div");
    return "";
  };
  return renderBespokeSection;
}
