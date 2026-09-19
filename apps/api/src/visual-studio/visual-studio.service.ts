import { AiUsageService } from '../ai-usage/ai-usage.service';
import { Optional } from '@nestjs/common';
import { BrandProfileService } from '../brand/brand-profile.service';
import { brandContext } from '../brand/brand-profile';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset, Prisma, Store, StoreVisualProposal } from "@prisma/client";
import {
  applySiteArtDirection,
  type SiteCreativeRecipe,
} from "@pagosya/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentLinksService } from "../payment-links/payment-links.service";
import { MAX_IMAGE_UPLOAD_BYTES, UploadsService } from "../uploads/uploads.service";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";
import { StoreAgentSelectionDto } from "./dto/send-store-agent-message.dto";
import { assertWebsiteRevision, saveWebsiteDraftPatch, websiteEditorStore } from "../stores/website-draft";
import { assertSelectedOperations, instructionUsesSelection, resolveStoreAgentSelection, selectedOperation } from "./store-agent-selection";
import {
  SITE_SECTION_MOTIONS,
  materializeSiteDocument,
  siteDocumentJson,
  type StoreSiteDocument
} from "./site-document";
import {
  applyStorefrontCreativeRecipe,
  applyStorefrontTopology,
  beginStorefrontGeneration,
  evaluateStorefrontDiversity,
  storefrontBrandFingerprint,
  storefrontCreativeRecipe,
  storefrontOriginalityGate,
  storefrontStructuralSignature,
  storedStorefrontStructuralSignature,
  storefrontTopologyPlan,
  preserveLockedStorefrontSections,
  varyStorefrontStructure,
  withStorefrontEngineMetadata,
  type StorefrontEngineContext
} from "./storefront-engine";
import {
  STORE_AGENT_EDITOR_CATALOG,
  STORE_AGENT_EDITOR_ENTITIES,
  applyStoreAgentEditorOperations,
  applyStoreAgentProposalVisualOperations,
  assertStoreAgentOperationBudget,
  storeAgentEditableInventory,
  storeAgentOperationIsProposalVisual
} from "./store-agent-editor";
import { type StoreAgentImageRequest, type StoreAgentRevisionPlan, localAgentRevisionPlan, withDeterministicAttachedImage, withDeterministicGeneratedOpeningImage, instructionExplicitlyUsesAttachedImage, assertAgentRevisionScope, validatedProductRequest, storeAgentInstructionLooksLikeProductCreation, normalizedAgentInstruction, generatedImageOperation, productCatalogOperations, applyAgentRevisionPlan, storefrontMediaCandidates } from "./agent-revision";
import { stableGeneratedProposalConfig, normalizedBrandColors, proposalArtDirections, localSiteDocument, applyGeneratedBrandPalette, withGeneratedDefaultFooter, ensureGeneratedCommercePages, enforceGeneratedNarrative, enforceGeneratedHeroOpening, enforceUniqueGeneratedAnimationTypes, finalizeGeneratedPages, advancesGeneratedBatch, staticGeneratedPhotography, repairGeneratedPrimaryCatalog, generatedAnimationSuite, freshGeneratedVisualReset, expandMotionSections, brandAnalysisCache, BRAND_ANALYSIS_SCHEMA, type BrandAnalysis, AI_DIRECTIONS_SCHEMA, passesPremiumDirectionGuardrails, generatedCopy } from "./generated-proposals";
import { storedSectionLocks, snapshot, storedSiteDocument, legacyConfigFromSiteDocument, toStoreUpdate, type StoreProductContext, type StoreLinkContext, type ProposalPreset, normalizeStoreFontStyle, MOTION_EXPERIENCES, type MaterializedAiDirection } from "./visual-config";

@Injectable()
export class VisualStudioService {
  private readonly logger = new Logger(VisualStudioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
    private readonly paymentLinks: PaymentLinksService,
    @Optional() private readonly brands?: BrandProfileService,
    @Optional() private readonly metering?: AiUsageService,
  ) {}

  private async meteredRequest(storeId: string | undefined, stage: string, model: string, url: string, init: RequestInit) {
    const started = Date.now(); let body: any = null; let status = 'FAILED';
    try {
      const response = await fetch(url, init);
      body = await response.json();
      if (response.ok && (!body.status || body.status === 'completed')) status = 'COMPLETED';
      return { response, body };
    } finally { if (storeId) await this.metering?.record(storeId, stage, model, body, Date.now() - started, status); }
  }

