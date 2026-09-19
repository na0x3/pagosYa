/** Plans and applies the store agent's revisions: scope checks, attached images, product requests, and footer/link edits. */
import { BadRequestException } from "@nestjs/common";
import { Store, MediaAsset } from "@prisma/client";
import { SAFE_TEXT_PATTERN } from "../common/validation/safe-text.decorator";
import { type StoreSiteDocument, type StoreSiteFooter } from "./site-document";
import { type StorefrontSemanticMediaCandidate } from "./storefront-engine";
import { type StoreAgentEditorOperation } from "./store-agent-editor";
import { blendHex, readableText } from "./color";
import { type StoreProductContext } from "./visual-config";


export type StoreAgentImageRequest = {
  action: "add" | "set";
  entity: "section-media" | "section-item" | "section-block" | "visual-setting" | "hero-slide" | "editorial-image" | "animation-media" | "new-product";
  targetId: string;
  parentId: string;
  field: string;
  position: number;
  aspectRatio: "landscape" | "portrait" | "square";
  prompt: string;
};

export type StoreAgentProductRequest = {
  key: string;
  name: string;
  nameEvidence: string;
  description: string;
  descriptionEvidence: string;
  amount: number;
  amountEvidence: string;
  currency: "BOB";
  stock: number;
  stockEvidence: string;
  categoryId: string;
  imageUrls: string[];
  pageIds: string[];
};

export type StoreAgentRevisionPlan = {
  target: "opening" | "catalog" | "story" | "gallery" | "contact" | "footer" | "site" | "unsupported";
  tone: "warmer" | "cooler" | "bolder" | "quieter" | "minimal" | "editorial" | "unchanged";
  action: "restyle" | "replace-title" | "replace-body" | "replace-cta" | "set-color" | "move-up" | "move-down" | "social-link" | "set-link" | "unsupported";
  value: string;
  color: string;
  preserveCatalog: boolean;
  socialHandle: string;
  socialPlatform: "instagram" | "tiktok" | "facebook" | "x" | "youtube" | "unknown";
  linkLabel: string;
  linkUrl: string;
  operations: StoreAgentEditorOperation[];
  imageRequests: StoreAgentImageRequest[];
  productRequests: StoreAgentProductRequest[];
  summary: string;
};

