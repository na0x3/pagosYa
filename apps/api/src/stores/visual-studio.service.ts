import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset, Prisma, Store } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";

const VISUAL_FIELDS = [
  "tagline", "bannerUrl", "backgroundColor", "backgroundMode", "backgroundGradientStart", "backgroundGradientEnd", "backgroundGradientAngle", "backgroundImageUrl", "aboutText", "aboutTitle", "aboutSubtitle", "aboutImageUrl",
  "catalogTitle", "catalogSubtitle", "galleryTitle", "gallerySubtitle",
  "accentColor", "fontStyle", "buttonStyle", "boardTexture", "announcement", "announcementMode",
  "announcementSpeed", "announcementSize", "announcementColor", "promotionEnabled", "promotionImageUrl", "promotionTitle",
  "promotionBody", "promotionCtaLabel", "promotionCtaUrl", "heroSlides", "contentOrder", "layoutStyle", "experienceStyle", "motionDuoEnabled", "editorialGallery",
  "buttonVariant", "buttonMotion", "cartButtonLabel", "checkoutMode", "leadCaptureUrl", "contactPhone",
] as const;

type VisualField = (typeof VISUAL_FIELDS)[number];
type VisualConfig = Partial<Record<VisualField, unknown>>;
type StoreProductContext = { name: string; description: string | null; imageUrls: string[]; tags: string[] };
type StoreLinkContext = { label: string; url: string };

type ProposalPreset = {
  title: string;
  rationale: string;
  config: VisualConfig;
};

type AiDirection = {
  title: string;
  rationale: string;
  tagline: string;
  aboutText: string;
  aboutTitle: string;
  aboutSubtitle: string;
  catalogTitle: string;
  catalogSubtitle: string;
  galleryTitle: string;
  gallerySubtitle: string;
  backgroundColor: string;
  accentColor: string;
  fontStyle: "mono" | "modern" | "editorial" | "friendly";
  buttonStyle: "rounded" | "pill" | "square";
  buttonVariant: "solid" | "outline" | "soft";
  buttonMotion: "lift" | "pulse" | "none";
  cartButtonLabel: "Ir a pagar" | "Completar pedido" | "Quiero comprar" | "Agregar y pagar";
  contentOrder: Array<"hero" | "products" | "about" | "gallery" | "links">;
  layoutStyle: "cinematic" | "editorial" | "collage" | "catalog-first";
  experienceStyle: "coverflow" | "diagonal-marquee" | "story-scroller";
  announcement: string;
  announcementMode: "static" | "marquee";
  announcementSpeed: number;
  announcementSize: "small" | "medium" | "large";
  announcementColor: string;
  promotionEnabled: boolean;
  promotionTitle: string;
  promotionBody: string;
  promotionCtaLabel: string;
  heroSlides: Array<{ assetIndex: number; title: string; body: string; ctaLabel: string }>;
  editorialGallery: Array<{ assetIndex: number; title: string; caption: string; body: string; boxColor: string }>;
};

const CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "links"] as const;
const AI_DIRECTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["directions"],
  properties: {
    directions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title", "rationale", "tagline", "aboutText", "aboutTitle", "aboutSubtitle", "catalogTitle", "catalogSubtitle", "galleryTitle", "gallerySubtitle", "backgroundColor", "accentColor", "fontStyle", "buttonStyle",
          "buttonVariant", "buttonMotion", "cartButtonLabel", "contentOrder", "layoutStyle", "experienceStyle", "announcement",
          "announcementMode", "announcementSpeed", "announcementSize", "announcementColor", "promotionEnabled",
          "promotionTitle", "promotionBody", "promotionCtaLabel", "heroSlides", "editorialGallery",
        ],
        properties: {
          title: { type: "string", minLength: 3, maxLength: 48 },
          rationale: { type: "string", minLength: 20, maxLength: 240 },
          tagline: { type: "string", minLength: 3, maxLength: 160 },
          aboutText: { type: "string", minLength: 40, maxLength: 600 },
          aboutTitle: { type: "string", minLength: 3, maxLength: 100 },
          aboutSubtitle: { type: "string", minLength: 3, maxLength: 220 },
          catalogTitle: { type: "string", minLength: 3, maxLength: 100 },
          catalogSubtitle: { type: "string", minLength: 3, maxLength: 220 },
          galleryTitle: { type: "string", minLength: 3, maxLength: 100 },
          gallerySubtitle: { type: "string", minLength: 3, maxLength: 220 },
          backgroundColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          accentColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          fontStyle: { type: "string", enum: ["mono", "modern", "editorial", "friendly"] },
          buttonStyle: { type: "string", enum: ["rounded", "pill", "square"] },
          buttonVariant: { type: "string", enum: ["solid", "outline", "soft"] },
          buttonMotion: { type: "string", enum: ["lift", "pulse", "none"] },
          cartButtonLabel: { type: "string", enum: ["Ir a pagar", "Completar pedido", "Quiero comprar", "Agregar y pagar"] },
          contentOrder: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: { type: "string", enum: CONTENT_SECTIONS },
          },
          layoutStyle: { type: "string", enum: ["cinematic", "editorial", "collage", "catalog-first"] },
          experienceStyle: { type: "string", enum: ["coverflow", "diagonal-marquee", "story-scroller"] },
          announcement: { type: "string", minLength: 5, maxLength: 180 },
          announcementMode: { type: "string", enum: ["static", "marquee"] },
          announcementSpeed: { type: "integer", minimum: 8, maximum: 40 },
          announcementSize: { type: "string", enum: ["small", "medium", "large"] },
          announcementColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          promotionEnabled: { type: "boolean" },
          promotionTitle: { type: "string", maxLength: 80 },
          promotionBody: { type: "string", maxLength: 240 },
          promotionCtaLabel: { type: "string", maxLength: 36 },
          heroSlides: {
            type: "array", minItems: 4, maxItems: 5,
            items: {
              type: "object", additionalProperties: false,
              required: ["assetIndex", "title", "body", "ctaLabel"],
              properties: {
                assetIndex: { type: "integer", minimum: 0, maximum: 7 },
                title: { type: "string", minLength: 3, maxLength: 80 },
                body: { type: "string", minLength: 10, maxLength: 180 },
                ctaLabel: { type: "string", minLength: 2, maxLength: 36 },
              },
            },
          },
          editorialGallery: {
            type: "array", minItems: 0, maxItems: 6,
            items: {
              type: "object", additionalProperties: false,
              required: ["assetIndex", "title", "caption", "body", "boxColor"],
              properties: {
                assetIndex: { type: "integer", minimum: 0, maximum: 7 },
                title: { type: "string", minLength: 3, maxLength: 100 },
                caption: { type: "string", minLength: 3, maxLength: 180 },
                body: { type: "string", minLength: 20, maxLength: 360 },
                boxColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              },
            },
          },
        },
      },
    },
  },
} as const;

function snapshot(store: Store): Prisma.InputJsonObject {
  return Object.fromEntries(VISUAL_FIELDS.map((field) => [field, store[field] ?? null])) as Prisma.InputJsonObject;
}

function toStoreUpdate(config: unknown): Prisma.StoreUpdateInput {
  const value = config && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : {};
  const allowed = Object.fromEntries(VISUAL_FIELDS.filter((field) => field in value).map((field) => [field, value[field]]));
  return allowed as Prisma.StoreUpdateInput;
}