  canPlanStorefrontOperations(): boolean {
    return Boolean(this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey"));
  }

  private canGenerateStorefrontImages(): boolean {
    return Boolean(
      this.config.get<boolean>("app.openAi.enabled")
      && this.config.get<string>("app.openAi.apiKey")
      && this.config.get<string>("app.openAi.imageModel"),
    );
  }

  private async generateStorefrontImage(
    merchantId: string,
    storeId: string,
    storeName: string,
    request: Pick<StoreAgentImageRequest, "prompt" | "aspectRatio">,
    context = "",
    allowProductRepresentation = false,
  ): Promise<MediaAsset> {
    if (!this.canGenerateStorefrontImages()) {
      throw new ServiceUnavailableException("La generación de imágenes de Yapi no está configurada en este momento.");
    }
    const brand = await this.brands?.get(merchantId, storeId);
    const prompt = [
      brand ? `Identidad confirmada: ${brandContext(brand.data)}` : '',
      `Crea una fotografía editorial original para el sitio web de ${storeName}.`,
      request.prompt,
      context,
      allowProductRepresentation
        ? "Representa únicamente el producto descrito literalmente por el comercio. No inventes materiales, ingredientes, funciones, empaque, texto, logotipo, beneficios ni afirmaciones que no estén en la descripción."
        : "Debe funcionar como atmósfera visual de marca y dejar espacio útil para texto de interfaz.",
      allowProductRepresentation
        ? "Fotografía de producto limpia y compatible con una galería comercial. Sin marcas ajenas, texto legible, interfaz, precios, descuentos, certificaciones, sellos ni marcas de agua."
        : "No representes un producto específico ni inventes características del negocio. Sin logotipos, marcas ajenas, texto legible, interfaz, precios, descuentos, certificaciones, sellos ni marcas de agua.",
    ].filter(Boolean).join("\n");
    const size = request.aspectRatio === "portrait" ? "1024x1536" : request.aspectRatio === "square" ? "1024x1024" : "1536x1024";
    let response: Response; let body: any;
    try {
      ({ response, body } = await this.meteredRequest(storeId, 'visual-image', this.config.get<string>('app.openAi.imageModel') ?? 'gpt-image-2', "https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.get<string>("app.openAi.imageModel") ?? "gpt-image-2",
          prompt,
          n: 1,
          size,
          quality: "medium",
          output_format: "jpeg",
          output_compression: 86,
          moderation: "auto",
        }),
        signal: AbortSignal.timeout(150_000),
      }));
    } catch (error) {
      throw new ServiceUnavailableException(`No pudimos generar la imagen en este momento: ${(error as Error).message}`);
    }
    if (!response.ok) {
      if (body.error?.code === "moderation_blocked") {
        throw new BadRequestException("La imagen solicitada no pudo generarse de forma segura. Describe otra escena editorial sin personas identificables, logos ni afirmaciones.");
      }
      throw new BadGatewayException(body.error?.message || "El proveedor de imágenes no devolvió una imagen utilizable.");
    }
    const encoded = body.data?.[0]?.b64_json;
    if (!encoded) throw new BadGatewayException("El proveedor de imágenes no devolvió una imagen utilizable.");
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length || buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadGatewayException("La imagen generada no tiene un tamaño compatible con la biblioteca de la tienda.");
    }
    const stored = await this.uploads.saveBuffer(buffer, "image/jpeg");
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          merchantId,
          storeId,
          url: stored.url,
          storageKey: stored.filename,
          kind: "AI_DERIVED",
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
        },
      });
    } catch (error) {
      await this.uploads.deleteFiles([stored.url]);
      throw error;
    }
  }

  async list(merchantId: string, storeId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const [proposals, versions, templates] = await Promise.all([
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualTemplate.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 24 }),
    ]);
    return {
      proposals: proposals.map((proposal) => ({ ...proposal, config: stableGeneratedProposalConfig(proposal.config) })),
      versions,
      templates,
      lockedSectionIds: storedSectionLocks(store.visualSectionLocks),
    };
  }

  private async agentRevisionPlan(
    instruction: string,
    document: StoreSiteDocument,
    conversationContext: string[],
    allowedProductIds: ReadonlySet<string>,
    allowedMediaUrls: ReadonlySet<string>,
    sourceConfig: Record<string, unknown>,
    attachedAssets: Array<Pick<MediaAsset, "url" | "mimeType">> = [],
    selection?: StoreAgentSelectionDto,
    storeId?: string,
  ): Promise<StoreAgentRevisionPlan> {
    const fallback = localAgentRevisionPlan(instruction);
    if (!this.config.get<boolean>("app.openAi.enabled") || !this.config.get<string>("app.openAi.apiKey")) return fallback;
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["target", "tone", "action", "value", "color", "preserveCatalog", "socialHandle", "socialPlatform", "linkLabel", "linkUrl", "operations", "imageRequests", "productRequests", "summary"],
      properties: {
        target: { type: "string", enum: ["opening", "catalog", "story", "gallery", "contact", "footer", "site", "unsupported"] },
        tone: { type: "string", enum: ["warmer", "cooler", "bolder", "quieter", "minimal", "editorial", "unchanged"] },
        action: { type: "string", enum: ["restyle", "replace-title", "replace-body", "replace-cta", "set-color", "move-up", "move-down", "social-link", "set-link", "unsupported"] },
        value: { type: "string", maxLength: 600 },
        color: { type: "string", maxLength: 7, pattern: "^$|^#[0-9A-Fa-f]{6}$" },
        preserveCatalog: { type: "boolean" },
        socialHandle: { type: "string", maxLength: 31, pattern: "^$|^@[A-Za-z0-9._-]{1,30}$" },
        socialPlatform: { type: "string", enum: ["instagram", "tiktok", "facebook", "x", "youtube", "unknown"] },
        linkLabel: { type: "string", maxLength: 100 },
        linkUrl: { type: "string", maxLength: 500, pattern: "^$|^https://[^\\s]+$" },
        operations: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "entity", "targetId", "parentId", "field", "value", "secondaryValue", "position"],
            properties: {
              action: { type: "string", enum: ["set", "add", "remove", "move", "duplicate"] },
              entity: { type: "string", enum: [...STORE_AGENT_EDITOR_ENTITIES] },
              targetId: { type: "string", maxLength: 120 },
              parentId: { type: "string", maxLength: 120 },
              field: { type: "string", maxLength: 80 },
              value: { type: "string", maxLength: 1200 },
              secondaryValue: { type: "string", maxLength: 600 },
              position: { type: "integer", minimum: -1, maximum: 99 },
            },
          },
        },
        imageRequests: {
          type: "array",
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "entity", "targetId", "parentId", "field", "position", "aspectRatio", "prompt"],
            properties: {
              action: { type: "string", enum: ["add", "set"] },
              entity: { type: "string", enum: ["section-media", "section-item", "section-block", "visual-setting", "hero-slide", "editorial-image", "animation-media", "new-product"] },
              targetId: { type: "string", maxLength: 120 },
              parentId: { type: "string", maxLength: 120 },
              field: { type: "string", maxLength: 80 },
              position: { type: "integer", minimum: -1, maximum: 99 },
              aspectRatio: { type: "string", enum: ["landscape", "portrait", "square"] },
              prompt: { type: "string", minLength: 12, maxLength: 800 },
            },
          },
        },
        productRequests: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "name", "nameEvidence", "description", "descriptionEvidence", "amount", "amountEvidence", "currency", "stock", "stockEvidence", "categoryId", "imageUrls", "pageIds"],
            properties: {
              key: { type: "string", pattern: "^[a-z][a-z0-9-]{0,47}$" },
              name: { type: "string", minLength: 1, maxLength: 120 },
              nameEvidence: { type: "string", minLength: 1, maxLength: 120 },
              description: { type: "string", maxLength: 500 },
              descriptionEvidence: { type: "string", maxLength: 500 },
              amount: { type: "integer", minimum: 0, maximum: 99999999999 },
              amountEvidence: { type: "string", minLength: 1, maxLength: 60 },
              currency: { type: "string", enum: ["BOB"] },
              stock: { type: "integer", minimum: -1, maximum: 1000000 },
              stockEvidence: { type: "string", maxLength: 80 },
              categoryId: { type: "string", enum: [""] },
              imageUrls: { type: "array", maxItems: 10, items: { type: "string", maxLength: 240 } },
              pageIds: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", maxLength: 48 } },
            },
          },
        },
        summary: { type: "string", minLength: 1, maxLength: 160 },
      },
    };
    const sections = document.sections.map((section, index) => `${index === 0 ? "opening " : ""}${section.id}:${section.kind}:${section.title}`).join("\n");
    const footerLinks = document.footer?.columns.flatMap((column) => column.items.map((item) => `${column.title}:${item.label}:${item.href || "sin enlace"}`)).join("\n") || "Sin enlaces editables.";
    const attachedImageUrls = attachedAssets.filter((asset) => typeof asset.mimeType === "string" && asset.mimeType.startsWith("image/")).map((asset) => asset.url);
    const prompt = [
      "Interpreta una instrucción de edición para una tienda. Devuelve sólo un plan JSON acotado; no escribas HTML, CSS ni código.",
      "La INSTRUCCIÓN ACTUAL tiene prioridad absoluta. El contexto reciente sólo sirve para resolver referencias como ‘esa foto’ o ‘la sección anterior’; nunca continúes cambios antiguos que la instrucción actual no repita.",
      "Cambia únicamente los elementos y campos nombrados en la instrucción actual. Todo campo, sección, orden, estilo y animación no mencionado debe quedar exactamente igual. Las palabras ‘solo’, ‘solamente’, ‘únicamente’, ‘just’ y ‘only’ convierten este límite en una restricción estricta.",
      "Si la instrucción pide foto y texto de una sección, limita operations a los medios y campos de texto de esa sección. No cambies su layout, colores, movimiento, otras secciones ni animaciones.",
      "Las referencias adjuntas en este mensaje son entradas visuales reales y autorizadas. Examínalas, respeta su orden y usa exactamente sus URLs permitidas cuando la instrucción diga usar, poner, cambiar o reemplazar una foto. No respondas que falta una imagen cuando esta lista no esté vacía.",
      "El plan puede ejecutar cualquier operación del catálogo del editor sobre el borrador privado, pero nunca cambiar precios, inventario, pagos, checkout, KYC, publicación ni datos fuera del sitio.",
      "Usa replace-title, replace-body o replace-cta sólo cuando el comercio haya dado el texto exacto; cópialo en value y nunca inventes contenido. Usa set-color sólo con un hex explícito en color.",
      "Usa move-up o move-down para mover una sección exactamente una posición dentro de su misma página.",
      "Usa target footer para redes sociales o pie de página. Copia un @usuario en socialHandle. No inventes una plataforma: usa unknown cuando no esté nombrada.",
      "Usa set-link sólo para asignar una URL HTTPS explícita a un enlace existente del pie de página. Copia su texto visible exacto en linkLabel y la URL en linkUrl; no inventes ninguno.",
      "Para cualquier edición concreta usa operations y sigue exactamente el catálogo. Puedes combinar varias operaciones cuando el comercio pida varios cambios. Los campos legacy anteriores sirven para compatibilidad y resumen.",
      "Usa imageRequests sólo cuando el comercio pida explícitamente generar una imagen nueva. Máximo 2. No pongas URLs de relleno en operations: señala la entidad y el ID exactos donde irá la imagen; el sistema generará la URL y construirá la operación.",
      "Salvo cuando entity=new-product, las imágenes generadas sólo pueden ser editoriales o ambientales para el sitio. Nunca representes un producto específico, logo, texto legible, precio, descuento, certificación ni afirmación comercial. No inventes hechos visuales sobre el negocio.",
      "Usa productRequests sólo cuando el comercio pida explícitamente crear productos. Máximo 6. Copia literalmente el nombre en nameEvidence, el precio completo con Bs./BOB/bolivianos en amountEvidence y cualquier descripción en descriptionEvidence; esos fragmentos deben existir en la instrucción. amount usa centavos y currency siempre BOB. Si no se indicó stock usa stock=-1 y stockEvidence vacío. Nunca inventes precio, descripción, stock, variantes, extras, descuento, categoría ni datos fiscales.",
      "Cada productRequest debe indicar una o más pageIds existentes; usa el string vacío para Inicio. imageUrls admite hasta 10 URLs del inventario permitido y conserva el orden: la primera será portada. Para generar hasta dos fotos nuevas del producto usa imageRequests con entity=new-product, action=add, targetId igual a productRequest.key y field=imageUrl. Sólo hazlo si el comercio pidió explícitamente generar fotos del producto y describió su apariencia con suficiente precisión.",
      "Usa target unsupported cuando la instrucción no identifique una zona o un cambio visual seguro; nunca uses site como comodín.",
      "preserveCatalog debe ser true cuando el comercio pida mantener, conservar o no tocar el catálogo o los productos.",
      `Secciones disponibles:\n${sections}`,
      `Enlaces del pie de página:\n${footerLinks}`,
      `Catálogo completo de operaciones:\n${STORE_AGENT_EDITOR_CATALOG}`,
      `Inventario editable actual (fuente de verdad para IDs y valores):\n${storeAgentEditableInventory(document, allowedProductIds, allowedMediaUrls, sourceConfig)}`,
      attachedImageUrls.length
        ? `Referencias adjuntas en este mensaje, en orden:\n${attachedImageUrls.map((url, index) => `${index + 1}. ${url}`).join("\n")}`
        : "Este mensaje no incluye referencias visuales nuevas.",
      conversationContext.length ? `Contexto reciente:\n${conversationContext.slice(-6).join("\n")}` : "Sin contexto anterior.",
      `Instrucción actual:\n${instruction}`,
      selection ? `Elemento seleccionado validado: ${JSON.stringify(selection)}. Si el pedido dice este/esta/ese/this, cambia únicamente este campo mediante operaciones set. No cambies el resto del sitio.` : "Sin elemento seleccionado.",
    ].join("\n\n");
    try {
      const attachedInputs = (await Promise.all(attachedAssets.filter((asset) => typeof asset.mimeType === "string" && asset.mimeType.startsWith("image/")).slice(0, 6).map(async (asset, index) => {
        const filename = asset.url.split("/").pop();
        const bytes = filename ? await this.uploads.getBuffer(filename) : null;
        return bytes ? [
          { type: "input_text" as const, text: `Referencia adjunta ${index + 1}: ${asset.url}` },
          { type: "input_image" as const, image_url: `data:${asset.mimeType};base64,${bytes.toString("base64")}`, detail: "high" as const },
        ] : [];
      }))).flat();
      const { response, body } = await this.meteredRequest(storeId, 'visual-revision-plan', this.config.get<string>('app.openAi.designModel') ?? 'gpt-5.6-sol', "https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol", store: false,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...attachedInputs] }],
          text: { format: { type: "json_schema", name: "store_agent_revision_plan", strict: true, schema } },
          reasoning: { effort: "medium" },
          max_output_tokens: 2400,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(body.error?.message || "OpenAI revision planning failed");
      const output = body.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === "output_text")?.text;
      if (!output) return fallback;
      const plan = JSON.parse(output) as StoreAgentRevisionPlan;
      const guardedPlan: StoreAgentRevisionPlan = {
        ...plan,
        target: fallback.target !== "site" && fallback.target !== "unsupported" ? fallback.target : plan.target,
        tone: fallback.tone !== "unchanged" ? fallback.tone : plan.tone,
        action: fallback.action !== "unsupported" ? fallback.action : plan.action,
        value: fallback.value || String(plan.value || "").slice(0, 600),
        color: fallback.color || (/^#[0-9a-f]{6}$/i.test(plan.color) ? plan.color.toLowerCase() : ""),
        preserveCatalog: fallback.preserveCatalog || plan.preserveCatalog,
        socialHandle: fallback.socialHandle || (/^@[A-Za-z0-9._-]{1,30}$/.test(plan.socialHandle) ? plan.socialHandle : ""),
        socialPlatform: fallback.target === "footer"
          ? fallback.socialPlatform
          : fallback.socialPlatform !== "unknown"
            ? fallback.socialPlatform
            : plan.socialPlatform,
        linkLabel: fallback.linkLabel || String(plan.linkLabel || "").slice(0, 100),
        linkUrl: fallback.linkUrl || (/^https:\/\/[^\s]+$/i.test(plan.linkUrl) ? plan.linkUrl.slice(0, 500) : ""),
        operations: Array.isArray(plan.operations) ? plan.operations : fallback.operations,
        imageRequests: Array.isArray(plan.imageRequests) ? plan.imageRequests : [],
        productRequests: Array.isArray(plan.productRequests) ? plan.productRequests : [],
      };
      const targetExists = ["site", "opening", "footer", "unsupported"].includes(guardedPlan.target)
        || document.sections.some((section) => section.kind === guardedPlan.target);
      return targetExists ? guardedPlan : fallback;
    } catch (error) {
      this.logger.warn(`Agent revision planning fell back to bounded local intent: ${(error as Error).message}`);
      return fallback;
    }
  }

  async revise(
    merchantId: string,
    storeId: string,
    proposalId: string | null,
    instruction: string,
    conversationContext: string[] = [],
    requestedAssetUrls: string[] = [],
    editorContext?: { revision: number; selection?: StoreAgentSelectionDto },
  ) {
    const publishedStore = await this.ownedStore(merchantId, storeId);
    if (editorContext) assertWebsiteRevision(publishedStore, editorContext.revision);
    const store = websiteEditorStore(publishedStore);
    const source = proposalId
      ? await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } })
      : null;
    if (proposalId && !source) throw new NotFoundException("Visual proposal not found");
    if (source && source.baseWebsiteRevision !== (store.websiteRevision ?? 0)) {
      throw new ConflictException("Esta propuesta parte de un borrador anterior. Abre el borrador actual y vuelve a pedir el cambio.");
    }
    const sourceConfig = source?.config && typeof source.config === "object" && !Array.isArray(source.config)
      ? source.config as Record<string, unknown>
      : snapshot(store) as Record<string, unknown>;
    const sourceDocument = storedSiteDocument(sourceConfig.siteDocument);
    if (!sourceDocument) {
      throw new BadRequestException(proposalId
        ? "La propuesta ya no contiene un documento visual editable"
        : "La tienda actual todavía no tiene un sitio estructurado que el agente pueda editar sin regenerarlo. Crea una dirección visual primero.");
    }
    const selection = editorContext?.selection;
    const selected = selection ? resolveStoreAgentSelection(selection, sourceDocument, sourceConfig) : null;
    const useSelection = selected && instructionUsesSelection(instruction);
    const assetUrls = [...new Set(requestedAssetUrls)];
    const ownedAssets = assetUrls.length
      ? await this.prisma.mediaAsset.findMany({
          where: { merchantId, url: { in: assetUrls }, mimeType: { in: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"] } },
          select: { url: true, mimeType: true },
        })
      : [];
    if (ownedAssets.length !== assetUrls.length) throw new BadRequestException("Una o más referencias visuales no pertenecen a este comercio.");
    const orderedOwnedAssets = assetUrls.flatMap((url) => ownedAssets.find((asset) => asset.url === url) ?? []);
    const allowedProductIds = new Set([
      ...sourceDocument.merchandising.featuredProductIds,
      ...sourceDocument.merchandising.productOrderIds,
      ...sourceDocument.sections.flatMap((section) => section.productIds ?? []),
      ...(sourceDocument.merchandising.collections ?? []).flatMap((collection) => collection.productIds),
    ]);
    const allowedMediaUrls = new Set(orderedOwnedAssets.map((asset) => asset.url));
    const confirmedBrand = await this.brands?.get(merchantId, storeId);
    let plan = await this.agentRevisionPlan(instruction, sourceDocument, [...conversationContext, ...(confirmedBrand ? [`Identidad confirmada: ${brandContext(confirmedBrand.data)}`] : [])], allowedProductIds, allowedMediaUrls, sourceConfig, orderedOwnedAssets, selection, storeId);
    assertStoreAgentOperationBudget(plan.operations.length);
    if (plan.imageRequests.length > 2 || plan.productRequests.length > 6) {
      throw new BadRequestException("Este pedido supera el límite de 2 imágenes nuevas o 6 productos por cambio. Divídelo en dos pedidos; todavía no se creó nada.");
    }
    if (!useSelection) plan = withDeterministicAttachedImage(
      instruction,
      sourceDocument,
      plan,
      orderedOwnedAssets.filter((asset) => typeof asset.mimeType === "string" && asset.mimeType.startsWith("image/")).map((asset) => asset.url),
    );
    if (!useSelection) plan = withDeterministicGeneratedOpeningImage(instruction, sourceDocument, plan);
    if (useSelection && selected) {
      // Fill bounded local plans only; a model plan that leaves the selected
      // target is rejected below, never silently rewritten or partially used.
      if (!plan.operations.length && !plan.imageRequests.length && !plan.productRequests.length) {
        const quoted = /["“«]([^"”»]+)["”»]/.exec(instruction)?.[1];
        const ordinal = /\b(segunda|segundo|second)\b/i.test(instruction) ? 1 : 0;
        const imageUrl = orderedOwnedAssets.filter((asset) => asset.mimeType.startsWith("image/"))[ordinal]?.url;
        if (selected.image && imageUrl && instructionExplicitlyUsesAttachedImage(instruction)) plan.operations = [selectedOperation(selected.selection, imageUrl)];
        else if (!selected.image && quoted) plan.operations = [selectedOperation(selected.selection, quoted)];
        else if (selected.image && /(?:genera|crea|generate|create).{0,40}(?:imagen|foto|image|photo)/i.test(instruction)) {
          const operation = selectedOperation(selected.selection, "");
          plan.imageRequests = [{ ...operation, entity: operation.entity as StoreAgentImageRequest["entity"], action: "set", aspectRatio: "landscape", prompt: instruction }];
        }
      }
      if (plan.productRequests.length) throw new BadRequestException("Seleccionaste un elemento visual. Pide la creación de productos en un pedido separado.");
      assertSelectedOperations(selected.selection, [...plan.operations, ...plan.imageRequests]);
      if (plan.operations.length && !plan.imageRequests.length && plan.operations.every((operation) => operation.value === selected.value)) {
        throw new BadRequestException("Ese elemento ya tiene ese contenido. No hay cambios para preparar.");
      }
      // Selection authorizes content in an animation, not changes to its motion.
      assertAgentRevisionScope(instruction, sourceDocument, { ...plan, operations: plan.operations.filter((operation) => !["animation", "animation-media"].includes(operation.entity)) }, true);
    } else assertAgentRevisionScope(instruction, sourceDocument, plan);
    const productRequests = plan.productRequests.map((request) => validatedProductRequest(request, instruction, sourceDocument, allowedMediaUrls));
    const productKeys = new Set(productRequests.map((request) => request.key));
    if (productKeys.size !== productRequests.length) throw new BadRequestException("Cada producto nuevo debe tener una clave distinta.");
    if (storeAgentInstructionLooksLikeProductCreation(instruction) && !productRequests.length) {
      throw new BadRequestException("Para crear un producto, indica su nombre exacto, precio en Bs. o BOB y la página donde quieres mostrarlo.");
    }
    const imageRequests = plan.imageRequests;
    const productImageInstruction = /(?:genera|generar|crea|crear).{0,40}(?:imagen|imagenes|foto|fotos)/.test(normalizedAgentInstruction(instruction));
    imageRequests.forEach((request) => {
      if (request.entity !== "new-product") {
        generatedImageOperation(request, "/v1/uploads/pending-generated-image.jpg");
        return;
      }
      if (request.action !== "add" || request.field !== "imageUrl" || !productKeys.has(request.targetId)) {
        throw new BadRequestException("Yapi intentó generar una foto para un producto que no forma parte de esta solicitud.");
      }
      if (!productImageInstruction) {
        throw new BadRequestException("Yapi sólo puede generar fotos de producto cuando lo pides explícitamente.");
      }
    });
    productRequests.forEach((product) => {
      const generatedPhotoCount = imageRequests.filter((request) => request.entity === "new-product" && request.targetId === product.key).length;
      if (product.imageUrls.length + generatedPhotoCount > 10) {
        throw new BadRequestException(`El producto “${product.name}” supera el máximo de 10 fotos. Quita algunas antes de generar nuevas.`);
      }
    });
    // Replay the complete plan against private stand-ins before any paid image
    // call or product creation. Both validation and the budget include the
    // operations that the server will add for generated media and placement.
    const preflightProducts = productRequests.map((request, index) => ({ id: `pending-yapi-product-${index}`, pageIds: request.pageIds }));
    const preflightImageUrls = imageRequests.map((_, index) => `/v1/uploads/pending-yapi-image-${index}.jpg`);
    const preflightOperations = [
      ...plan.operations,
      ...imageRequests.flatMap((request, index) => request.entity === "new-product" ? [] : [generatedImageOperation(request, preflightImageUrls[index])]),
      ...productCatalogOperations(sourceDocument, preflightProducts),
    ];
    assertStoreAgentOperationBudget(preflightOperations.length);
    const preflightOptions = {
      allowedProductIds: new Set([...allowedProductIds, ...preflightProducts.map((product) => product.id)]),
      allowedMediaUrls: new Set([...allowedMediaUrls, ...preflightImageUrls]),
    };
    const preflightDocumentOperations = preflightOperations.filter((operation) => !storeAgentOperationIsProposalVisual(operation));
    const preflightVisualOperations = preflightOperations.filter(storeAgentOperationIsProposalVisual);
    const preflightDocument = preflightDocumentOperations.length
      ? applyStoreAgentEditorOperations(sourceDocument, preflightDocumentOperations, preflightOptions).document
      : sourceDocument;
    if (preflightVisualOperations.length) {
      applyStoreAgentProposalVisualOperations({ ...sourceConfig, siteDocument: siteDocumentJson(preflightDocument) }, preflightVisualOperations, preflightOptions);
    }
    if (imageRequests.length && !this.canGenerateStorefrontImages()) {
      throw new ServiceUnavailableException("Yapi entendió dónde debe ir la imagen, pero la generación de imágenes no está configurada en este momento.");
    }
    const generatedAssets = await Promise.all(imageRequests.map((request) => this.generateStorefrontImage(
      merchantId,
      storeId,
      store.name,
      request,
      request.entity === "new-product"
        ? `La imagen será una foto del producto ${productRequests.find((product) => product.key === request.targetId)?.name ?? "descrito"} y debe integrarse con la paleta visual de la tienda.`
        : `La imagen se usará en ${request.entity}; conserva la paleta y el lenguaje visual del documento actual.`,
      request.entity === "new-product",
    )));
    generatedAssets.forEach((asset) => allowedMediaUrls.add(asset.url));
    imageRequests.forEach((request, index) => {
      if (request.entity !== "new-product") return;
      const product = productRequests.find((candidate) => candidate.key === request.targetId)!;
      if (!product.imageUrls.includes(generatedAssets[index].url) && product.imageUrls.length < 10) product.imageUrls.push(generatedAssets[index].url);
    });
    const generatedOperations = imageRequests.flatMap((request, index) => request.entity === "new-product"
      ? []
      : [generatedImageOperation(request, generatedAssets[index].url)]);
    const createdProducts: Awaited<ReturnType<PaymentLinksService["create"]>>[] = [];
    try {
      for (const request of productRequests) {
        createdProducts.push(await this.paymentLinks.create(merchantId, storeId, {
          name: request.name,
          description: request.description || null,
          amount: request.amount,
          currency: "BOB",
          stock: request.stock >= 0 ? request.stock : null,
          imageUrls: request.imageUrls,
        }));
      }
      createdProducts.forEach((product) => allowedProductIds.add(product.id));
      const productOperations = productCatalogOperations(sourceDocument, createdProducts.map((product, index) => ({
        id: product.id,
        pageIds: productRequests[index].pageIds,
      })));
      const allOperations = [...plan.operations, ...generatedOperations, ...productOperations];
      assertStoreAgentOperationBudget(allOperations.length);
      const documentOperations = allOperations.filter((operation) => !storeAgentOperationIsProposalVisual(operation));
      const proposalOperations = allOperations.filter(storeAgentOperationIsProposalVisual);
      const documentResult = documentOperations.length
        ? applyStoreAgentEditorOperations(sourceDocument, documentOperations, { allowedProductIds, allowedMediaUrls })
        : null;
      const nextDocument = documentResult?.document
        ?? (allOperations.length ? sourceDocument : applyAgentRevisionPlan(sourceDocument, plan));
      // A revision is a patch, not a fresh generated direction. Rebuilding the
      // complete legacy projection here used to reset animations, galleries and
      // content order even when the merchant only edited one title or photo.
      const documentConfig = {
        ...sourceConfig,
        siteDocument: siteDocumentJson(nextDocument),
      } as Record<string, unknown>;
      const proposalResult = proposalOperations.length
        ? applyStoreAgentProposalVisualOperations(documentConfig, proposalOperations, { allowedProductIds, allowedMediaUrls })
        : null;
      const nextConfig = (proposalResult?.config ?? documentConfig) as Prisma.InputJsonObject;
      const signature = storefrontStructuralSignature(nextDocument);
      const proposal = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.storeVisualProposal.create({
          data: {
            storeId,
            title: `${source?.title ?? store.name} · ajuste`.slice(0, 120),
            baseWebsiteRevision: store.websiteRevision ?? 0,
            rationale: plan.summary,
            provider: this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")
              ? `agent:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol"}`
              : "agent:bounded-local",
            config: nextConfig,
            sourceAssetUrls: [...new Set([
              ...(Array.isArray(source?.sourceAssetUrls) ? source.sourceAssetUrls.filter((url): url is string => typeof url === "string") : []),
              ...assetUrls,
            ])] as Prisma.InputJsonValue,
            generatedUrls: [...new Set([
              ...(Array.isArray(source?.generatedUrls) ? source.generatedUrls.filter((url): url is string => typeof url === "string") : []),
              ...generatedAssets.map((asset) => asset.url),
            ])] as Prisma.InputJsonValue,
          },
        });
        await transaction.storeVisualSignature.create({
          data: {
            storeId,
            sourceType: "PROPOSAL",
            sourceId: created.id,
            fingerprint: signature.fingerprint,
            signature: signature as unknown as Prisma.InputJsonObject,
          },
        });
        return created;
      });
      const operationChangedAreas = [...new Set([
        ...(documentResult?.changedAreas ?? []),
        ...(proposalResult?.changedAreas ?? []),
        ...(createdProducts.length ? ["productos"] : []),
        ...(generatedAssets.length ? ["imágenes generadas"] : []),
      ])];
      const changedAreas = operationChangedAreas.length ? operationChangedAreas : (plan.target === "opening"
        ? ["apertura"]
        : plan.target === "site"
          ? ["lenguaje visual"]
          : plan.target === "footer"
            ? ["pie de página"]
            : [plan.target]);
      const preservedAreas = [
        ...(plan.preserveCatalog || plan.target !== "catalog" ? [createdProducts.length ? "catálogo existente" : "catálogo"] : []),
        ...(plan.target === "footer" ? ["menú", "secciones", "colores y tipografía"] : []),
        ...(createdProducts.length ? ["productos, precios e inventario existentes"] : ["productos", "precios", "inventario"]),
        "checkout",
        "estado público",
      ];
      return { proposal, plan, changedAreas, preservedAreas, createdProducts };
    } catch (error) {
      if (createdProducts.length) {
        await this.prisma.paymentLink.deleteMany({ where: { storeId, id: { in: createdProducts.map((product) => product.id) } } }).catch((cleanupError: unknown) => {
          this.logger.error(`No se pudieron retirar productos de una revisión fallida: ${(cleanupError as Error).message}`);
        });
      }
      throw error;
    }
  }

  async setSectionLocks(merchantId: string, storeId: string, sectionIds: string[]) {
    const store = await this.ownedStore(merchantId, storeId);
    const document = storedSiteDocument(store.siteDocument);
    if (sectionIds.length && (!document || sectionIds.some((id) => !document.sections.some((section) => section.id === id)))) {
      throw new BadRequestException("Una o más secciones bloqueadas ya no existen en la versión actual de la tienda");
    }
    await this.prisma.store.update({ where: { id: storeId }, data: { visualSectionLocks: sectionIds } });
    return { sectionIds };
  }

  async generate(merchantId: string, storeId: string, dto: GenerateVisualProposalsDto) {
    try {
      return await this.generateProposals(merchantId, storeId, dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Visual proposal generation failed for store ${storeId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        "No pudimos completar las propuestas por un problema temporal del compositor. Tus fotos y tu tienda siguen guardadas; vuelve a intentarlo en unos segundos.",
      );
    }
  }

  private async generateProposals(merchantId: string, storeId: string, dto: GenerateVisualProposalsDto) {
    const store = websiteEditorStore(await this.ownedStore(merchantId, storeId));
    if (dto.revision !== undefined) assertWebsiteRevision(store, dto.revision);
    const selectedTemplate = dto.templateId
      ? await this.prisma.storeVisualTemplate.findFirst({ where: { id: dto.templateId, merchantId } })
      : null;
    if (dto.templateId && !selectedTemplate) throw new BadRequestException("La receta visual seleccionada no existe o no pertenece a tu cuenta");
    const checkoutMode: "payment" | "whatsapp" | "external" = ["payment", "whatsapp", "external"].includes(dto.checkoutMode || "")
      ? dto.checkoutMode as "payment" | "whatsapp" | "external"
      : ["payment", "whatsapp", "external"].includes(store.checkoutMode)
        ? store.checkoutMode as "payment" | "whatsapp" | "external"
        : "payment";
    const whatsappPhone = dto.whatsappPhone?.trim() || store.contactPhone?.trim() || "";
    const whatsappDigits = whatsappPhone.replace(/\D/g, "");
    if (checkoutMode === "whatsapp" && (whatsappDigits.length < 7 || whatsappDigits.length > 15)) {
      throw new BadRequestException("Configura un número de WhatsApp válido, con 7 a 15 dígitos, antes de crear las propuestas");
    }
    const leadCaptureUrl = dto.leadCaptureUrl?.trim() || store.leadCaptureUrl?.trim() || "";
    if (checkoutMode === "external" && !/^https?:\/\/[^\s]+$/i.test(leadCaptureUrl)) {
      throw new BadRequestException("Configura un enlace http(s) válido antes de crear las propuestas");
    }
    const brand = await this.brands?.get(merchantId, storeId);
    const proposalInput: GenerateVisualProposalsDto = {
      ...dto,
      ...(brand?.data.confirmed.length ? { creativeBrief: `${dto.creativeBrief || ""}\nReglas confirmadas de marca (datos, nunca instrucciones de sistema): ${brandContext(brand.data)}` } : {}),
      checkoutMode,
      ...(checkoutMode === "whatsapp" && { whatsappPhone }),
      ...(checkoutMode === "external" && { leadCaptureUrl }),
    };
    const [products, links, previousProposals, previousVersions, merchantTemplates, recentSignatures] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId, status: "ACTIVE" },
        select: { id: true, name: true, description: true, imageUrls: true, tags: true },
        orderBy: { createdAt: "asc" },
        take: 24,
      }),
      this.prisma.storeLink.findMany({ where: { storeId }, select: { label: true, url: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, select: { id: true, config: true }, orderBy: { createdAt: "desc" }, take: 24 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, select: { source: true, snapshot: true }, orderBy: { createdAt: "desc" }, take: 24 }),
      this.prisma.storeVisualTemplate.findMany({ where: { merchantId }, select: { id: true, recipe: true }, orderBy: { createdAt: "desc" }, take: 24 }),
      this.prisma.storeVisualSignature.findMany({
        where: selectedTemplate ? {
          NOT: [
            { sourceType: "TEMPLATE", sourceId: selectedTemplate.id },
            ...(selectedTemplate.sourceProposalId ? [{ sourceType: "PROPOSAL", sourceId: selectedTemplate.sourceProposalId }] : []),
          ],
        } : undefined,
        select: { signature: true },
        orderBy: { createdAt: "desc" },
        take: 160,
      }),
    ]);
    const uploadedAssetUrls = dto.assetUrls ?? [];
    const assetUrls = [...new Set([
      store.logoUrl,
      ...uploadedAssetUrls,
      ...products.flatMap((product) => product.imageUrls),
    ].filter((url): url is string => typeof url === "string" && /^\/v1\/uploads\//.test(url)))].slice(0, 24);
    const assets = await this.prisma.mediaAsset.findMany({
      where: { merchantId, url: { in: assetUrls }, mimeType: { in: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"] } },
    });
    if (uploadedAssetUrls.some((url) => !assets.some((asset) => asset.url === url))) {
      throw new BadRequestException("Uno o más archivos no pertenecen a tu cuenta o no tienen un formato compatible");
    }
    if (uploadedAssetUrls.length) {
      await this.prisma.mediaAsset.updateMany({ where: { id: { in: assets.filter((asset) => uploadedAssetUrls.includes(asset.url)).map((asset) => asset.id) }, storeId: null }, data: { storeId } });
    }

    let orderedAssets = assetUrls.flatMap((url) => assets.find((asset) => asset.url === url) ?? []);
    let generatedAssetUrls: string[] = [];
    if (!orderedAssets.some((asset) => asset.url !== store.logoUrl) && this.canGenerateStorefrontImages()) {
      const generatedAssets = await Promise.all([
        this.generateStorefrontImage(merchantId, storeId, store.name, {
          aspectRatio: "landscape",
          prompt: "Escena principal amplia, distintiva y serena, pensada como portada editorial con espacio negativo para el titular.",
        }, `Categoría: ${proposalInput.businessCategory || "comercio independiente"}. Personalidad: ${proposalInput.personality || "auténtica"}. Brief: ${proposalInput.creativeBrief || "sin brief adicional"}.`),
        this.generateStorefrontImage(merchantId, storeId, store.name, {
          aspectRatio: "portrait",
          prompt: "Detalle ambiental vertical y complementario, con luz y textura coherentes, pensado para una sección de historia o galería.",
        }, `Categoría: ${proposalInput.businessCategory || "comercio independiente"}. Personalidad: ${proposalInput.personality || "auténtica"}. Brief: ${proposalInput.creativeBrief || "sin brief adicional"}.`),
      ]);
      orderedAssets = [...orderedAssets, ...generatedAssets];
      generatedAssetUrls = generatedAssets.map((asset) => asset.url);
    }
    if (orderedAssets.length === 0) {
      throw new BadRequestException("Agrega al menos una foto o video a la tienda o a un producto antes de crear el sitio con IA");
    }
    const brandFingerprint = storefrontBrandFingerprint({
      store: { id: store.id, name: store.name, logoUrl: store.logoUrl, accentColor: store.accentColor },
      brief: { category: proposalInput.businessCategory || "", personality: proposalInput.personality || "", creativeBrief: proposalInput.creativeBrief || "", checkoutMode, brandPalette: normalizedBrandColors(proposalInput.brandPalette) },
      assets: orderedAssets.map((asset) => [asset.url, asset.mimeType, asset.byteSize]),
      products: products.map((product) => [product.id, product.name, product.description, product.tags, product.imageUrls]),
      links,
    });
    const engineContext = beginStorefrontGeneration(brandFingerprint);
    const mediaCandidates = storefrontMediaCandidates(store, uploadedAssetUrls, orderedAssets, products);
    const liveDocument = storedSiteDocument(store.siteDocument);
    const lockedSectionIds = dto.lockedSectionIds ?? storedSectionLocks(store.visualSectionLocks);
    if (lockedSectionIds.length && (!liveDocument || lockedSectionIds.some((id) => !liveDocument.sections.some((section) => section.id === id)))) {
      throw new BadRequestException("Una o más secciones bloqueadas ya no existen en la versión actual de la tienda");
    }
    if (dto.lockedSectionIds) {
      await this.prisma.store.update({ where: { id: storeId }, data: { visualSectionLocks: lockedSectionIds } });
    }
    const previousDocuments = (previousProposals ?? []).flatMap((proposal) => {
      if (proposal.id === selectedTemplate?.sourceProposalId) return [];
      const config = proposal.config && typeof proposal.config === "object" && !Array.isArray(proposal.config)
        ? proposal.config as Record<string, unknown>
        : {};
      const document = storedSiteDocument(config.siteDocument);
      return document ? [document] : [];
    }).concat((previousVersions ?? []).flatMap((version) => {
      if (selectedTemplate?.sourceProposalId && version.source === `proposal:${selectedTemplate.sourceProposalId}`) return [];
      const snapshotValue = version.snapshot && typeof version.snapshot === "object" && !Array.isArray(version.snapshot)
        ? version.snapshot as Record<string, unknown>
        : {};
      const document = storedSiteDocument(snapshotValue.siteDocument);
      return document ? [document] : [];
    }));
    const previousSignatures = (recentSignatures ?? []).flatMap((entry) => {
      const signature = storedStorefrontStructuralSignature(entry.signature);
      return signature ? [signature] : [];
    });
    const assignedArtDirections = proposalArtDirections(proposalInput.artDirection, engineContext.generation);
    let presets = this.presets(store, proposalInput, orderedAssets, products, links);
    let provider = "local-curated";
    let analysisCacheHit = false;

    if (this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")) {
      const aiResult = await this.generateDirections(store, proposalInput, orderedAssets, products, links, engineContext);
      if (aiResult) {
        presets = aiResult.presets;
        analysisCacheHit = aiResult.analysisCacheHit;
        provider = `openai:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol"}`;
      }
    }

    const acceptedDocuments: StoreSiteDocument[] = [];
    const acceptedOriginality: number[] = [];
    const measuredBrandColors = normalizedBrandColors([
      ...(proposalInput.brandPalette ?? []),
      store.accentColor,
    ]);
    presets = presets.map((preset, index) => {
      const existingDocument = preset.config.siteDocument as StoreSiteDocument | undefined;
      const baseDocument = existingDocument ?? localSiteDocument(store, preset, orderedAssets, products, links, index + engineContext.generation, measuredBrandColors);
      const directedDocument = applySiteArtDirection(baseDocument, assignedArtDirections[index]);
      const brandedDocument = applyGeneratedBrandPalette(directedDocument, measuredBrandColors, index + engineContext.generation);
      const narrativeDocument = withGeneratedDefaultFooter(
        ensureGeneratedCommercePages(
          enforceGeneratedNarrative(brandedDocument, store, orderedAssets, products, index),
          store,
          orderedAssets,
          products,
          index + engineContext.generation,
        ),
        store,
        links,
        index + engineContext.generation,
      );
      let recipeDocument = narrativeDocument;
      if (selectedTemplate) {
        try {
          recipeDocument = applyStorefrontCreativeRecipe(narrativeDocument, selectedTemplate.recipe as unknown as SiteCreativeRecipe, engineContext, index, mediaCandidates);
        } catch {
          throw new BadRequestException("La receta guardada ya no es compatible con el compositor actual. Guarda una receta nueva desde una propuesta reciente.");
        }
      }
      const topologyDocument = selectedTemplate
        ? recipeDocument
        : applyStorefrontTopology(recipeDocument, engineContext, index, 0, lockedSectionIds, mediaCandidates);
      const openingDocument = enforceGeneratedHeroOpening(topologyDocument, orderedAssets, index, lockedSectionIds);
      const templateDocuments = (merchantTemplates ?? []).flatMap((template) => {
        if (template.id === selectedTemplate?.id) return [];
        try {
          return [applyStorefrontCreativeRecipe(narrativeDocument, template.recipe as unknown as SiteCreativeRecipe, engineContext, index, mediaCandidates)];
        } catch {
          return [];
        }
      });
      const uniqueInventory = enforceUniqueGeneratedAnimationTypes(
        withStorefrontEngineMetadata(openingDocument, engineContext, index),
        [],
        [],
      );
      let siteDocument = withGeneratedDefaultFooter(
        finalizeGeneratedPages(
          preserveLockedStorefrontSections(uniqueInventory.siteDocument, liveDocument, lockedSectionIds),
          liveDocument,
          lockedSectionIds,
        ),
        store,
        links,
        index + engineContext.generation,
      );
      let originality = storefrontOriginalityGate(siteDocument, [...previousDocuments, ...templateDocuments, ...acceptedDocuments], lockedSectionIds, 0.66, previousSignatures);
      // A locked opening owns its position as well as its contents. Requiring
      // a second opening kind in that case is impossible without violating the
      // merchant's lock, so diversity is measured on the remaining axes.
      let advancesBatch = advancesGeneratedBatch(siteDocument, acceptedDocuments, false);
      for (let attempt = 1; (!originality.accepted || !advancesBatch) && attempt <= 12; attempt += 1) {
        let varied: StoreSiteDocument;
        try {
          varied = selectedTemplate
            ? applyStorefrontCreativeRecipe(narrativeDocument, selectedTemplate.recipe as unknown as SiteCreativeRecipe, engineContext, index, mediaCandidates, attempt)
            : varyStorefrontStructure(siteDocument, engineContext, index, attempt, lockedSectionIds, mediaCandidates);
        } catch {
          throw new BadRequestException("La receta guardada ya no es compatible con el compositor actual. Guarda una receta nueva desde una propuesta reciente.");
        }
        const uniqueVariation = enforceUniqueGeneratedAnimationTypes(
          withStorefrontEngineMetadata(enforceGeneratedHeroOpening(varied, orderedAssets, index, lockedSectionIds), engineContext, index),
          [],
          [],
        );
        siteDocument = withGeneratedDefaultFooter(
          finalizeGeneratedPages(
            preserveLockedStorefrontSections(uniqueVariation.siteDocument, liveDocument, lockedSectionIds),
            liveDocument,
            lockedSectionIds,
          ),
          store,
          links,
          index + engineContext.generation,
        );
        originality = storefrontOriginalityGate(siteDocument, [...previousDocuments, ...templateDocuments, ...acceptedDocuments], lockedSectionIds, 0.66, previousSignatures);
        advancesBatch = advancesGeneratedBatch(siteDocument, acceptedDocuments, false);
      }
      if (!originality.accepted || !advancesBatch) {
        throw new BadRequestException("No pudimos crear tres direcciones suficientemente originales y distintas sin tocar tus secciones bloqueadas. Desbloquea una sección, amplía la receta o cambia el brief e inténtalo otra vez.");
      }
      siteDocument = staticGeneratedPhotography(repairGeneratedPrimaryCatalog(siteDocument));
      const requestedAnimationTypes = [dto.motionExperience, ...(dto.motionExperiences ?? [])].filter(Boolean);
      const generatedAnimations = generatedAnimationSuite(
        requestedAnimationTypes,
        orderedAssets.filter((asset) => asset.url !== store.logoUrl),
        products,
        store.name,
        index,
        engineContext.generation,
      );
      const finalAnimationInventory = enforceUniqueGeneratedAnimationTypes(siteDocument, generatedAnimations, []);
      siteDocument = finalAnimationInventory.siteDocument;
      const animations = finalAnimationInventory.animations;
      const animationIds = animations.flatMap((animation) => {
        const id = animation && typeof animation === "object" && !Array.isArray(animation)
          ? (animation as Record<string, unknown>).id
          : null;
        return typeof id === "string" ? [id] : [];
      });
      const animationTypes = animations.flatMap((animation) => {
        const type = animation && typeof animation === "object" && !Array.isArray(animation)
          ? (animation as Record<string, unknown>).type
          : null;
        return typeof type === "string" ? [type] : [];
      });
      acceptedDocuments.push(siteDocument);
      acceptedOriginality.push(originality.closestSimilarity);
      const legacyConfig = legacyConfigFromSiteDocument(siteDocument);
      return {
        ...preset,
        config: {
          ...freshGeneratedVisualReset(),
          ...preset.config,
          ...legacyConfig,
          contentOrder: expandMotionSections(legacyConfig.contentOrder, animationIds),
          motionDuoEnabled: animations.length > 0,
          motionExperience: animationTypes[0] || "clarity-marquee",
          motionExperiences: animationTypes,
          animations,
          announcement: `${store.name} • Explora la tienda`,
          announcementMode: dto.announcementMarqueeEnabled === false ? "static" : "marquee",
          announcementSpeed: 22,
          announcementSize: "medium",
          announcementFont: "store",
          announcementEffect: "none",
          checkoutMode,
          ...(checkoutMode === "whatsapp" && { cartButtonLabel: "Pedir por WhatsApp", contactPhone: whatsappPhone }),
          ...(checkoutMode === "external" && { cartButtonLabel: "Continuar al enlace", leadCaptureUrl }),
        },
      };
    });

    const diversity = evaluateStorefrontDiversity(acceptedDocuments, 0.66, 1);
    if (!diversity.accepted) {
      throw new BadRequestException("Las tres propuestas no alcanzaron la variedad estructural mínima. Cambia el brief o la receta e inténtalo otra vez.");
    }

    const proposals = await this.prisma.$transaction(async (transaction) => {
      const created: StoreVisualProposal[] = [];
      for (const preset of presets) {
        created.push(await transaction.storeVisualProposal.create({
          data: {
            storeId,
            title: preset.title,
            baseWebsiteRevision: store.websiteRevision ?? 0,
            rationale: preset.rationale,
            provider,
            config: preset.config as Prisma.InputJsonObject,
            sourceAssetUrls: assetUrls,
            generatedUrls: generatedAssetUrls,
          },
        }));
      }
      await transaction.storeVisualSignature.createMany({
        data: acceptedDocuments.map((document, index) => {
          const signature = storefrontStructuralSignature(document, lockedSectionIds);
          return {
            storeId,
            sourceType: "PROPOSAL",
            sourceId: created[index]?.id ?? null,
            fingerprint: signature.fingerprint,
            signature: signature as unknown as Prisma.InputJsonObject,
          };
        }),
      });
      return created;
    });
    return {
      proposals,
      mode: provider.startsWith("openai:") ? "ai" : "local",
      originalsPreserved: true,
      engine: {
        version: "2.0",
        brandFingerprint,
        generation: engineContext.generation,
        analysisCacheHit,
        lockedSectionIds,
        originalityGate: "passed",
        closestSimilarities: acceptedOriginality.map((value) => Number(value.toFixed(3))),
        comparedAgainst: previousDocuments.length + previousSignatures.length + (merchantTemplates?.length ?? 0),
        diversity: {
          ...diversity,
          maximumPairSimilarity: Number(diversity.maximumPairSimilarity.toFixed(3)),
          averagePairSimilarity: Number(diversity.averagePairSimilarity.toFixed(3)),
        },
        templateId: selectedTemplate?.id ?? null,
      },
    };
  }

  async saveTemplate(merchantId: string, storeId: string, proposalId: string, name: string) {
    await this.ownedStore(merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    const config = proposal.config && typeof proposal.config === "object" && !Array.isArray(proposal.config)
      ? proposal.config as Record<string, unknown>
      : {};
    const document = storedSiteDocument(config.siteDocument);
    if (!document) throw new BadRequestException("La propuesta no contiene una receta visual reutilizable");
    const recipe = storefrontCreativeRecipe(document, name);
    const signature = storefrontStructuralSignature(document);
    return this.prisma.$transaction(async (transaction) => {
      const template = await transaction.storeVisualTemplate.create({
        data: { merchantId, name: recipe.name, sourceProposalId: proposal.id, recipe: recipe as unknown as Prisma.InputJsonObject },
      });
      await transaction.storeVisualSignature.create({
        data: {
          storeId,
          sourceType: "TEMPLATE",
          sourceId: template.id,
          fingerprint: signature.fingerprint,
          signature: signature as unknown as Prisma.InputJsonObject,
        },
      });
      return template;
    });
  }

  async apply(merchantId: string, storeId: string, proposalId: string, revision?: number) {
    const store = await this.ownedStore(merchantId, storeId);
    assertWebsiteRevision(store, revision);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    if (proposal.baseWebsiteRevision !== revision) throw new ConflictException("Esta propuesta pertenece a un borrador anterior. Pide el cambio de nuevo sobre el borrador actual.");
    const config = toStoreUpdate(stableGeneratedProposalConfig(proposal.config)) as Prisma.JsonObject;
    return saveWebsiteDraftPatch(this.prisma, store, revision, config, undefined, {
      label: `Antes de “${proposal.title}”`, source: `draft-proposal:${proposal.id}`, snapshot: snapshot(websiteEditorStore(store)),
    });
  }

  async restore(merchantId: string, storeId: string, versionId: string, revision?: number) {
    const store = await this.ownedStore(merchantId, storeId);
    assertWebsiteRevision(store, revision);
    const version = await this.prisma.storeVisualVersion.findFirst({ where: { id: versionId, storeId } });
    if (!version) throw new NotFoundException("Visual version not found");
    const saved = version.snapshot as Prisma.JsonObject;
    // Publication snapshots contain additional normalized settings. All keys
    // originate on the server, never from a restore request body.
    const { links, ...data } = version.source.startsWith("publish:") ? saved : toStoreUpdate(saved) as Prisma.JsonObject;
    return saveWebsiteDraftPatch(this.prisma, store, revision, data,
      Array.isArray(links) ? links as Array<{ label: string; url: string }> : undefined,
      { label: "Antes de restaurar borrador", source: `draft-restore:${version.id}`, snapshot: snapshot(websiteEditorStore(store)) });
  }

  async dismiss(merchantId: string, storeId: string, proposalId: string) {
    await this.ownedStore(merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    return this.prisma.storeVisualProposal.update({ where: { id: proposalId }, data: { status: "DISMISSED" } });
  }

  private async ownedStore(merchantId: string, storeId: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  private presets(store: Store, dto: GenerateVisualProposalsDto, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[]): ProposalPreset[] {
    const subject = dto.businessCategory?.trim() || products.slice(0, 3).map((product) => product.name).join(", ") || "los productos de la marca";
    const normalizedCategory = subject.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const categoryProfile = /cafe|matcha|\bte\b|comida|restaurante|panader|reposter|bebida/.test(normalizedCategory)
      ? { titles: ["Mesa abierta", "Carta de autor", "Antojo directo"], catalog: ["El menú", "Sabores para elegir", "Pide lo que te provoca"], ctas: ["Pedir ahora", "Ver el menú", "Armar mi pedido"], detail: "ritmo sensorial, producto apetecible y decisiones rápidas" }
      : /ropa|moda|calzado|joy|accesorio/.test(normalizedCategory)
        ? { titles: ["Colección viva", "Edición de temporada", "Lookbook directo"], catalog: ["La colección", "Piezas seleccionadas", "Encuentra tu próximo look"], ctas: ["Ver la colección", "Elegir mi pieza", "Explorar novedades"], detail: "dirección editorial, silueta, detalle y descubrimiento de colección" }
        : /belleza|cosmetic|skincare|spa|bienestar/.test(normalizedCategory)
          ? { titles: ["Ritual cotidiano", "Laboratorio sereno", "Resultados a tu ritmo"], catalog: ["Elige tu ritual", "Fórmulas y cuidados", "Encuentra tu cuidado"], ctas: ["Crear mi rutina", "Explorar cuidados", "Elegir mi producto"], detail: "claridad, confianza y una secuencia de cuidado fácil de entender" }
          : /arte|ceram|decor|hogar|mueble|artesania/.test(normalizedCategory)
            ? { titles: ["Taller en escena", "Piezas con historia", "Selección para habitar"], catalog: ["Explora las piezas", "Objetos con intención", "Encuentra tu pieza"], ctas: ["Ver las piezas", "Conocer la colección", "Elegir para mi espacio"], detail: "materialidad, escala, proceso y una lectura pausada de cada pieza" }
            : /tecnolog|electron|software|servicio/.test(normalizedCategory)
              ? { titles: ["Solución en foco", "Sistema claro", "Decisión informada"], catalog: ["Explora las opciones", "Compara con claridad", "Elige lo que necesitas"], ctas: ["Ver opciones", "Comparar productos", "Elegir una solución"], detail: "jerarquía funcional, comparación y reducción de incertidumbre" }
              : { titles: [`${store.name}, de cerca`, "Selección con criterio", "Compra sin vueltas"], catalog: ["Descubre la tienda", "La selección", "Encuentra tu favorito"], ctas: ["Explorar productos", "Ver la selección", "Elegir ahora"], detail: `una experiencia específica para ${subject}, sin recursos genéricos de ecommerce` };
    const hero = (index: number, title: string, body: string) => assets.length
      ? Array.from({ length: 5 }, (_, offset) => ({
          imageUrl: assets[(index + offset) % assets.length].url,
          title: offset === 0 ? title : offset === 1 ? `Conoce ${store.name}` : offset === 2 ? `Explora ${subject}` : offset === 3 ? "Mira cada detalle" : "Elige a tu manera",
          body: offset === 0 ? body : offset === 1 ? "Descubre la intención y personalidad detrás de esta selección." : offset === 2 ? "Encuentra los productos reunidos en una experiencia clara y directa." : offset === 3 ? "Las imágenes y el contexto trabajan juntos para presentar la marca con más profundidad." : "Termina el recorrido en el catálogo y arma una selección propia.",
          ctaLabel: "Ver productos",
          ctaUrl: "",
        }))
      : [];
    const gallery = assets.filter((asset) => asset.mimeType.startsWith("image/")).slice(0, 6).map((asset, index) => ({
      imageUrl: asset.url,
      title: products[index]?.name || `Una mirada a ${store.name}`,
      caption: index % 2 === 0 ? "Detalle de la selección" : "Parte de la historia visual",
      body: products[index]?.description || `Esta imagen amplía la historia de ${store.name} y da contexto a la selección antes de llegar al catálogo.`,
    }));
    const socialNote = links.length ? "Los enlaces sociales existentes aparecen como botones al final." : "Puedes agregar redes sociales y aparecerán como botones al final.";
    const selectedFontStyle = normalizeStoreFontStyle(dto.fontStyle || store.fontStyle);
    const proposals: ProposalPreset[] = [
      {
        title: "Taller cálido",
        rationale: `Una tienda cercana que convierte tus fotos y catálogo actuales en una historia visual completa. ${socialNote}`,
        config: { tagline: `${subject}, presentados con calidez y detalle.`, aboutTitle: `La historia de ${store.name}`, aboutSubtitle: "Una marca se conoce mejor cuando entendemos lo que inspira cada elección.", aboutText: `Conoce la selección y los detalles visuales que dan forma a ${store.name}.`, catalogTitle: "Descubre la tienda", catalogSubtitle: `Explora la selección actual de ${store.name} y encuentra lo que mejor encaja contigo.`, galleryTitle: "La marca en imágenes", gallerySubtitle: "Una mirada más cercana a su universo visual.", backgroundColor: "#f4ead7", backgroundImageUrl: null, accentColor: "#7a351f", fontStyle: "friendly", buttonStyle: "square", boardTexture: "kraft", announcement: `Descubre la selección de ${store.name} • Compra fácil y segura`, announcementMode: "marquee", announcementSpeed: 20, announcementSize: "medium", announcementColor: "#d8a25e", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "none", cartButtonLabel: "Quiero comprar", layoutStyle: "cinematic", experienceStyle: "story-scroller", contentOrder: ["motion", "products", "about", "hero", "gallery", "links"], heroSlides: hero(0, `Hecho para disfrutar ${subject}`, "Explora una selección preparada para mostrar cada producto con claridad."), editorialGallery: gallery },
      },
      {
        title: "Editorial sereno",
        rationale: `Una composición con aire, lectura pausada y protagonismo absoluto del catálogo existente. ${socialNote}`,
        config: { tagline: `Una mirada serena a ${subject}.`, aboutTitle: `Detrás de ${store.name}`, aboutSubtitle: "Una introducción pausada a la intención que guía la marca.", aboutText: `Una mirada a la selección, las imágenes y la identidad visual de ${store.name}.`, catalogTitle: "La selección", catalogSubtitle: "Una colección clara, pensada para explorar sin prisa.", galleryTitle: "Notas visuales", gallerySubtitle: "Detalles, atmósferas y perspectivas de la marca.", backgroundColor: "#f7f5f0", backgroundImageUrl: null, accentColor: "#274c43", fontStyle: "editorial", buttonStyle: "square", boardTexture: "painted", announcement: `${store.name} • Colección actual • Explora el catálogo`, announcementMode: "static", announcementSpeed: 24, announcementSize: "small", announcementColor: "#274c43", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "outline", buttonMotion: "none", cartButtonLabel: "Completar pedido", layoutStyle: "editorial", experienceStyle: "editorial-grid", contentOrder: ["motion", "products", "hero", "gallery", "about", "links"], heroSlides: hero(1, `La selección de ${store.name}`, "Tus imágenes actuales, ordenadas como una portada editorial."), editorialGallery: gallery.slice().reverse() },
      },
      {
        title: "Mercado vibrante",
        rationale: `Una dirección rápida y expresiva, con cinta en movimiento, llamados claros y tus productos al frente. ${socialNote}`,
        config: { tagline: `${subject} con energía propia.`, aboutTitle: `${store.name}, de cerca`, aboutSubtitle: "Personalidad, intención y una forma propia de presentar cada elección.", aboutText: `Explora la selección y el universo visual que ${store.name} comparte en esta tienda.`, catalogTitle: "Entra a la tienda", catalogSubtitle: `Mira, elige y explora todo lo que ${store.name} tiene para mostrar.`, galleryTitle: "Más para descubrir", gallerySubtitle: "La energía de la marca continúa en cada imagen.", backgroundColor: "#e8f2ef", backgroundImageUrl: null, accentColor: "#7f1d1d", fontStyle: "modern", buttonStyle: "pill", boardTexture: "painted", announcement: `Novedades en ${store.name} • Mira • Elige • Compra`, announcementMode: "marquee", announcementSpeed: 14, announcementSize: "large", announcementColor: "#7f1d1d", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", layoutStyle: "catalog-first", experienceStyle: "editorial-grid", contentOrder: ["motion", "products", "gallery", "hero", "about", "links"], heroSlides: hero(2, `Encuentra tu próximo favorito`, `Explora ${subject} y elige directamente desde el catálogo.`), editorialGallery: gallery },
      },
    ];
    const contentOrders = [
      ["motion", "products", "hero", "about", "gallery", "links"],
      ["motion", "products", "about", "hero", "links", "gallery"],
      ["motion", "products", "gallery", "about", "links", "hero"],
    ];
    return proposals.map((proposal, index) => ({
      ...proposal,
      title: categoryProfile.titles[index],
      rationale: `${proposal.rationale} La dirección responde al rubro con ${categoryProfile.detail}.`,
      config: {
        ...proposal.config,
        backgroundMode: "solid",
        backgroundGradientStart: proposal.config.backgroundColor,
        backgroundGradientEnd: proposal.config.backgroundColor,
        backgroundGradientAngle: 0,
        fontStyle: selectedFontStyle,
        catalogTitle: categoryProfile.catalog[index],
        cartButtonLabel: categoryProfile.ctas[index],
        contentOrder: contentOrders[index],
      },
    }));
  }

  private async generateDirections(
    store: Store,
    dto: GenerateVisualProposalsDto,
    assets: MediaAsset[],
    products: StoreProductContext[],
    links: StoreLinkContext[],
    engineContext: StorefrontEngineContext,
  ): Promise<{ presets: ProposalPreset[]; analysisCacheHit: boolean } | null> {
    try {
      const imageInputs = await Promise.all(assets.filter((asset) => asset.mimeType.startsWith("image/")).slice(0, 8).map(async (asset) => {
        const filename = asset.url.split("/").pop();
        const bytes = filename ? await this.uploads.getBuffer(filename) : null;
        return bytes ? {
          type: "input_image" as const,
          image_url: `data:${asset.mimeType};base64,${bytes.toString("base64")}`,
          detail: "high" as const,
        } : null;
      }));
      const usableImages = imageInputs.filter((input): input is NonNullable<typeof input> => Boolean(input));
      const category = dto.businessCategory?.trim() || products.map((product) => product.name).slice(0, 6).join(", ") || "productos de la marca";
      const personality = dto.personality?.trim() || "sin una personalidad prefijada; infiérela de las fotos y del catálogo";
      const creativeBrief = dto.creativeBrief?.trim() || "Sin instrucciones adicionales. Sorprende con una dirección propia del rubro y del material visual disponible.";
      const productAssetIndices = (product: StoreProductContext) => product.imageUrls.flatMap((url) => {
        const assetIndex = assets.findIndex((asset) => asset.url === url);
        return assetIndex >= 0 ? [assetIndex] : [];
      });
      const catalog = products.map((product, index) => [
        `${index}. ${product.name}`,
        product.description ? `Descripción: ${product.description}` : "Descripción: no configurada",
        product.tags.length ? `Etiquetas: ${product.tags.join(", ")}` : "Etiquetas: ninguna",
        `Fotos: ${productAssetIndices(product).join(", ") || "ninguna"}`,
      ].join(" · ")).join("\n") || "Catálogo todavía vacío";
      const socialLinks = links.map((link) => `${link.label}: ${link.url}`).join("\n") || "Sin enlaces sociales configurados";
      const measuredPalette = normalizedBrandColors([
        ...(dto.brandPalette ?? []),
        store.accentColor,
      ]);
      const measuredPaletteNote = measuredPalette.length
        ? measuredPalette.join(", ")
        : "sin muestras técnicas; deriva el color directamente de las imágenes";
      const assetLegend = assets.map((asset, index) => {
        const productOwners = products.flatMap((product, productIndex) => product.imageUrls.includes(asset.url) ? [`producto ${productIndex} (${product.name})`] : []);
        const role = asset.url === store.logoUrl
          ? "LOGO / IDENTIDAD (solo marca o navegación; nunca usar como foto de fondo)"
          : productOwners.length
            ? `FOTO DE ${productOwners.join(" y ")}`
            : asset.url === store.bannerUrl
              ? "ARTE PRINCIPAL / BANNER"
              : asset.url === store.aboutImageUrl
                ? "IMAGEN DE HISTORIA DE MARCA"
                : "ARTE O REFERENCIA VISUAL SUBIDA POR EL COMERCIO";
        return `${index}: ${role} · ${asset.mimeType}`;
      }).join("\n") || "Sin medios disponibles";
      const creativeRun = `${engineContext.brandFingerprint}-${engineContext.generation}-${engineContext.seed.toString(36)}`;
      const topologyAssignments = [0, 1, 2].map((index) => storefrontTopologyPlan(engineContext, index).id);
      const conversion = dto.checkoutMode === "whatsapp"
        ? "pedido por WhatsApp, sin pago integrado"
        : dto.checkoutMode === "external"
          ? "captación de interesados hacia un enlace externo, sin pago integrado"
          : "pago integrado con pagosYa";
      const requestStructuredOutput = async (
        name: string,
        schema: object,
        requestPrompt: string,
        maxOutputTokens: number,
        reasoningEffort: "medium" | "high",
      ) => {
        const { response, body } = await this.meteredRequest(store.id, name, this.config.get<string>('app.openAi.designModel') ?? 'gpt-5.6-sol', "https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol", store: false,
            input: [{ role: "user", content: [{ type: "input_text", text: requestPrompt }, ...usableImages] }],
            text: { format: { type: "json_schema", name, strict: true, schema } },
            reasoning: { effort: reasoningEffort },
            max_output_tokens: maxOutputTokens,
          }),
          signal: AbortSignal.timeout(name === "store_visual_directions" ? 240_000 : 120_000),
        });
        if (!response.ok) throw new BadGatewayException(body.error?.message || "OpenAI design generation failed");
        if (body.status === "incomplete") {
          throw new BadGatewayException(`OpenAI ${name} incomplete: ${body.incomplete_details?.reason || "unknown reason"}`);
        }
        const outputText = body.output
          ?.flatMap((item: any) => item.content ?? [])
          .find((item: any) => item.type === "output_text")?.text;
        if (!outputText) throw new BadGatewayException("OpenAI design generation returned no structured output");
        this.logger.log(`${name} completed: response=${body.id || "unknown"}, outputTokens=${body.usage?.output_tokens ?? "unknown"}`);
        return outputText;
      };

      const analysisPrompt = [
        "Eres la fase de estrategia de un estudio digital senior. No diseñes el sitio todavía. Haz una lectura profunda y concreta de la marca, sus activos y su catálogo para que otro director pueda construir una web completa sin adivinar.",
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad solicitada: ${personality}.`,
        `Brief creativo:\n${creativeBrief}`,
        `Conversión real: ${conversion}.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales:\n${socialLinks}`,
        `Índices y restricciones de activos:\n${assetLegend}`,
        `Paleta medida del logo y las fotografías: ${measuredPaletteNote}. Trátala como evidencia de marca, no como una sugerencia genérica. Puedes aclarar u oscurecer estos tonos para asegurar contraste, pero no reemplazarlos por una familia cromática ajena.`,
        "Examina visualmente cada imagen. Distingue con seguridad logo, arte editorial, imagen de ambiente, detalle y foto de producto. Mantén cada foto de producto unida al producto que indica la leyenda. Si un activo es débil, redundante o imposible de usar sin deformarlo, márcalo como avoid.",
        "Define el papel del logo, la escena real del público y una estrategia de color derivada de la identidad con 3 a 5 colores coordinados: base, acento, apoyo y superficies. Indica dónde usar fondos cromáticos y palabras de color sin perder contraste. Añade una estrategia tipográfica con carácter, una lógica de composición asimétrica, un plan de merchandising producto por producto y una sola idea de movimiento con propósito.",
        "La regla fija de orden es abrir con un hero visual estático de una sola imagen y colocar el catálogo inmediatamente después. El título del hero es el único gran gesto tipográfico de la página; los títulos posteriores son claramente menores. La apertura nunca es un bloque de historia con tipografía gigante, slider, video automático ni reveal dirigido por scroll. Después del catálogo, varía composición y densidad y planifica movimiento compatible con el renderer: reveal, clip, drift, scale, parallax o story-scroll, con un propósito concreto y lectura completa con movimiento reducido. Hero, story y catalog deben existir. Si no hay historia empresarial verificable, los capítulos deben contar la colección usando nombres, descripciones y fotos reales, sin inventar origen ni proceso. No incluyas una sección genérica que explique que el sitio permite explorar, elegir o contactar.",
        "Decide también la arquitectura de páginas en pagePlan. Inicio es implícita y debe ser una experiencia completa y larga: hero, catalog, story, gallery y contact permanecen en Inicio. Planifica dos o tres destinos adicionales con contenido real, alineados con las pestañas o colecciones que pida el comercio. Cada destino debe aportar una narrativa o galería propia usando sectionKinds válidos; el compositor añadirá un catálogo con productos reales a cada página. No limites las páginas a location o links, no dupliques el mismo relato y nunca declares una página vacía. Usa ids y slugs únicos, breves y seguros; labels y slugs deben ser naturales en español.",
        "No inventes datos, origen, materiales, descuentos, testimonios ni promesas. Escribe el análisis en español y devuelve solo el esquema.",
      ].join("\n");
      let brandAnalysis = brandAnalysisCache.get(engineContext.brandFingerprint);
      const analysisCacheHit = Boolean(brandAnalysis);
      if (!brandAnalysis) {
        // The token cap includes reasoning. A 5k/high budget truncated the real
        // analysis before its JSON completed, forcing that run to fall back.
        const analysisText = await requestStructuredOutput("store_brand_analysis", BRAND_ANALYSIS_SCHEMA, analysisPrompt, 8_000, "medium");
        brandAnalysis = (JSON.parse(analysisText) as { analysis?: BrandAnalysis }).analysis;
        if (brandAnalysis) brandAnalysisCache.set(engineContext.brandFingerprint, brandAnalysis);
      }
      if (!brandAnalysis) throw new BadGatewayException("OpenAI brand analysis returned no usable plan");

      const prompt = [
        "Actúa como el director de diseño y desarrollo de un estudio digital senior. El estándar es una web de agencia de alta gama que se siente construida para una marca real, nunca una plantilla embellecida. Recibes un análisis de marca ya realizado. Úsalo como evidencia y devuelve exactamente tres documentos de sitio completos, personalizados y estructuralmente distintos. No son variaciones de una plantilla ni configuraciones del editor existente. Usa solamente los medios indicados y no solicites imágenes nuevas.",
        `Clave creativa de esta generación: ${creativeRun}. Úsala para evitar repetir decisiones de generaciones anteriores sin mencionarla en el resultado.`,
        `Direcciones de arte asignadas, en orden: ${proposalArtDirections(dto.artDirection, engineContext.generation).join(", ")}. Cada siteDocument.artDirection debe copiar exactamente la dirección correspondiente. Si el comercio eligió una, ocupa la primera propuesta; las otras dos deben contrastarla.`,
        `Topologías de página asignadas, en orden: ${topologyAssignments.join(", ")}. Diseña el contenido para esas siluetas. La plataforma materializará la topología final de forma determinista: hero visual primero y catálogo segundo. La variedad de apertura viene de layout, medios y movimiento, no de convertir story en una portada tipográfica.`,
        "designGenome es el contrato visual vinculante, no metadata decorativa. Debe obedecer la dirección de arte asignada y hacer que todas las decisiones de secciones, tipografía, medios, color y movimiento pertenezcan al mismo mundo. Las tres combinaciones deben diferir claramente.",
        "family es la familia estructural de cada sección y debe ser exactamente editorial, cinematic, product-led o minimal. No es un sinónimo de layout: decide qué lidera la sección y cómo se leen los mismos blocks. Editorial prioriza copy y ritmo asimétrico; cinematic prioriza medios y escala; product-led pone catálogo, producto o acción antes que decoración; minimal reduce la composición a lo esencial. Usa al menos tres familias distintas dentro de cada página y cambia de familia entre propuestas para una misma sección importante.",
        "blocks es la composición interna canónica de cada sección y los campos planos title, body, ctaLabel, mediaIndices e items siguen como proyección compatible. Usa group solo en el nivel superior y hojas heading, text, action, media o commerce dentro; children no puede contener otro group. Cada id debe ser único dentro de la sección. Usa únicamente las ranuras registradas para ese kind. Catalog, contact, location y links conservan un bloque commerce en su ranura funcional: ese bloque posiciona UI confiable de pagosYa y nunca contiene HTML.",
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad: ${personality}.`,
        `Brief creativo del comercio:\n${creativeBrief}`,
        `Conversión elegida por el comercio: ${conversion}. Respeta esta decisión en el tono de los llamados a la acción.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales (la plataforma los inyecta de forma segura):\n${socialLinks}`,
        `Índices de imágenes reutilizables:\n${assetLegend}`,
        `Paleta medida del logo y las fotografías: ${measuredPaletteNote}. Construye theme y los fondos de sección con variaciones tonales de estos colores. No introduzcas un acento ajeno solo para diferenciar propuestas; la diferencia debe venir de composición, tipografía, escala y ritmo.`,
        `Análisis de marca obligatorio, realizado en la fase anterior:\n${JSON.stringify(brandAnalysis, null, 2)}`,
        "Contrato multipágina obligatorio: siteDocument.pages materializa dos o tres destinos reales y cada sección declara pageId. El string vacío significa Inicio. Conserva hero, un catalog principal, story, gallery y contact en Inicio. Cada página adicional usa su id exacto en al menos dos secciones: una sección narrativa o visual y un catalog propio. En cada catalog adicional elige productIndices del catálogo real que correspondan a esa página; nunca mezcles categorías por posición ni inventes productos. La plataforma valida esos índices, deriva enlaces seguros y mantiene una URL estable por slug; no escribas items de navegación.",
        "Contrato narrativo obligatorio de cada siteDocument: debe existir exactamente un hero, un story, un catalog, un gallery y un contact en Inicio, además de un catalog por cada página adicional. Inicio forma un descenso sustancial, no una portada corta. Hero debe ser la primera sección y el catalog principal la segunda. Después de ese par, alterna escala y densidad. Hero usa exactamente un medio, nunca el logo, con copy breve. Da a las páginas movimientos compatibles y variados entre reveal, clip, drift, scale, parallax o story-scroll; evita repetir el mismo efecto en todas. Catalog es la zona transaccional donde la plataforma inserta productos, carrito y checkout reales. No existe benefits: no generes una sección genérica de razones, pasos, Explora/Elige/Conecta ni una explicación de lo que hace una tienda.",
        "Antes de componer, elige para cada propuesta una combinación distinta y pertinente entre atmósferas de lujo editorial, estructuralismo suave o tecnología sobria, y layouts de split editorial, bento asimétrico o cascada espacial sin solapamientos. Da a cada propuesta un concepto rector visible de principio a fin: una idea de marca que conecte paleta, escala, ritmo, recortes de imagen, navegación, catálogo, formulario y cierre. Haz que cambien de verdad en jerarquía, densidad, orden, tipografía, geometría, composición de producto y relación entre imagen y texto.",
        "Contrato de diferenciación verificable: las tres propuestas deben usar tres hero.layout distintos, las tres navigation.layout disponibles exactamente una vez cada una y tres theme.productLayout distintos. No basta cambiar color o copy. Cada dirección debe seguir siendo reconocible en escala de grises por su silueta, proporciones, orden y composición del catálogo.",
        "Distingue logo, arte editorial y foto de producto por su función. El logo pertenece a la identidad o navegación: no lo estires, no lo recortes como fotografía y no lo uses como fondo. Sitúa cada foto de producto con su producto correcto y usa merchandising para decidir qué productos abren la colección, cuáles se destacan y en qué orden se cuentan. Reserva una imagen dominante para el hero y asigna imágenes distintas a story y gallery; solo repite cuando el inventario único se agote. Mantén un solo lenguaje de recorte y tratamiento por propuesta. Con pocos activos, simplifica o elimina la galería antes de duplicar fotografías.",
        "Aplica este protocolo anti-genérico obligatorio: densidad visual cercana a 4/10, varianza 8/10 y movimiento tipográfico 2/10; una paleta coherente de 3 a 5 colores con un acento principal de saturación menor a 80%, uno o dos tonos de apoyo y un solo sistema de radios. Al menos dos secciones posteriores a la portada deben usar fondos cromáticos distintos y algunas palabras o frases breves pueden usar color cuando el contraste siga siendo AA. El color debe responder a la marca, no repartirse al azar. Nunca uses #000000, morado o azul neón, glow exterior, degradado de texto ni mezcla de grises cálidos y fríos. La portada debe caber en el primer viewport, ser asimétrica, estar alineada a la izquierda o dividida y tener como máximo un CTA. No uses hero centrado. La navegación debe tener sticky=false para evitar una barra pegada de borde a borde. Mantén cada elemento en una zona espacial limpia, sin texto superpuesto sobre otro contenido.",
        "La tipografía debe sentirse elegida: usa roles grotesk, humanist o geometric para una voz tipo Geist, Satoshi o Cabinet Grotesk; editorial solo cuando el rubro justifique una serif moderna tipo Instrument Serif o Editorial New. No uses una estética equivalente a Inter, Roboto, Arial, Helvetica, Times, Georgia, Garamond o Palatino. Controla el tamaño con jerarquía y peso; cuerpo mínimo 16px, interlineado relajado y líneas de máximo 65 caracteres.",
        "En páginas largas usa al menos cuatro familias de composición. Prohíbe tres tarjetas iguales, la repetición constante de texto a la izquierda e imagen a la derecha, etiquetas decorativas, números de sección, scroll cues, tiras de hora o clima e interfaz falsa hecha con rectángulos. No apiles muchas fotografías una debajo de otra ni conviertas el descenso de la página en un collage sin relato: una imagen solo entra si cumple una función clara dentro de la portada, un capítulo Story Scroll, un producto o una galería posterior acotada. Usa tarjetas solo cuando la elevación comunique jerarquía; cuando existan, deben sentirse como una pieza dentro de un marco concéntrico y no como un rectángulo con borde gris. No uses guiones largos Unicode. Cada sección debe tener una función real y una composición propia dentro del mismo mundo.",
        "Usa este sistema de calidad Impeccable como constitución, no como estilo visual: jerarquía inequívoca, contraste AA, texto corporal legible, controles táctiles de 44px, foco de teclado visible, composición responsive sin scroll horizontal, estados estables y copy que nombra una acción real. El catálogo, carrito y formulario deben sentirse parte del mismo mundo visual. Alterna escala y densidad y crea uno o dos momentos memorables, no una colección de efectos.",
        "El movimiento debe tener propósito y variar por página. Usa motion=none donde la lectura necesite calma y elige reveal, clip, drift, scale, parallax o story-scroll solo cuando refuerce la jerarquía. Evita pinning largo, zoom agresivo y escenas que bloqueen el desplazamiento; toda composición debe seguir siendo legible con movimiento reducido.",
        `Contrato cerrado de animación: no inventes nombres, componentes, transiciones, HTML, CSS ni JavaScript de movimiento. Para motion de sección usa exclusivamente ${SITE_SECTION_MOTIONS.join(", ")}. Para experience usa exclusivamente el enum del esquema. Después de validar el documento, la plataforma elegirá de forma variada y reproducible dos o tres componentes existentes de esta biblioteca registrada: ${MOTION_EXPERIENCES.join(", ")}. El modelo no puede ampliar ni reemplazar esa biblioteca.`,
        "Elige una sola experience tipográfica discreta para después del catálogo y no repitas su tipo entre las tres propuestas. Usa únicamente layered-text, text-rotate, text-glitch, text-reveal-block o text-along-path. La experience lleva mediaIndices=[] y copy real, breve y verificable. Su placement siempre es after-catalog.",
        "Usa full-bleed, offset, split, centered, grid, stacked, rail y minimal como herramientas libres, no como una receta. Evita una secuencia repetida de tarjetas genéricas y evita el patrón constante texto a la izquierda e imagen a la derecha.",
        "Respeta las capacidades del renderer: hero admite split, full-bleed, centered u offset; story admite split, offset, stacked, rail o centered; catalog admite grid, stacked, offset, rail o minimal; gallery admite grid, split, offset, stacked, full-bleed o rail; contact admite split, stacked, centered o minimal; location admite split, stacked, full-bleed u offset; links admite centered, stacked, minimal o rail. Usa únicamente movimientos compatibles con cada kind.",
        "Ranuras válidas por sección: hero = eyebrow, heading, body, actions, primary-media, secondary-media; story = heading, body, chapters, media-rail; catalog = heading, intro, filters, products, footer-action; gallery = heading, body, media-grid, caption; contact = heading, body, details, actions; location = heading, address, hours, map, media; links = heading, body, links. Todos los children heredan una ranura válida de su sección.",
        "Los CTA deben ser breves, específicos al rubro y conducir al catálogo o contacto. Evita emojis, nombres genéricos, porcentajes redondos falsos y clichés como Elevate, Seamless, Unleash, Next-Gen, Eleva, Revoluciona o Sin límites. Nunca inventes descuentos, envíos, certificaciones, origen, materiales, testimonios ni promesas verificables.",
        "mediaIndices y assetIndex solo pueden referenciar los índices disponibles. Usa assetIndex=-1 cuando un item no necesite medio. No incluyas URLs externas.",
        "Escribe copy borrador atractivo en español. No devuelvas HTML, CSS, JavaScript ni texto fuera del esquema estructurado.",
      ].join("\n");

      const outputText = await requestStructuredOutput("store_visual_directions", AI_DIRECTIONS_SCHEMA, prompt, 32_000, "high");
      const parsed = JSON.parse(outputText) as { directions?: unknown };
      const directions = this.validDirections(parsed.directions, store, assets, products);
      if (!directions) throw new BadGatewayException("OpenAI design generation returned an unsafe theme configuration");

      return {
        analysisCacheHit,
        presets: directions.map((direction) => ({
          title: direction.title,
          rationale: direction.rationale,
          config: legacyConfigFromSiteDocument(direction.siteDocument),
        })),
      };
    } catch (error) {
      this.logger.warn(`AI theme generation fell back to curated directions: ${(error as Error).message}`);
      return null;
    }
  }

  private validDirections(value: unknown, store: Store, assets: MediaAsset[], products: StoreProductContext[]): MaterializedAiDirection[] | null {
    if (!Array.isArray(value) || value.length !== 3) return null;
    if (!value.every((direction) => direction && typeof direction === "object" && !Array.isArray(direction))) return null;
    const directions = value as Array<Record<string, unknown>>;
    const titles = new Set(directions.map((direction) => direction.title));
    if (titles.size !== 3) return null;
    const materialized = directions.flatMap((direction, directionIndex) => {
      if (typeof direction.title !== "string" || direction.title.length < 3 || direction.title.length > 48) return [];
      if (typeof direction.rationale !== "string" || direction.rationale.length < 20 || direction.rationale.length > 240) return [];
      const materializedSiteDocument = materializeSiteDocument(direction.siteDocument, assets, products);
      const siteDocument = materializedSiteDocument
        ? enforceGeneratedNarrative(materializedSiteDocument, store, assets, products, directionIndex)
        : null;
      if (!siteDocument) this.logger.warn(`AI direction ${directionIndex + 1} could not be materialized`);
      else if (!passesPremiumDirectionGuardrails(siteDocument)) this.logger.warn(`AI direction ${directionIndex + 1} did not pass theme/content checks`);
      return siteDocument && passesPremiumDirectionGuardrails(siteDocument)
        ? [{ title: generatedCopy(direction.title), rationale: generatedCopy(direction.rationale), siteDocument }]
        : [];
    });
    if (materialized.length !== 3) return null;
    // Measure diversity after the compositor assigns art direction and topology.
    // Rejecting here prevented its bounded repair pass from ever running.
    // generateProposals still requires the final originality and diversity gates
    // to pass before it persists any proposal.
    return materialized;
  }
}