export function normalizedAgentInstruction(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function agentInstructionExplicitlyRequestsMotion(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  if (/(?:no te pedi|nunca pedi|nada que ver|solo queria|unicamente queria).{0,64}(?:animacion|animaciones|movimiento)/.test(normalized)) return false;
  return /(?:cambi|edit|modific|ajust|agreg|anad|quit|elimin|borra|muev|reorden|duplic|pon|restaur|recuper).{0,48}(?:animacion|animaciones|movimiento)/.test(normalized)
    || /(?:animacion|animaciones|movimiento).{0,48}(?:cambi|edit|modific|ajust|agreg|anad|quit|elimin|borra|muev|reorden|duplic|pon|restaur|recuper)/.test(normalized);
}

export function assertAgentRevisionScope(
  instruction: string,
  document: StoreSiteDocument,
  plan: StoreAgentRevisionPlan,
  selectedTarget = false,
): void {
  const normalized = normalizedAgentInstruction(instruction);
  const motionEntities = new Set(["motion", "animation", "animation-text", "animation-media"]);
  const changesMotion = plan.operations.some((operation) => (
    motionEntities.has(operation.entity)
    || (operation.entity === "section" && operation.field === "motion")
    || (operation.entity === "design-genome" && operation.field === "motionLanguage")
  ));
  if (changesMotion && !agentInstructionExplicitlyRequestsMotion(instruction)) {
    throw new BadRequestException("Yapi intentó cambiar animaciones que no pediste. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
  const requestsGeneratedImage = /(?:genera|generar|crea|crear|generate|create).{0,40}(?:imagen|imagenes|foto|fotos|image|photo)/.test(normalized);
  if (plan.imageRequests.length && !requestsGeneratedImage) {
    throw new BadRequestException("Yapi intentó generar imágenes cuando sólo pediste usar o cambiar una foto. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
  if (plan.productRequests.length && !storeAgentInstructionLooksLikeProductCreation(instruction)) {
    throw new BadRequestException("Yapi intentó crear productos que no pediste. La variante fue rechazada y el borrador anterior sigue intacto.");
  }

  if (selectedTarget) return;
  const targetsOpeningContent = /(?:primera seccion|primer bloque|portada|apertura|\bhero\b)/.test(normalized)
    && /(?:foto|imagen|texto|titulo|encabezado|descripcion|subtitulo|boton|cta)/.test(normalized);
  const broadRedesign = /(?:redisen|disen|crea|genera|arma).{0,36}(?:sitio|website|pagina web|tienda|direccion visual|propuesta).{0,24}(?:complet|desde cero|nuev)/.test(normalized);
  if (!targetsOpeningContent || broadRedesign) return;

  const openingId = document.sections.find((section) => !section.pageId)?.id ?? document.sections[0]?.id;
  const imageRequestsAllowed = plan.imageRequests.every((request) => (
    request.entity === "section-media" && request.parentId === openingId
  ) || request.entity === "hero-slide" || (request.entity === "visual-setting" && ["bannerUrl", "backgroundImageUrl"].includes(request.field)));
  if (!imageRequestsAllowed) {
    throw new BadRequestException("Yapi intentó colocar una imagen fuera de la primera sección. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
  const allowed = plan.operations.every((operation) => {
    if (operation.entity === "section") {
      return operation.action === "set"
        && operation.targetId === openingId
        && ["title", "body", "ctaLabel"].includes(operation.field);
    }
    if (["section-media", "section-item", "section-block"].includes(operation.entity)) {
      return operation.parentId === openingId
        && (operation.entity !== "section-block" || operation.field === "text");
    }
    if (operation.entity === "hero-slide") {
      return ["imageUrl", "title", "body", "ctaLabel", "ctaUrl", ""].includes(operation.field);
    }
    if (operation.entity === "visual-setting") {
      return ["bannerUrl", "tagline"].includes(operation.field);
    }
    return false;
  });
  if (!allowed) {
    throw new BadRequestException("Yapi intentó modificar partes fuera de la primera sección. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
}

export function localAgentRevisionPlan(instruction: string): StoreAgentRevisionPlan {
  const normalized = normalizedAgentInstruction(instruction);
  const linkUrl = (instruction.match(/https:\/\/[^\s<>"'’]+/iu)?.[0] ?? "")
    .replace(/[),.;!?]+$/u, "")
    .slice(0, 500);
  const linkLabel = (instruction.match(/(?:que|cual)\s+dice\s+[“"'‘]?(.{1,100}?)[”"'’]?\s+(?:ponle|pon|agrega|anade|añade|cambia|asigna|vincula)\b/iu)?.[1] ?? "")
    .trim()
    .replace(/^[“"'‘]|[”"'’]$/gu, "")
    .trim()
    .slice(0, 100);
  const preserveCatalog = /(manten|mantener|conserv|preserv|no (?:cambies|toques|modifiques)).{0,32}(catalog|producto|tienda)/.test(normalized);
  const tone: StoreAgentRevisionPlan["tone"] = /(calid|acogedor|cercan|humano)/.test(normalized)
    ? "warmer"
    : /(fresc|frio|sobrio azulado)/.test(normalized)
      ? "cooler"
      : /(atrevid|fuerte|impact|bold)/.test(normalized)
        ? "bolder"
        : /(seren|suave|sutil|tranquil)/.test(normalized)
          ? "quieter"
          : /(minimal|simple|limpi)/.test(normalized)
            ? "minimal"
            : /(editorial|revista)/.test(normalized)
              ? "editorial"
              : "unchanged";
  const target: StoreAgentRevisionPlan["target"] = /(footer|pie de pagina|\bred(?:es)?\b|\bsocial(?:es)?\b|sigueme|siguenos)/.test(normalized)
    || (linkUrl && /\b(enlace|link|vinculo)\b/.test(normalized))
    ? "footer"
    : /(primera seccion|primer bloque|apertura|portada|inicio|hero|cabecera)/.test(normalized)
    ? "opening"
    : /(historia|story|relato)/.test(normalized)
      ? "story"
      : /(galeria|gallery)/.test(normalized)
        ? "gallery"
        : /(contacto|contact)/.test(normalized)
          ? "contact"
          : /(catalog|producto|tienda)/.test(normalized) && !preserveCatalog
            ? "catalog"
            : /(boton|cta|titulo|encabezado|descripcion|subtitulo)/.test(normalized)
              ? "opening"
            : tone !== "unchanged"
              ? "site"
              : "unsupported";
  const handleMatch = instruction.match(/(?:^|\s)@([a-z0-9._-]{1,30})\b/i);
  const socialHandle = handleMatch ? `@${handleMatch[1]}` : "";
  const socialPlatform: StoreAgentRevisionPlan["socialPlatform"] = /instagram/.test(normalized)
    ? "instagram"
    : /tiktok/.test(normalized)
      ? "tiktok"
      : /facebook/.test(normalized)
        ? "facebook"
        : /(?:^|\s)(?:twitter|x)(?:\s|$)/.test(normalized)
          ? "x"
          : /youtube/.test(normalized)
            ? "youtube"
            : "unknown";
  const quotedValue = instruction.match(/[“"]([^”"]{1,600})[”"]/u)?.[1]?.trim()
    ?? instruction.match(/['‘]([^'’]{1,600})['’]/u)?.[1]?.trim()
    ?? "";
  const trailingValue = instruction.match(/(?:\ba\b|\bpor\b|:)\s*[“"'‘]?(.{1,600}?)[”"'’]?[.!]?$/iu)?.[1]?.trim() ?? "";
  const value = (quotedValue || trailingValue).slice(0, 600);
  const color = instruction.match(/#[0-9a-f]{6}\b/i)?.[0].toLowerCase() ?? "";
  const action: StoreAgentRevisionPlan["action"] = target === "footer" && socialHandle
    ? "social-link"
    : target === "footer" && linkUrl
      ? "set-link"
    : /(mueve|sube|subir|lleva|coloca).{0,32}(arriba|antes)/.test(normalized)
      ? "move-up"
      : /(mueve|baja|bajar|lleva|coloca).{0,32}(abajo|despues)/.test(normalized)
        ? "move-down"
        : color && /(color|fondo|background)/.test(normalized)
          ? "set-color"
          : /(boton|cta|llamada a la accion)/.test(normalized) && value
            ? "replace-cta"
            : /(titulo|encabezado)/.test(normalized) && value
              ? "replace-title"
              : /(descripcion|subtitulo|texto|parrafo)/.test(normalized) && value
                ? "replace-body"
                : tone !== "unchanged"
                  ? "restyle"
                  : "unsupported";
  const targetLabel = target === "opening" ? "la apertura" : target === "site" ? "el lenguaje visual" : target === "footer" ? "el pie de página" : `la sección ${target}`;
  const toneLabel = tone === "unchanged" ? "siguiendo la instrucción" : `con un tono ${tone}`;
  const summary = target === "footer" && socialHandle
    ? `Agregar ${socialHandle} al pie de página sin cambiar el resto de la tienda.`
    : target === "footer" && action === "set-link"
      ? `Asignar ${linkUrl} al enlace “${linkLabel || "indicado"}” del pie de página.`
    : target === "unsupported" || action === "unsupported"
      ? "La instrucción no identifica una zona editable de forma segura."
      : action === "replace-title" ? `Cambiar el título de ${targetLabel} a “${value.slice(0, 80)}”.`
        : action === "replace-body" ? `Cambiar el texto de ${targetLabel}.`
          : action === "replace-cta" ? `Cambiar el botón de ${targetLabel} a “${value.slice(0, 40)}”.`
            : action === "set-color" ? `Cambiar el fondo de ${targetLabel} a ${color}.`
              : action === "move-up" ? `Mover ${targetLabel} una posición hacia arriba.`
                : action === "move-down" ? `Mover ${targetLabel} una posición hacia abajo.`
                  : `Ajustar ${targetLabel} ${toneLabel}.`;
  const operations: StoreAgentEditorOperation[] = action === "set-link"
    ? [{ action: "set", entity: "footer-link", targetId: linkLabel, parentId: "", field: "href", value: linkUrl, secondaryValue: "", position: -1 }]
    : [];
  return { target, tone, action, value, color, preserveCatalog, socialHandle, socialPlatform, linkLabel, linkUrl, operations, imageRequests: [], productRequests: [], summary };
}

export function storeAgentInstructionIsScoped(instruction: string): boolean {
  const plan = localAgentRevisionPlan(instruction);
  return plan.target !== "unsupported" && plan.action !== "unsupported" && (plan.target !== "site" || plan.action !== "restyle");
}

export function storeAgentInstructionLooksLikeEditorCommand(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  if (/(?:redisen|diseñ|disen|crea|genera|arma).{0,36}(?:sitio|website|pagina web|tienda|direccion visual|propuesta).{0,24}(?:complet|desde cero|nuev)/.test(normalized)) return false;
  const operation = /(cambi|edit|modific|ajust|agreg|anad|añad|quit|elimin|borra|muev|sube|baja|reorden|duplic|copi|ocult|muestr|activ|desactiv|vincul|enlaz|asign|renombr|pon|fij)/.test(normalized)
    || /(?:genera|crea).{0,32}(?:imagen|foto)/.test(normalized);
  const editorEntity = /(portada|titulo|texto|boton|tema|color|tipograf|encabezado|menu|naveg|pagina|seccion|galeria|historia|catalog|producto|footer|pie de pagina|columna|enlace|link|boletin|newsletter|coleccion|animacion|movimiento|experiencia|imagen|foto|alto|ancho|alineacion|fondo)/.test(normalized);
  return operation && editorEntity;
}

export function storeAgentInstructionLooksLikeProductCreation(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  return /(?:crea|crear|agrega|agregar|anade|anadir|añade|añadir).{0,32}(?:producto|articulo|servicio)/.test(normalized);
}

export function instructionExplicitlyUsesAttachedImage(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  const placementVerb = "(?:cambi|reempla|sustitu|pon|usa|utiliz|coloca|agreg|anad|anade|adjunt|replace|use)";
  const imageNoun = "(?:foto|fotos|imagen|imagenes|image|photo)";
  return new RegExp(`${placementVerb}.{0,48}${imageNoun}|${imageNoun}.{0,48}${placementVerb}`).test(normalized);
}

export function withDeterministicAttachedImage(
  instruction: string,
  document: StoreSiteDocument,
  plan: StoreAgentRevisionPlan,
  attachedImageUrls: string[],
): StoreAgentRevisionPlan {
  if (!attachedImageUrls.length || !instructionExplicitlyUsesAttachedImage(instruction)) return plan;
  const locallyDetectedTarget = localAgentRevisionPlan(instruction).target;
  const target = ["opening", "story", "gallery", "contact"].includes(plan.target)
    ? plan.target
    : locallyDetectedTarget;
  if (!["opening", "story", "gallery", "contact"].includes(target)) return plan;
  const section = target === "opening"
    ? document.sections.find((candidate) => !candidate.pageId) ?? document.sections[0]
    : document.sections.find((candidate) => candidate.kind === target);
  if (!section) return plan;

  const imageUrl = attachedImageUrls[0];
  const replacement: StoreAgentEditorOperation = {
    action: section.mediaUrls.length ? "set" : "add",
    entity: "section-media",
    targetId: "",
    parentId: section.id,
    field: "imageUrl",
    value: imageUrl,
    secondaryValue: "",
    position: 0,
  };
  const operations = plan.operations.filter((operation) => !(
    operation.entity === "section-media"
    && operation.parentId === section.id
    && (operation.position === 0 || operation.value === imageUrl)
  ));
  return {
    ...plan,
    target,
    operations: [...operations, replacement],
  };
}

export function withDeterministicGeneratedOpeningImage(
  instruction: string,
  document: StoreSiteDocument,
  plan: StoreAgentRevisionPlan,
): StoreAgentRevisionPlan {
  const normalized = normalizedAgentInstruction(instruction);
  const requestsGeneratedImage = /(?:genera|generar|crea|crear|generate|create).{0,40}(?:imagen|imagenes|foto|fotos|image|photo)/.test(normalized);
  const targetsOpening = /(?:primera seccion|primer bloque|portada|apertura|\bhero\b)/.test(normalized);
  if (!requestsGeneratedImage || !targetsOpening) return plan;
  // The local repair can fill one missing opening destination. It must not
  // discard a compound image request that the planner already supplied.
  if (plan.imageRequests.length > 1) return plan;

  const opening = document.sections.find((section) => !section.pageId) ?? document.sections[0];
  if (!opening) return plan;
  const authoredRequest = plan.imageRequests.find((request) => request.entity !== "new-product");
  const prompt = authoredRequest?.prompt?.trim()
    || `Una imagen editorial original para la portada de esta tienda, coherente con ${document.direction || "su identidad visual"}`;
  const imageRequest: StoreAgentImageRequest = {
    action: opening.mediaUrls.length ? "set" : "add",
    entity: "section-media",
    targetId: "",
    parentId: opening.id,
    field: "",
    position: 0,
    aspectRatio: authoredRequest?.aspectRatio ?? "landscape",
    prompt: prompt.slice(0, 1_200),
  };

  return {
    ...plan,
    target: "opening",
    imageRequests: [imageRequest],
  };
}

export function generatedImageOperation(request: StoreAgentImageRequest, url: string): StoreAgentEditorOperation {
  if (request.entity === "new-product") throw new BadRequestException("Las fotos de producto se asignan al crear el producto, no como una operación visual.");
  const base: StoreAgentEditorOperation = {
    action: request.action,
    entity: request.entity,
    targetId: request.targetId,
    parentId: request.parentId,
    field: request.field,
    value: url,
    secondaryValue: "",
    position: request.position,
  };
  if (request.entity === "section-media" && request.parentId && (request.action === "add" || request.action === "set")) {
    return { ...base, field: "" };
  }
  if (["section-item", "section-block"].includes(request.entity) && request.action === "set" && request.parentId && request.field === "mediaUrl") return base;
  if (request.entity === "visual-setting" && request.action === "set" && ["bannerUrl", "backgroundImageUrl", "aboutImageUrl", "promotionImageUrl"].includes(request.field)) return base;
  if (request.entity === "hero-slide" && (request.action === "add" || (request.action === "set" && request.field === "imageUrl"))) return base;
  if (request.entity === "editorial-image" && (request.action === "add" || (request.action === "set" && request.field === "imageUrl"))) return base;
  if (request.entity === "animation-media" && request.parentId && (request.action === "add" || (request.action === "set" && request.field === "imageUrl"))) return base;
  throw new BadRequestException("Yapi intentó colocar una imagen generada en un destino que no admite imágenes.");
}

export function evidenceAppearsInInstruction(instruction: string, evidence: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
  const needle = normalize(evidence);
  return Boolean(needle) && normalize(instruction).includes(needle);
}

export function bobAmountFromEvidence(evidence: string): number | null {
  const normalized = evidence.normalize("NFKC").replace(/\s+/g, " ").trim();
  const before = /(?:\bBs\.?|\bBOB\b|bolivianos?)\s*(\d{1,9}(?:[.,]\d{1,2})?)/i.exec(normalized)?.[1];
  const after = /(\d{1,9}(?:[.,]\d{1,2})?)\s*(?:\bBs\.?|\bBOB\b|bolivianos?)/i.exec(normalized)?.[1];
  const amount = Number((before || after || "").replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export function validatedProductRequest(
  request: StoreAgentProductRequest,
  instruction: string,
  document: StoreSiteDocument,
  allowedMediaUrls: ReadonlySet<string>,
): StoreAgentProductRequest {
  if (!request || !/^[a-z][a-z0-9-]{0,47}$/.test(request.key)) {
    throw new BadRequestException("Yapi no pudo asignar una clave segura al producto nuevo.");
  }
  if (!evidenceAppearsInInstruction(instruction, request.nameEvidence)) {
    throw new BadRequestException("Indica el nombre exacto del producto para que Yapi no tenga que inventarlo.");
  }
  const name = request.nameEvidence.trim();
  if (!name || name.length > 120 || !SAFE_TEXT_PATTERN.test(name)) throw new BadRequestException("El nombre del producto no es válido.");
  const amount = evidenceAppearsInInstruction(instruction, request.amountEvidence)
    ? bobAmountFromEvidence(request.amountEvidence)
    : null;
  if (amount === null || amount !== request.amount) {
    throw new BadRequestException("Indica el precio explícitamente en BOB o Bs. para crear el producto sin adivinarlo.");
  }
  let description = "";
  if (request.descriptionEvidence) {
    if (!evidenceAppearsInInstruction(instruction, request.descriptionEvidence)) {
      throw new BadRequestException("La descripción propuesta no aparece en tu instrucción.");
    }
    description = request.descriptionEvidence.trim();
  }
  if (description.length > 500 || !SAFE_TEXT_PATTERN.test(description)) throw new BadRequestException("La descripción del producto no es válida.");
  let stock = -1;
  if (request.stockEvidence) {
    if (!evidenceAppearsInInstruction(instruction, request.stockEvidence)) {
      throw new BadRequestException("El stock propuesto no aparece en tu instrucción.");
    }
    const stockMatch = /\d{1,7}/.exec(request.stockEvidence);
    const parsedStock = stockMatch ? Number(stockMatch[0]) : NaN;
    if (!Number.isInteger(parsedStock) || parsedStock < 0 || parsedStock > 1_000_000 || parsedStock !== request.stock) {
      throw new BadRequestException("El stock indicado para el producto no es válido.");
    }
    stock = parsedStock;
  } else if (request.stock !== -1) {
    throw new BadRequestException("Yapi no puede inventar el stock de un producto.");
  }
  if (request.categoryId) throw new BadRequestException("Yapi no puede inventar una categoría; asígnala después desde Productos.");
  const imageUrls = [...new Set(Array.isArray(request.imageUrls) ? request.imageUrls : [])].slice(0, 10);
  if (imageUrls.some((url) => !allowedMediaUrls.has(url))) {
    throw new BadRequestException("Todas las fotos del producto deben pertenecer a este comercio.");
  }
  const knownPageIds = new Set(["", ...(document.pages ?? []).map((page) => page.id)]);
  const pageIds = [...new Set(Array.isArray(request.pageIds) ? request.pageIds : [])].slice(0, 6);
  if (!pageIds.length || pageIds.some((pageId) => !knownPageIds.has(pageId))) {
    throw new BadRequestException("Elige al menos una página existente para colocar el producto.");
  }
  return {
    ...request,
    name,
    nameEvidence: name,
    description,
    descriptionEvidence: description,
    amount,
    currency: "BOB",
    stock,
    imageUrls,
    pageIds,
  };
}

export function productCatalogOperations(
  document: StoreSiteDocument,
  products: Array<{ id: string; pageIds: string[] }>,
): StoreAgentEditorOperation[] {
  const operations: StoreAgentEditorOperation[] = [];
  const usedSectionIds = new Set(document.sections.map((section) => section.id));
  const productsByPage = new Map<string, string[]>();
  for (const product of products) {
    for (const pageId of product.pageIds) {
      const ids = productsByPage.get(pageId) ?? [];
      ids.push(product.id);
      productsByPage.set(pageId, ids);
    }
  }
  for (const [pageId, productIds] of productsByPage) {
    const existing = document.sections.find((section) => section.kind === "catalog" && (section.pageId ?? "") === pageId);
    let sectionId = existing?.id ?? `catalog-${pageId || "home"}`.slice(0, 48);
    for (let suffix = 2; !existing && usedSectionIds.has(sectionId); suffix += 1) sectionId = `catalog-${pageId || "home"}-${suffix}`.slice(0, 48);
    if (!existing) {
      usedSectionIds.add(sectionId);
      operations.push({ action: "add", entity: "section", targetId: sectionId, parentId: pageId, field: "catalog", value: "Productos", secondaryValue: "", position: -1 });
    }
    operations.push({
      action: "set",
      entity: "section",
      targetId: sectionId,
      parentId: "",
      field: "productIds",
      value: [...new Set([...(existing?.productIds ?? []), ...productIds])].join(","),
      secondaryValue: "",
      position: -1,
    });
  }
  return operations;
}

export function socialHref(platform: StoreAgentRevisionPlan["socialPlatform"], handle: string): string {
  const username = handle.replace(/^@/, "");
  if (!username) return "";
  if (platform === "instagram") return `https://instagram.com/${username}`;
  if (platform === "tiktok") return `https://tiktok.com/@${username}`;
  if (platform === "facebook") return `https://facebook.com/${username}`;
  if (platform === "x") return `https://x.com/${username}`;
  if (platform === "youtube") return `https://youtube.com/@${username}`;
  return "";
}

export function footerWithSocialHandle(document: StoreSiteDocument, plan: StoreAgentRevisionPlan): StoreSiteFooter {
  const footer: StoreSiteFooter = document.footer
    ? structuredClone(document.footer)
    : {
        enabled: true,
        brandDescription: "",
        columns: [],
        copyright: "",
        badge: "",
      };
  footer.enabled = true;
  if (!plan.socialHandle) return footer;
  let column = footer.columns.find((candidate) => /(redes|social|siguenos|síguenos)/i.test(`${candidate.id} ${candidate.title}`));
  if (!column && footer.columns.length < 4) {
    column = { id: "social", title: "Redes", items: [] };
    footer.columns.push(column);
  }
  column ??= footer.columns.find((candidate) => candidate.items.length < 8);
  if (!column) throw new BadRequestException("El pie de página ya alcanzó el máximo de enlaces. Quita uno antes de agregar otra red.");
  const href = socialHref(plan.socialPlatform, plan.socialHandle);
  const duplicate = column.items.find((item) => item.label.toLowerCase() === plan.socialHandle.toLowerCase());
  if (duplicate) {
    if (href) duplicate.href = href;
    return footer;
  }
  const baseId = `social-${plan.socialHandle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 48);
  const existingIds = new Set(footer.columns.flatMap((candidate) => candidate.items.map((item) => item.id)));
  let id = baseId || "social-handle";
  for (let suffix = 2; existingIds.has(id); suffix += 1) id = `${baseId.slice(0, 44)}-${suffix}`;
  column.items.push({ id, label: plan.socialHandle, href });
  return footer;
}

export function normalizedFooterLinkLabel(value: string): string {
  return normalizedAgentInstruction(value).replace(/\s+/g, " ").trim();
}

export function footerWithUpdatedLink(document: StoreSiteDocument, plan: StoreAgentRevisionPlan): StoreSiteFooter {
  const footer = document.footer ? structuredClone(document.footer) : null;
  if (!footer) throw new BadRequestException("Esta tienda todavía no tiene un pie de página editable.");
  if (!/^https:\/\/[^\s]+$/i.test(plan.linkUrl) || plan.linkUrl.length > 500) {
    throw new BadRequestException("Indica un enlace HTTPS válido para actualizar el pie de página.");
  }
  const requestedLabel = normalizedFooterLinkLabel(plan.linkLabel);
  const allItems = footer.columns.flatMap((column) => column.items);
  const matchingItems = requestedLabel
    ? allItems.filter((item) => normalizedFooterLinkLabel(item.label) === requestedLabel)
    : allItems.filter((item) => !item.href.trim());
  if (matchingItems.length === 0) {
    throw new BadRequestException(plan.linkLabel
      ? `No encontré un enlace llamado “${plan.linkLabel}” en el pie de página.`
      : "Dime el texto del enlace del pie de página que quieres actualizar.");
  }
  if (matchingItems.length > 1) {
    throw new BadRequestException(`Hay más de un enlace llamado “${plan.linkLabel || "Nuevo enlace"}”. Cambia uno de los nombres para poder identificarlo.`);
  }
  matchingItems[0].href = plan.linkUrl;
  return footer;
}

export function applyAgentRevisionPlan(document: StoreSiteDocument, plan: StoreAgentRevisionPlan): StoreSiteDocument {
  if (plan.target === "unsupported" || plan.action === "unsupported") {
    throw new BadRequestException("Dime qué quieres cambiar —por ejemplo ‘cambia el título de la portada a …’, ‘mueve la galería arriba’ o ‘haz la historia más cálida’— para preparar una variante segura.");
  }
  if (plan.target === "footer") {
    return {
      ...structuredClone(document),
      direction: `${document.direction || "Dirección propia"} · ${plan.summary}`.slice(0, 120),
      footer: plan.action === "set-link"
        ? footerWithUpdatedLink(document, plan)
        : footerWithSocialHandle(document, plan),
    };
  }
  const openingId = document.sections.find((section) => !section.pageId && (!plan.preserveCatalog || section.kind !== "catalog"))?.id
    ?? document.sections[0]?.id;
  const matchesTarget = (section: StoreSiteDocument["sections"][number]) => {
    if (plan.target === "site") return plan.preserveCatalog ? section.kind !== "catalog" : true;
    if (plan.target === "opening") return section.id === openingId;
    return section.kind === plan.target;
  };
  const nextDocument = structuredClone(document);
  if (plan.action === "move-up" || plan.action === "move-down") {
    const fromIndex = nextDocument.sections.findIndex(matchesTarget);
    if (fromIndex < 0) throw new BadRequestException("La sección indicada no existe en esta tienda.");
    const pageId = nextDocument.sections[fromIndex].pageId;
    const direction = plan.action === "move-up" ? -1 : 1;
    let toIndex = fromIndex + direction;
    while (toIndex >= 0 && toIndex < nextDocument.sections.length && nextDocument.sections[toIndex].pageId !== pageId) toIndex += direction;
    if (toIndex < 0 || toIndex >= nextDocument.sections.length) throw new BadRequestException("Esa sección ya está en el extremo solicitado.");
    [nextDocument.sections[fromIndex], nextDocument.sections[toIndex]] = [nextDocument.sections[toIndex], nextDocument.sections[fromIndex]];
    nextDocument.direction = `${document.direction || "Dirección propia"} · ${plan.summary}`.slice(0, 120);
    return nextDocument;
  }
  const tint = plan.tone === "warmer" ? "#f1ad62"
    : plan.tone === "cooler" ? "#9fc7d4"
      : plan.tone === "bolder" ? "#e58a32"
        : plan.tone === "editorial" ? "#cbb69a"
          : "#eee9df";
  const amount = plan.tone === "bolder" ? 0.42 : plan.tone === "unchanged" ? 0 : 0.28;
  return {
    ...nextDocument,
    direction: `${document.direction || "Dirección propia"} · ${plan.summary}`.slice(0, 120),
    sections: nextDocument.sections.map((section) => {
      if (!matchesTarget(section)) return structuredClone(section);
      const backgroundColor = plan.action === "set-color" && /^#[0-9a-f]{6}$/i.test(plan.color)
        ? plan.color
        : plan.tone === "minimal"
        ? document.theme.pageBackground
        : blendHex(section.backgroundColor, tint, amount);
      return {
        ...section,
        backgroundColor,
        textColor: readableText(backgroundColor, section.textColor),
        ...(plan.action === "replace-title" ? { title: plan.value.slice(0, 120) } : {}),
        ...(plan.action === "replace-body" ? { body: plan.value.slice(0, 600) } : {}),
        ...(plan.action === "replace-cta" ? { ctaLabel: plan.value.slice(0, 40) } : {}),
        ...(plan.tone === "minimal" ? { motion: "none" as const } : {}),
      };
    }),
  };
}

export function storefrontMediaCandidates(
  store: Store,
  uploadedAssetUrls: readonly string[],
  assets: readonly MediaAsset[],
  products: readonly StoreProductContext[],
): StorefrontSemanticMediaCandidate[] {
  const uploaded = new Set(uploadedAssetUrls);
  const productImagePosition = new Map<string, number>();
  products.forEach((product) => product.imageUrls.forEach((url, index) => {
    if (!productImagePosition.has(url)) productImagePosition.set(url, index);
  }));
  return assets.map((asset, index) => {
    const productPosition = productImagePosition.get(asset.url);
    const roles = new Set<StorefrontSemanticMediaCandidate["roles"][number]>();
    if (asset.url === store.logoUrl) roles.add("logo");
    if (productPosition === 0) {
      roles.add("featured-product");
      roles.add("collection-cover");
      roles.add("campaign-image");
    } else if (typeof productPosition === "number") {
      roles.add("product-detail");
      roles.add("process-image");
      roles.add("ambient-detail");
    }
    if (uploaded.has(asset.url) && typeof productPosition !== "number" && asset.url !== store.logoUrl) {
      roles.add("brand-texture");
      roles.add("process-image");
      roles.add("founder-or-story");
      roles.add("campaign-image");
      roles.add("lifestyle");
      roles.add("editorial");
      roles.add("ambient-detail");
    }
    if (!roles.size) {
      roles.add("editorial");
      roles.add("lifestyle");
      roles.add("ambient-detail");
    }
    return { url: asset.url, roles: [...roles], priority: index };
  });
}
