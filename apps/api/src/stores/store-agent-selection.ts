import { BadRequestException } from "@nestjs/common";
import { StoreAgentSelectionDto } from "./dto/send-store-agent-message.dto";
import { StoreSiteDocument } from "./site-document";
import { StoreAgentEditorOperation } from "./store-agent-editor";

export function instructionUsesSelection(instruction: string) {
  return /\b(?:(?:esta|este|esa|ese|this)\s+(?:foto|imagen|titulo|título|texto|bot[oó]n|photo|image|title|text|button)|esto|seleccionad[oa]|selected)\b/i.test(instruction);
}

export function resolveStoreAgentSelection(selection: StoreAgentSelectionDto, document: StoreSiteDocument, config: Record<string, any>) {
  const { entity, targetId, parentId, field, position, pageId } = selection;
  if (["animation-media", "hero-slide", "editorial-image"].includes(entity) && String(position) !== targetId) {
    throw new BadRequestException("La posición seleccionada no coincide con esa imagen. Selecciónala de nuevo.");
  }
  const section = document.sections.find((entry) => entry.id === (entity === "section" ? targetId : parentId));
  const animation = (Array.isArray(config.animations) ? config.animations : []).find((entry: any) => entry.id === (entity === "animation" ? targetId : parentId));
  let owner: any = null;
  let fields: string[] = [];
  if (entity.startsWith("section") && section && (section.pageId || "") === pageId) {
    if (entity === "section") { owner = section; fields = ["title", "body", "ctaLabel"]; }
    if (entity === "section-media" && position >= 0 && position < section.mediaUrls.length) { owner = { imageUrl: section.mediaUrls[position] }; fields = ["imageUrl"]; }
    if (entity === "section-item" && /^\d+$/.test(targetId)) { owner = section.items?.[Number(targetId)]; fields = ["title", "body", "mediaUrl"]; }
    if (entity === "section-block") { owner = section.blocks?.flatMap((block) => [block, ...(block.children || [])]).find((block) => block.id === targetId); fields = ["text", "mediaUrl"]; }
  }
  if (animation && (animation.pageId || "") === pageId) {
    if (entity === "animation") { owner = animation; fields = ["title", "subtitle", "buttonLabel"]; }
    if (entity === "animation-media" && position >= 0 && position < (animation.media?.length || 0)) {
      owner = animation.media[position]; fields = ["imageUrl"];
    }
  }
  if (entity === "hero-slide" && !pageId && position >= 0) { owner = (config.heroSlides || [])[position]; fields = ["imageUrl", "title", "body", "ctaLabel"]; }
  if (entity === "editorial-image" && !pageId && position >= 0) { owner = (config.editorialGallery || [])[position]; fields = ["imageUrl", "title", "caption", "body"]; }
  if (entity === "visual-setting" && !pageId) { owner = config; fields = ["tagline", "bannerUrl", "aboutTitle", "aboutText", "aboutImageUrl", "catalogTitle", "catalogSubtitle", "promotionTitle", "promotionBody", "promotionImageUrl"]; }
  if (!owner || !fields.includes(field)) throw new BadRequestException("Ese elemento ya no está disponible en este borrador. Selecciona de nuevo el texto o la foto que quieres cambiar.");
  return { selection, value: String(owner[field] ?? ""), image: field === "imageUrl" || field === "mediaUrl" || field.endsWith("ImageUrl") || field === "bannerUrl" };
}

export function selectedOperation(selection: StoreAgentSelectionDto, value: string): StoreAgentEditorOperation {
  return { ...selection, entity: selection.entity as StoreAgentEditorOperation["entity"], action: "set", value, secondaryValue: "",
    field: selection.entity === "section-media" ? "" : selection.field };
}

export function assertSelectedOperations(selection: StoreAgentSelectionDto, operations: Array<{ action: string; entity: string; targetId: string; parentId: string; field: string; position: number }>) {
  const expected = selectedOperation(selection, "");
  if (!operations.length || operations.some((operation) => operation.action !== "set" || operation.entity !== expected.entity
    || operation.targetId !== expected.targetId || operation.parentId !== expected.parentId
    || (operation.field || "") !== expected.field
    || (["section-media", "animation-media", "hero-slide", "editorial-image"].includes(expected.entity) && operation.position !== expected.position))) {
    throw new BadRequestException("El cambio propuesto salió del elemento seleccionado. El borrador sigue intacto; pide un cambio para ese texto o esa foto.");
  }
}
