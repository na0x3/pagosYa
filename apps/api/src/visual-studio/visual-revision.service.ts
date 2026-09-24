import { Optional } from '@nestjs/common';
import { BrandProfileService } from '../brand/brand-profile.service';
import { brandContext } from '../brand/brand-profile';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentLinksService } from "../payment-links/payment-links.service";
import { UploadsService } from "../uploads/uploads.service";
import { StoreAgentSelectionDto } from "./dto/send-store-agent-message.dto";
import { assertWebsiteRevision, websiteEditorStore } from "../stores/website-draft";
import { assertSelectedOperations, instructionUsesSelection, resolveStoreAgentSelection, selectedOperation } from "./store-agent-selection";
import {
  siteDocumentJson,
  type StoreSiteDocument
} from "./site-document";
import {
  storefrontStructuralSignature
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
import { type StoreAgentImageRequest, type StoreAgentRevisionPlan, localAgentRevisionPlan, withDeterministicAttachedImage, withDeterministicGeneratedOpeningImage, instructionExplicitlyUsesAttachedImage, assertAgentRevisionScope, validatedProductRequest, storeAgentInstructionLooksLikeProductCreation, normalizedAgentInstruction, generatedImageOperation, productCatalogOperations, applyAgentRevisionPlan } from "./agent-revision";
import { snapshot, storedSiteDocument } from "./visual-config";
import { VisualAiService } from "./visual-ai.service";
import { ownedStore } from "./visual-config";

/** Plans and applies the store agent's revisions to the published site document. */
@Injectable()
export class VisualRevisionService {
  private readonly logger = new Logger(VisualRevisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
    private readonly paymentLinks: PaymentLinksService,
    private readonly ai: VisualAiService,
    @Optional() private readonly brands?: BrandProfileService,
  ) {}

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
      const { response, body } = await this.ai.meteredRequest(storeId, 'visual-revision-plan', this.config.get<string>('app.openAi.designModel') ?? 'gpt-5.6-sol', "https://api.openai.com/v1/responses", {
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
    const publishedStore = await ownedStore(this.prisma, merchantId, storeId);
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
    if (imageRequests.length && !this.ai.canGenerateStorefrontImages()) {
      throw new ServiceUnavailableException("Yapi entendió dónde debe ir la imagen, pero la generación de imágenes no está configurada en este momento.");
    }
    const generatedAssets = await Promise.all(imageRequests.map((request) => this.ai.generateStorefrontImage(
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
}
