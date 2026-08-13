import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset, Prisma, Store } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";

const VISUAL_FIELDS = [
  "tagline", "bannerUrl", "backgroundColor", "backgroundImageUrl", "aboutText", "aboutImageUrl",
  "accentColor", "fontStyle", "buttonStyle", "boardTexture", "announcement", "announcementMode",
  "announcementSpeed", "announcementSize", "announcementColor", "promotionEnabled", "promotionTitle",
  "promotionBody", "promotionCtaLabel", "promotionCtaUrl", "heroSlides", "contentOrder", "editorialGallery",
  "buttonVariant", "buttonMotion", "cartButtonLabel",
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
  backgroundColor: string;
  accentColor: string;
  fontStyle: "mono" | "modern" | "editorial" | "friendly";
  buttonStyle: "rounded" | "pill" | "square";
  boardTexture: "chalkboard" | "kraft" | "painted";
  buttonVariant: "solid" | "outline" | "soft";
  buttonMotion: "lift" | "pulse" | "none";
  cartButtonLabel: "Ir a pagar" | "Completar pedido" | "Quiero comprar" | "Agregar y pagar";
  contentOrder: Array<"hero" | "products" | "about" | "gallery" | "links">;
  announcement: string;
  announcementMode: "static" | "marquee";
  announcementSpeed: number;
  announcementSize: "small" | "medium" | "large";
  announcementColor: string;
  promotionEnabled: boolean;
  promotionTitle: string;
  promotionBody: string;
  promotionCtaLabel: string;
  backgroundImageIndex: number;
  heroSlides: Array<{ assetIndex: number; title: string; body: string; ctaLabel: string }>;
  editorialGallery: Array<{ assetIndex: number; caption: string; boxColor: string }>;
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
          "title", "rationale", "tagline", "aboutText", "backgroundColor", "accentColor", "fontStyle", "buttonStyle",
          "boardTexture", "buttonVariant", "buttonMotion", "cartButtonLabel", "contentOrder", "announcement",
          "announcementMode", "announcementSpeed", "announcementSize", "announcementColor", "promotionEnabled",
          "promotionTitle", "promotionBody", "promotionCtaLabel", "backgroundImageIndex", "heroSlides", "editorialGallery",
        ],
        properties: {
          title: { type: "string", minLength: 3, maxLength: 48 },
          rationale: { type: "string", minLength: 20, maxLength: 240 },
          tagline: { type: "string", minLength: 3, maxLength: 160 },
          aboutText: { type: "string", minLength: 40, maxLength: 600 },
          backgroundColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          accentColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          fontStyle: { type: "string", enum: ["mono", "modern", "editorial", "friendly"] },
          buttonStyle: { type: "string", enum: ["rounded", "pill", "square"] },
          boardTexture: { type: "string", enum: ["chalkboard", "kraft", "painted"] },
          buttonVariant: { type: "string", enum: ["solid", "outline", "soft"] },
          buttonMotion: { type: "string", enum: ["lift", "pulse", "none"] },
          cartButtonLabel: { type: "string", enum: ["Ir a pagar", "Completar pedido", "Quiero comprar", "Agregar y pagar"] },
          contentOrder: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: { type: "string", enum: CONTENT_SECTIONS },
          },
          announcement: { type: "string", minLength: 5, maxLength: 180 },
          announcementMode: { type: "string", enum: ["static", "marquee"] },
          announcementSpeed: { type: "integer", minimum: 8, maximum: 40 },
          announcementSize: { type: "string", enum: ["small", "medium", "large"] },
          announcementColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          promotionEnabled: { type: "boolean" },
          promotionTitle: { type: "string", maxLength: 80 },
          promotionBody: { type: "string", maxLength: 240 },
          promotionCtaLabel: { type: "string", maxLength: 36 },
          backgroundImageIndex: { type: "integer", minimum: -1, maximum: 7 },
          heroSlides: {
            type: "array", minItems: 1, maxItems: 3,
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
              required: ["assetIndex", "caption", "boxColor"],
              properties: {
                assetIndex: { type: "integer", minimum: 0, maximum: 7 },
                caption: { type: "string", minLength: 3, maxLength: 180 },
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
      store.backgroundImageUrl,
      store.aboutImageUrl,
      ...jsonImageUrls(store.heroSlides),
      ...jsonImageUrls(store.editorialGallery),
      ...products.flatMap((product) => product.imageUrls),
    ].filter((url): url is string => typeof url === "string" && /^\/v1\/uploads\//.test(url)))].slice(0, 8);
    const assets = await this.prisma.mediaAsset.findMany({
      where: { merchantId, url: { in: assetUrls }, mimeType: { in: ["image/png", "image/jpeg", "image/webp"] } },
    });
    if (uploadedAssetUrls.some((url) => !assets.some((asset) => asset.url === url))) {
      throw new BadRequestException("Una o más imágenes no pertenecen a tu cuenta o no tienen un formato compatible");
    }
    if (uploadedAssetUrls.length) {
      await this.prisma.mediaAsset.updateMany({ where: { id: { in: assets.filter((asset) => uploadedAssetUrls.includes(asset.url)).map((asset) => asset.id) }, storeId: null }, data: { storeId } });
    }

    const orderedAssets = assetUrls.flatMap((url) => assets.find((asset) => asset.url === url) ?? []);
    let presets = this.presets(store, dto, orderedAssets, products, links);
    let provider = "local-curated";

    if (this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")) {
      const aiPresets = await this.generateDirections(store, dto, orderedAssets, products, links);
      if (aiPresets) {
        presets = aiPresets;
        provider = `openai:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-luna"}`;
      }
    }

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
      ? [{ imageUrl: assets[index % assets.length].url, title, body, ctaLabel: "Ver productos", ctaUrl: "" }]
      : [];
    const gallery = assets.slice(0, 6).map((asset, index) => ({ imageUrl: asset.url, caption: products[index]?.name || `Selección de ${store.name}` }));
    const socialNote = links.length ? "Los enlaces sociales existentes aparecen como botones al final." : "Puedes agregar redes sociales y aparecerán como botones al final.";
    return [
      {
        title: "Taller cálido",
        rationale: `Una tienda cercana que convierte tus fotos y catálogo actuales en una historia visual completa. ${socialNote}`,
        config: { tagline: `${subject}, presentados con calidez y detalle.`, aboutText: `Esta es una propuesta de texto para presentar ${store.name}. Revisa y adapta la historia antes de publicar para que refleje fielmente tu negocio.`, backgroundColor: "#f4ead7", backgroundImageUrl: null, accentColor: "#7a351f", fontStyle: "friendly", buttonStyle: "rounded", boardTexture: "kraft", announcement: `Descubre la selección de ${store.name} • Compra fácil y segura`, announcementMode: "marquee", announcementSpeed: 20, announcementSize: "medium", announcementColor: "#d8a25e", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "lift", cartButtonLabel: "Quiero comprar", contentOrder: ["hero", "products", "gallery", "about", "links"], heroSlides: hero(0, `Hecho para disfrutar ${subject}`, "Explora una selección preparada para mostrar cada producto con claridad."), editorialGallery: gallery },
      },
      {
        title: "Editorial sereno",
        rationale: `Una composición con aire, lectura pausada y protagonismo absoluto del catálogo existente. ${socialNote}`,
        config: { tagline: `Una mirada serena a ${subject}.`, aboutText: `Borrador editorial para contar el origen y la intención de ${store.name}. Sustituye este texto con detalles reales de tu proceso, materiales y comunidad antes de publicarlo.`, backgroundColor: "#f7f5f0", backgroundImageUrl: null, accentColor: "#274c43", fontStyle: "editorial", buttonStyle: "square", boardTexture: "painted", announcement: `${store.name} • Colección actual • Explora el catálogo`, announcementMode: "marquee", announcementSpeed: 24, announcementSize: "small", announcementColor: "#274c43", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "outline", buttonMotion: "none", cartButtonLabel: "Completar pedido", contentOrder: ["hero", "products", "about", "gallery", "links"], heroSlides: hero(1, `La selección de ${store.name}`, "Tus imágenes actuales, ordenadas como una portada editorial."), editorialGallery: gallery.slice().reverse() },
      },
      {
        title: "Mercado vibrante",
        rationale: `Una dirección rápida y expresiva, con cinta en movimiento, llamados claros y tus productos al frente. ${socialNote}`,
        config: { tagline: `${subject} con energía propia.`, aboutText: `Texto de muestra para presentar la personalidad de ${store.name}. Revísalo antes de aplicar y agrega únicamente información real sobre tu marca.`, backgroundColor: "#f6c84f", backgroundImageUrl: null, accentColor: "#7f1d1d", fontStyle: "modern", buttonStyle: "pill", boardTexture: "painted", announcement: `Novedades en ${store.name} • Mira • Elige • Compra`, announcementMode: "marquee", announcementSpeed: 14, announcementSize: "large", announcementColor: "#7f1d1d", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", contentOrder: ["hero", "products", "gallery", "links", "about"], heroSlides: hero(2, `Encuentra tu próximo favorito`, `Explora ${subject} y elige directamente desde el catálogo.`), editorialGallery: gallery },
      },
    ];
  }

  private async generateDirections(store: Store, dto: GenerateVisualProposalsDto, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[]): Promise<ProposalPreset[] | null> {
    try {
      const imageInputs = await Promise.all(assets.slice(0, 4).map(async (asset) => {
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
      const assetLegend = assets.map((asset, index) => `${index}: ${asset.url}`).join("\n") || "Sin imágenes disponibles";
      const prompt = [
        "Actúa como director de arte y diseñador de ecommerce. Devuelve exactamente tres sitios completos y distintos, usando únicamente las imágenes ya existentes; no generes ni solicites imágenes nuevas.",
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad: ${personality}.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales (se renderizan automáticamente como botones sociales):\n${socialLinks}`,
        `Índices de imágenes reutilizables:\n${assetLegend}`,
        "Cada dirección debe decidir el sitio completo: portada con textos, paleta, fondo, historia de marca, cinta/anuncio, tipografía, botones, galería y orden de secciones.",
        "Los colores deben dar contraste legible: acento oscuro suficiente sobre el fondo y con texto blanco. Los productos deben aparecer pronto; products debe ocupar la posición 2 o 3.",
        "heroSlides y editorialGallery deben referenciar solamente índices disponibles. Usa -1 en backgroundImageIndex cuando un fondo fotográfico perjudique la lectura.",
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
          max_output_tokens: 2400,
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
      const directions = this.validDirections(parsed.directions);
      if (!directions) throw new BadGatewayException("OpenAI design generation returned an unsafe theme configuration");

      return directions.map((direction) => ({
        title: direction.title,
        rationale: direction.rationale,
        config: {
          tagline: direction.tagline,
          aboutText: direction.aboutText,
          backgroundColor: direction.backgroundColor.toLowerCase(),
          backgroundImageUrl: direction.backgroundImageIndex >= 0 ? assets[direction.backgroundImageIndex]?.url ?? null : null,
          accentColor: direction.accentColor.toLowerCase(),
          fontStyle: direction.fontStyle,
          buttonStyle: direction.buttonStyle,
          boardTexture: direction.boardTexture,
          buttonVariant: direction.buttonVariant,
          buttonMotion: direction.buttonMotion,
          cartButtonLabel: direction.cartButtonLabel,
          contentOrder: direction.contentOrder,
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
          editorialGallery: direction.editorialGallery.flatMap((image) => assets[image.assetIndex] ? [{ imageUrl: assets[image.assetIndex].url, caption: image.caption, boxColor: image.boxColor.toLowerCase() }] : []),
        },
      }));
    } catch (error) {
      this.logger.warn(`AI theme generation fell back to curated directions: ${(error as Error).message}`);
      return null;
    }
  }

  private validDirections(value: unknown): AiDirection[] | null {
    if (!Array.isArray(value) || value.length !== 3) return null;
    const enumValue = (candidate: unknown, values: readonly string[]) => typeof candidate === "string" && values.includes(candidate);
    const validOrder = (candidate: unknown) => Array.isArray(candidate)
      && candidate.length === CONTENT_SECTIONS.length
      && new Set(candidate).size === CONTENT_SECTIONS.length
      && candidate.every((section) => enumValue(section, CONTENT_SECTIONS))
      && [1, 2].includes(candidate.indexOf("products"));
    const validColor = (candidate: unknown) => typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate);
    const validInteger = (candidate: unknown, minimum: number, maximum: number) => typeof candidate === "number" && Number.isInteger(candidate) && candidate >= minimum && candidate <= maximum;
    if (!value.every((direction) => direction && typeof direction === "object" && !Array.isArray(direction))) return null;
    const directions = value as Array<Record<string, unknown>>;
    const titles = new Set(directions.map((direction) => direction.title));
    if (titles.size !== 3) return null;
    if (!directions.every((direction) =>
      typeof direction.title === "string" && direction.title.length >= 3 && direction.title.length <= 48
      && typeof direction.rationale === "string" && direction.rationale.length >= 20 && direction.rationale.length <= 240
      && typeof direction.tagline === "string" && direction.tagline.length >= 3 && direction.tagline.length <= 160
      && typeof direction.aboutText === "string" && direction.aboutText.length >= 40 && direction.aboutText.length <= 600
      && validColor(direction.backgroundColor) && validColor(direction.accentColor)
      && enumValue(direction.fontStyle, ["mono", "modern", "editorial", "friendly"])
      && enumValue(direction.buttonStyle, ["rounded", "pill", "square"])
      && enumValue(direction.boardTexture, ["chalkboard", "kraft", "painted"])
      && enumValue(direction.buttonVariant, ["solid", "outline", "soft"])
      && enumValue(direction.buttonMotion, ["lift", "pulse", "none"])
      && enumValue(direction.cartButtonLabel, ["Ir a pagar", "Completar pedido", "Quiero comprar", "Agregar y pagar"])
      && validOrder(direction.contentOrder)
      && typeof direction.announcement === "string" && direction.announcement.length >= 5 && direction.announcement.length <= 180
      && enumValue(direction.announcementMode, ["static", "marquee"])
      && validInteger(direction.announcementSpeed, 8, 40)
      && enumValue(direction.announcementSize, ["small", "medium", "large"])
      && validColor(direction.announcementColor)
      && typeof direction.promotionEnabled === "boolean"
      && typeof direction.promotionTitle === "string" && direction.promotionTitle.length <= 80
      && typeof direction.promotionBody === "string" && direction.promotionBody.length <= 240
      && typeof direction.promotionCtaLabel === "string" && direction.promotionCtaLabel.length <= 36
      && validInteger(direction.backgroundImageIndex, -1, 7)
      && Array.isArray(direction.heroSlides) && direction.heroSlides.length >= 1 && direction.heroSlides.length <= 3
      && direction.heroSlides.every((slide) => slide && typeof slide === "object" && validInteger(slide.assetIndex, 0, 7)
        && typeof slide.title === "string" && slide.title.length >= 3 && slide.title.length <= 80
        && typeof slide.body === "string" && slide.body.length >= 10 && slide.body.length <= 180
        && typeof slide.ctaLabel === "string" && slide.ctaLabel.length >= 2 && slide.ctaLabel.length <= 36)
      && Array.isArray(direction.editorialGallery) && direction.editorialGallery.length <= 6
      && direction.editorialGallery.every((image) => image && typeof image === "object" && validInteger(image.assetIndex, 0, 7)
        && typeof image.caption === "string" && image.caption.length >= 3 && image.caption.length <= 180
        && validColor(image.boxColor))
    )) return null;
    return directions as AiDirection[];
  }
}