@Injectable()
export class VisualStudioService {
  private readonly logger = new Logger(VisualStudioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  async list(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const [proposals, versions] = await Promise.all([
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
    ]);
    return { proposals, versions };
  }

  async generate(merchantId: string, storeId: string, dto: GenerateVisualProposalsDto) {
    const store = await this.ownedStore(merchantId, storeId);
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
    const proposalInput: GenerateVisualProposalsDto = {
      ...dto,
      checkoutMode,
      ...(checkoutMode === "whatsapp" && { whatsappPhone }),
      ...(checkoutMode === "external" && { leadCaptureUrl }),
    };
    const [products, links] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId, status: "ACTIVE" },
        select: { name: true, description: true, imageUrls: true, tags: true },
        orderBy: { createdAt: "asc" },
        take: 24,
      }),
      this.prisma.storeLink.findMany({ where: { storeId }, select: { label: true, url: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    const uploadedAssetUrls = dto.assetUrls ?? [];
    const jsonImageUrls = (value: Prisma.JsonValue) => Array.isArray(value)
      ? value.flatMap((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.imageUrl === "string" ? [entry.imageUrl] : [])
      : [];
    const assetUrls = [...new Set([
      ...uploadedAssetUrls,
      store.bannerUrl,
      store.aboutImageUrl,
      store.promotionImageUrl,
      ...jsonImageUrls(store.heroSlides),
      ...jsonImageUrls(store.editorialGallery),
      ...products.flatMap((product) => product.imageUrls),
    ].filter((url): url is string => typeof url === "string" && /^\/v1\/uploads\//.test(url)))].slice(0, 8);
    const assets = await this.prisma.mediaAsset.findMany({
      where: { merchantId, url: { in: assetUrls }, mimeType: { in: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"] } },
    });
    if (uploadedAssetUrls.some((url) => !assets.some((asset) => asset.url === url))) {
      throw new BadRequestException("Uno o más archivos no pertenecen a tu cuenta o no tienen un formato compatible");
    }
    if (uploadedAssetUrls.length) {
      await this.prisma.mediaAsset.updateMany({ where: { id: { in: assets.filter((asset) => uploadedAssetUrls.includes(asset.url)).map((asset) => asset.id) }, storeId: null }, data: { storeId } });
    }

    const orderedAssets = assetUrls.flatMap((url) => assets.find((asset) => asset.url === url) ?? []);
    if (orderedAssets.length === 0) {
      throw new BadRequestException("Agrega al menos una foto o video a la tienda o a un producto antes de crear el sitio con IA");
    }
    let presets = this.presets(store, proposalInput, orderedAssets, products, links);
    let provider = "local-curated";

    if (this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")) {
      const aiPresets = await this.generateDirections(store, proposalInput, orderedAssets, products, links);
      if (aiPresets) {
        presets = aiPresets;
        provider = `openai:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-luna"}`;
      }
    }

    presets = presets.map((preset) => ({
      ...preset,
      config: {
        ...preset.config,
        checkoutMode,
        ...(checkoutMode === "whatsapp" && { cartButtonLabel: "Pedir por WhatsApp" }),
        ...(checkoutMode === "whatsapp" && { contactPhone: whatsappPhone }),
        ...(checkoutMode === "external" && { cartButtonLabel: "Continuar al enlace", leadCaptureUrl }),
      },
    }));

    const proposals = await this.prisma.$transaction(
      presets.map((preset) => {
        return this.prisma.storeVisualProposal.create({
          data: {
            storeId,
            title: preset.title,
            rationale: preset.rationale,
            provider,
            config: preset.config as Prisma.InputJsonObject,
            sourceAssetUrls: assetUrls,
            generatedUrls: [],
          },
        });
      }),
    );
    return { proposals, mode: provider.startsWith("openai:") ? "ai" : "local", originalsPreserved: true };
  }

  async apply(merchantId: string, storeId: string, proposalId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    const [updated] = await this.prisma.$transaction([
      this.prisma.store.update({ where: { id: storeId }, data: toStoreUpdate(proposal.config) }),
      this.prisma.storeVisualVersion.create({
        data: { storeId, label: `Antes de “${proposal.title}”`, source: `proposal:${proposal.id}`, snapshot: snapshot(store) },
      }),
      this.prisma.storeVisualProposal.updateMany({
        where: { storeId, id: { not: proposal.id }, status: "APPLIED" },
        data: { status: "READY", appliedAt: null },
      }),
      this.prisma.storeVisualProposal.update({ where: { id: proposal.id }, data: { status: "APPLIED", appliedAt: new Date() } }),
    ]);
    return updated;
  }

  async restore(merchantId: string, storeId: string, versionId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const version = await this.prisma.storeVisualVersion.findFirst({ where: { id: versionId, storeId } });
    if (!version) throw new NotFoundException("Visual version not found");
    const [updated] = await this.prisma.$transaction([
      this.prisma.store.update({ where: { id: storeId }, data: toStoreUpdate(version.snapshot) }),
      this.prisma.storeVisualVersion.create({
        data: { storeId, label: "Antes de restaurar", source: `restore:${version.id}`, snapshot: snapshot(store) },
      }),
    ]);
    return updated;
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
    const selectedFontStyle = ["mono", "modern", "editorial", "friendly"].includes(dto.fontStyle || "") ? dto.fontStyle : store.fontStyle;
    const proposals: ProposalPreset[] = [
      {
        title: "Taller cálido",
        rationale: `Una tienda cercana que convierte tus fotos y catálogo actuales en una historia visual completa. ${socialNote}`,
        config: { tagline: `${subject}, presentados con calidez y detalle.`, aboutTitle: `La historia de ${store.name}`, aboutSubtitle: "Una marca se conoce mejor cuando entendemos lo que inspira cada elección.", aboutText: `Esta es una propuesta de texto para presentar ${store.name}. Revisa y adapta la historia antes de publicar para que refleje fielmente tu negocio.`, catalogTitle: "Descubre la tienda", catalogSubtitle: `Explora la selección actual de ${store.name} y encuentra lo que mejor encaja contigo.`, galleryTitle: "La marca en imágenes", gallerySubtitle: "Una mirada más cercana a su universo visual.", backgroundColor: "#f4ead7", backgroundImageUrl: null, accentColor: "#7a351f", fontStyle: "friendly", buttonStyle: "rounded", boardTexture: "kraft", announcement: `Descubre la selección de ${store.name} • Compra fácil y segura`, announcementMode: "marquee", announcementSpeed: 20, announcementSize: "medium", announcementColor: "#d8a25e", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "lift", cartButtonLabel: "Quiero comprar", layoutStyle: "cinematic", experienceStyle: "story-scroller", contentOrder: ["hero", "about", "products", "gallery", "links"], heroSlides: hero(0, `Hecho para disfrutar ${subject}`, "Explora una selección preparada para mostrar cada producto con claridad."), editorialGallery: gallery },
      },
      {
        title: "Editorial sereno",
        rationale: `Una composición con aire, lectura pausada y protagonismo absoluto del catálogo existente. ${socialNote}`,
        config: { tagline: `Una mirada serena a ${subject}.`, aboutTitle: `Detrás de ${store.name}`, aboutSubtitle: "Una introducción pausada a la intención que guía la marca.", aboutText: `Borrador editorial para contar el origen y la intención de ${store.name}. Sustituye este texto con detalles reales de tu proceso, materiales y comunidad antes de publicarlo.`, catalogTitle: "La selección", catalogSubtitle: "Una colección clara, pensada para explorar sin prisa.", galleryTitle: "Notas visuales", gallerySubtitle: "Detalles, atmósferas y perspectivas de la marca.", backgroundColor: "#f7f5f0", backgroundImageUrl: null, accentColor: "#274c43", fontStyle: "editorial", buttonStyle: "square", boardTexture: "painted", announcement: `${store.name} • Colección actual • Explora el catálogo`, announcementMode: "static", announcementSpeed: 24, announcementSize: "small", announcementColor: "#274c43", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "outline", buttonMotion: "none", cartButtonLabel: "Completar pedido", layoutStyle: "editorial", experienceStyle: "coverflow", contentOrder: ["hero", "gallery", "about", "products", "links"], heroSlides: hero(1, `La selección de ${store.name}`, "Tus imágenes actuales, ordenadas como una portada editorial."), editorialGallery: gallery.slice().reverse() },
      },
      {
        title: "Mercado vibrante",
        rationale: `Una dirección rápida y expresiva, con cinta en movimiento, llamados claros y tus productos al frente. ${socialNote}`,
        config: { tagline: `${subject} con energía propia.`, aboutTitle: `${store.name}, de cerca`, aboutSubtitle: "Personalidad, intención y una forma propia de presentar cada elección.", aboutText: `Texto de muestra para presentar la personalidad de ${store.name}. Revísalo antes de aplicar y agrega únicamente información real sobre tu marca.`, catalogTitle: "Entra a la tienda", catalogSubtitle: `Mira, elige y explora todo lo que ${store.name} tiene para mostrar.`, galleryTitle: "Más para descubrir", gallerySubtitle: "La energía de la marca continúa en cada imagen.", backgroundColor: "#f6c84f", backgroundImageUrl: null, accentColor: "#7f1d1d", fontStyle: "modern", buttonStyle: "pill", boardTexture: "painted", announcement: `Novedades en ${store.name} • Mira • Elige • Compra`, announcementMode: "marquee", announcementSpeed: 14, announcementSize: "large", announcementColor: "#7f1d1d", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", layoutStyle: "catalog-first", experienceStyle: "diagonal-marquee", contentOrder: ["products", "hero", "gallery", "about", "links"], heroSlides: hero(2, `Encuentra tu próximo favorito`, `Explora ${subject} y elige directamente desde el catálogo.`), editorialGallery: gallery },
      },
    ];
    const contentOrders = [
      ["hero", "about", "products", "gallery", "links"],
      ["about", "hero", "products", "links", "gallery"],
      ["hero", "about", "products", "links", "gallery"],
    ];
    return proposals.map((proposal, index) => ({
      ...proposal,
      config: {
        ...proposal.config,
        backgroundMode: "solid",
        backgroundGradientStart: proposal.config.backgroundColor,
        backgroundGradientEnd: proposal.config.backgroundColor,
        backgroundGradientAngle: 0,
        fontStyle: selectedFontStyle,
        contentOrder: contentOrders[index],
        motionDuoEnabled: true,
      },
    }));
  }

  private async generateDirections(store: Store, dto: GenerateVisualProposalsDto, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[]): Promise<ProposalPreset[] | null> {
    try {
      const imageInputs = await Promise.all(assets.filter((asset) => asset.mimeType.startsWith("image/")).slice(0, 4).map(async (asset) => {
        const filename = asset.url.split("/").pop();
        const bytes = filename ? await this.uploads.getBuffer(filename) : null;
        return bytes ? {
          type: "input_image" as const,
          image_url: `data:${asset.mimeType};base64,${bytes.toString("base64")}`,
          detail: "low" as const,
        } : null;
      }));
      const usableImages = imageInputs.filter((input): input is NonNullable<typeof input> => Boolean(input));
      const category = dto.businessCategory?.trim() || products.map((product) => product.name).slice(0, 6).join(", ") || "productos de la marca";
      const personality = dto.personality?.trim() || "sin una personalidad indicada; infiérela de las fotos";
      const catalog = products.slice(0, 12).map((product, index) => `${index + 1}. ${product.name}${product.description ? ` — ${product.description}` : ""}`).join("\n") || "Catálogo todavía vacío";
      const socialLinks = links.map((link) => `${link.label}: ${link.url}`).join("\n") || "Sin enlaces sociales configurados";
      const assetLegend = assets.map((asset, index) => `${index}: ${asset.mimeType} · ${asset.url}`).join("\n") || "Sin medios disponibles";
      const creativeRun = `${store.id.slice(-6)}-${Date.now().toString(36).slice(-6)}`;
      const requestedFontStyle = ["mono", "modern", "editorial", "friendly"].includes(dto.fontStyle || "") ? dto.fontStyle : store.fontStyle;
      const prompt = [
        "Actúa como director de arte y arquitecto de ecommerce. Devuelve exactamente tres sitios completos cuya estructura, ritmo y jerarquía sean inequívocamente distintos; no aceptes la misma plantilla con otra paleta. Usa únicamente las imágenes ya existentes y no generes ni solicites imágenes nuevas.",
        `Clave creativa de esta generación: ${creativeRun}. Úsala para evitar repetir decisiones de generaciones anteriores sin mencionarla en el resultado.`,
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad: ${personality}.`,
        `Conversión elegida por el comercio: ${dto.checkoutMode === "whatsapp" ? "pedido por WhatsApp, sin pago integrado" : dto.checkoutMode === "external" ? "captación de interesados hacia un enlace externo, sin pago integrado" : "pago integrado con pagosYa"}. Respeta esta decisión en el tono de los llamados a la acción.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales (se renderizan automáticamente como botones sociales):\n${socialLinks}`,
        `Índices de imágenes reutilizables:\n${assetLegend}`,
        "Asigna a cada dirección un layoutStyle diferente. cinematic usa una portada inmersiva y relato gradual; editorial alterna imagen y texto con lectura pausada; collage superpone escalas y bloques visuales; catalog-first empieza por producto y usa la historia como prueba posterior.",
        "Asigna también un experienceStyle distinto a cada dirección: coverflow crea un carrusel 3D controlable; diagonal-marquee crea filas fotográficas diagonales en movimiento; story-scroller crea una historia interactiva por capítulos y debe priorizar cualquier video disponible en heroSlides. Además, las tres direcciones incluyen motionDuoEnabled: Story Scroll encadena el relato editorial por pantallas y Zoom Parallax recompone las fotos con profundidad. Todo aparece después del catálogo y usa solamente medios reales de la tienda.",
        "Cada dirección debe tener un contentOrder diferente y válido, con las cinco secciones exactamente una vez. hero y about aparecen antes que products; gallery y links aparecen después de products para que la experiencia continúe después del catálogo.",
        "Crea entre cuatro y cinco slides por dirección. Cada slide cumple un rol distinto (promesa, producto, punto de vista, detalle, transición o acción), con título, texto sustancioso y botón breve. Cuando haya suficientes imágenes, no repitas assetIndex dentro del mismo slider.",
        "La editorialGallery no es una tira de pies de foto: genera para cada imagen un título, un caption breve y un body diferente de 2–3 frases. Ese texto alimenta Story Scroll y Zoom Parallax; debe sentirse variado y específico al catálogo sin inventar hechos.",
        "Las tres direcciones también deben variar densidad, escala de imagen, anuncio estático o móvil y relación entre historia y catálogo.",
        `Usa fontStyle=${requestedFontStyle} en las tres direcciones. El fondo debe ser un único backgroundColor plano, sin degradados, franjas, fotografías de fondo ni texturas.`,
        "heroSlides y editorialGallery deben referenciar solamente índices disponibles.",
        "Escribe textos borrador atractivos en español, sin inventar descuentos, envíos, certificaciones, origen, materiales ni promesas verificables. No devuelvas HTML, CSS ni texto fuera del esquema.",
      ].join("\n");

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-luna",
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...usableImages] }],
          text: { format: { type: "json_schema", name: "store_visual_directions", strict: true, schema: AI_DIRECTIONS_SCHEMA } },
          max_output_tokens: 5200,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json() as {
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
        error?: { message?: string };
      };
      if (!response.ok) throw new BadGatewayException(body.error?.message || "OpenAI design generation failed");
      const outputText = body.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text")?.text;
      if (!outputText) throw new BadGatewayException("OpenAI design generation returned no structured output");
      const parsed = JSON.parse(outputText) as { directions?: unknown };
      const directions = this.validDirections(parsed.directions, assets);
      if (!directions) throw new BadGatewayException("OpenAI design generation returned an unsafe theme configuration");

      return directions.map((direction) => ({
        title: direction.title,
        rationale: direction.rationale,
        config: {
          tagline: direction.tagline,
          aboutTitle: direction.aboutTitle,
          aboutSubtitle: direction.aboutSubtitle,
          aboutText: direction.aboutText,
          catalogTitle: direction.catalogTitle,
          catalogSubtitle: direction.catalogSubtitle,
          galleryTitle: direction.galleryTitle,
          gallerySubtitle: direction.gallerySubtitle,
          backgroundColor: direction.backgroundColor.toLowerCase(),
          backgroundMode: "solid",
          backgroundGradientStart: direction.backgroundColor.toLowerCase(),
          backgroundGradientEnd: direction.backgroundColor.toLowerCase(),
          backgroundGradientAngle: 0,
          backgroundImageUrl: null,
          accentColor: direction.accentColor.toLowerCase(),
          fontStyle: requestedFontStyle,
          buttonStyle: direction.buttonStyle,
          boardTexture: "painted",
          buttonVariant: direction.buttonVariant,
          buttonMotion: direction.buttonMotion,
          cartButtonLabel: direction.cartButtonLabel,
          contentOrder: direction.contentOrder,
          layoutStyle: direction.layoutStyle,
          experienceStyle: direction.experienceStyle,
          motionDuoEnabled: true,
          announcement: direction.announcement,
          announcementMode: direction.announcementMode,
          announcementSpeed: direction.announcementSpeed,
          announcementSize: direction.announcementSize,
          announcementColor: direction.announcementColor.toLowerCase(),
          promotionEnabled: direction.promotionEnabled,
          promotionTitle: direction.promotionTitle,
          promotionBody: direction.promotionBody,
          promotionCtaLabel: direction.promotionCtaLabel,
          promotionCtaUrl: null,
          heroSlides: direction.heroSlides.flatMap((slide) => assets[slide.assetIndex] ? [{ imageUrl: assets[slide.assetIndex].url, title: slide.title, body: slide.body, ctaLabel: slide.ctaLabel, ctaUrl: "" }] : []),
          editorialGallery: direction.editorialGallery.flatMap((image) => assets[image.assetIndex] ? [{ imageUrl: assets[image.assetIndex].url, title: image.title, caption: image.caption, body: image.body, boxColor: image.boxColor.toLowerCase() }] : []),
        },
      }));
    } catch (error) {
      this.logger.warn(`AI theme generation fell back to curated directions: ${(error as Error).message}`);
      return null;
    }
  }

  private validDirections(value: unknown, assets: MediaAsset[]): AiDirection[] | null {
    const assetCount = assets.length;
    if (!Array.isArray(value) || value.length !== 3) return null;
    const enumValue = (candidate: unknown, values: readonly string[]) => typeof candidate === "string" && values.includes(candidate);
    const validOrder = (candidate: unknown) => Array.isArray(candidate)
      && candidate.length === CONTENT_SECTIONS.length
      && new Set(candidate).size === CONTENT_SECTIONS.length
      && candidate.every((section) => enumValue(section, CONTENT_SECTIONS));
    const validColor = (candidate: unknown) => typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate);
    const validInteger = (candidate: unknown, minimum: number, maximum: number) => typeof candidate === "number" && Number.isInteger(candidate) && candidate >= minimum && candidate <= maximum;
    if (!value.every((direction) => direction && typeof direction === "object" && !Array.isArray(direction))) return null;
    const directions = value as Array<Record<string, unknown>>;
    const titles = new Set(directions.map((direction) => direction.title));
    if (titles.size !== 3) return null;
    const layoutStyles = new Set(directions.map((direction) => direction.layoutStyle));
    const experienceStyles = new Set(directions.map((direction) => direction.experienceStyle));
    const contentOrders = new Set(directions.map((direction) => JSON.stringify(direction.contentOrder)));
    if (layoutStyles.size !== 3 || experienceStyles.size !== 3 || contentOrders.size !== 3) return null;
    if (!directions.every((direction) =>
      typeof direction.title === "string" && direction.title.length >= 3 && direction.title.length <= 48
      && typeof direction.rationale === "string" && direction.rationale.length >= 20 && direction.rationale.length <= 240
      && typeof direction.tagline === "string" && direction.tagline.length >= 3 && direction.tagline.length <= 160
      && typeof direction.aboutText === "string" && direction.aboutText.length >= 40 && direction.aboutText.length <= 600
      && typeof direction.aboutTitle === "string" && direction.aboutTitle.length >= 3 && direction.aboutTitle.length <= 100
      && typeof direction.aboutSubtitle === "string" && direction.aboutSubtitle.length >= 3 && direction.aboutSubtitle.length <= 220
      && typeof direction.catalogTitle === "string" && direction.catalogTitle.length >= 3 && direction.catalogTitle.length <= 100
      && typeof direction.catalogSubtitle === "string" && direction.catalogSubtitle.length >= 3 && direction.catalogSubtitle.length <= 220
      && typeof direction.galleryTitle === "string" && direction.galleryTitle.length >= 3 && direction.galleryTitle.length <= 100
      && typeof direction.gallerySubtitle === "string" && direction.gallerySubtitle.length >= 3 && direction.gallerySubtitle.length <= 220
      && validColor(direction.backgroundColor)
      && validColor(direction.accentColor)
      && enumValue(direction.fontStyle, ["mono", "modern", "editorial", "friendly"])
      && enumValue(direction.buttonStyle, ["rounded", "pill", "square"])
      && enumValue(direction.buttonVariant, ["solid", "outline", "soft"])
      && enumValue(direction.buttonMotion, ["lift", "pulse", "none"])
      && enumValue(direction.cartButtonLabel, ["Ir a pagar", "Completar pedido", "Quiero comprar", "Agregar y pagar"])
      && validOrder(direction.contentOrder)
      && (direction.contentOrder as string[]).indexOf("hero") < (direction.contentOrder as string[]).indexOf("products")
      && (direction.contentOrder as string[]).indexOf("about") < (direction.contentOrder as string[]).indexOf("products")
      && (direction.contentOrder as string[]).indexOf("gallery") > (direction.contentOrder as string[]).indexOf("products")
      && (direction.contentOrder as string[]).indexOf("links") > (direction.contentOrder as string[]).indexOf("products")
      && enumValue(direction.layoutStyle, ["cinematic", "editorial", "collage", "catalog-first"])
      && enumValue(direction.experienceStyle, ["coverflow", "diagonal-marquee", "story-scroller"])
      && typeof direction.announcement === "string" && direction.announcement.length >= 5 && direction.announcement.length <= 180
      && enumValue(direction.announcementMode, ["static", "marquee"])
      && validInteger(direction.announcementSpeed, 8, 40)
      && enumValue(direction.announcementSize, ["small", "medium", "large"])
      && validColor(direction.announcementColor)
      && typeof direction.promotionEnabled === "boolean"
      && typeof direction.promotionTitle === "string" && direction.promotionTitle.length <= 80
      && typeof direction.promotionBody === "string" && direction.promotionBody.length <= 240
      && typeof direction.promotionCtaLabel === "string" && direction.promotionCtaLabel.length <= 36
      && Array.isArray(direction.heroSlides) && direction.heroSlides.length >= 4 && direction.heroSlides.length <= 5
      && (assetCount < direction.heroSlides.length || new Set(direction.heroSlides.map((slide) => (slide as Record<string, unknown>).assetIndex)).size === direction.heroSlides.length)
      && direction.heroSlides.every((slide) => slide && typeof slide === "object" && validInteger(slide.assetIndex, 0, assetCount - 1)
        && typeof slide.title === "string" && slide.title.length >= 3 && slide.title.length <= 80
        && typeof slide.body === "string" && slide.body.length >= 10 && slide.body.length <= 180
        && typeof slide.ctaLabel === "string" && slide.ctaLabel.length >= 2 && slide.ctaLabel.length <= 36)
      && Array.isArray(direction.editorialGallery) && direction.editorialGallery.length <= 6
      && direction.editorialGallery.every((image) => image && typeof image === "object" && validInteger(image.assetIndex, 0, assetCount - 1)
        && assets[image.assetIndex]?.mimeType.startsWith("image/")
        && typeof image.title === "string" && image.title.length >= 3 && image.title.length <= 100
        && typeof image.caption === "string" && image.caption.length >= 3 && image.caption.length <= 180
        && typeof image.body === "string" && image.body.length >= 20 && image.body.length <= 360
        && validColor(image.boxColor))
    )) return null;
    return directions as AiDirection[];
  }
}
