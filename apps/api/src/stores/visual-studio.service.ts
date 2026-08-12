import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset, Prisma, Store } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";

const VISUAL_FIELDS = [
  "bannerUrl", "backgroundColor", "backgroundImageUrl", "accentColor", "fontStyle", "buttonStyle",
  "boardTexture", "heroSlides", "contentOrder", "editorialGallery", "buttonVariant", "buttonMotion", "cartButtonLabel",
] as const;

type VisualField = (typeof VISUAL_FIELDS)[number];
type VisualConfig = Partial<Record<VisualField, unknown>>;

type ProposalPreset = {
  title: string;
  rationale: string;
  prompt: string;
  config: VisualConfig;
};

type AiDirection = {
  title: string;
  rationale: string;
  imagePrompt: string;
  backgroundColor: string;
  accentColor: string;
  fontStyle: "mono" | "modern" | "editorial" | "friendly";
  buttonStyle: "rounded" | "pill" | "square";
  boardTexture: "chalkboard" | "kraft" | "painted";
  buttonVariant: "solid" | "outline" | "soft";
  buttonMotion: "lift" | "pulse" | "none";
  cartButtonLabel: "Ir a pagar" | "Completar pedido" | "Quiero comprar" | "Agregar y pagar";
  contentOrder: Array<"hero" | "products" | "about" | "gallery" | "links">;
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
          "title", "rationale", "imagePrompt", "backgroundColor", "accentColor", "fontStyle", "buttonStyle",
          "boardTexture", "buttonVariant", "buttonMotion", "cartButtonLabel", "contentOrder",
        ],
        properties: {
          title: { type: "string", minLength: 3, maxLength: 48 },
          rationale: { type: "string", minLength: 20, maxLength: 240 },
          imagePrompt: { type: "string", minLength: 30, maxLength: 600 },
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
    const assets = await this.prisma.mediaAsset.findMany({
      where: { merchantId, url: { in: dto.assetUrls }, mimeType: { in: ["image/png", "image/jpeg", "image/webp"] } },
    });
    if (assets.length !== dto.assetUrls.length) {
      throw new BadRequestException("Una o más imágenes no pertenecen a tu cuenta o no tienen un formato compatible");
    }
    await this.prisma.mediaAsset.updateMany({ where: { id: { in: assets.map((asset) => asset.id) }, storeId: null }, data: { storeId } });

    const orderedAssets = dto.assetUrls.map((url) => assets.find((asset) => asset.url === url)!);
    let presets = this.presets(store, dto, orderedAssets);
    let generated: Array<{ url: string; parent: MediaAsset } | null> = presets.map(() => null);
    let provider = "local-curated";

    if (this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")) {
      const aiPresets = await this.generateDirections(store, dto, orderedAssets);
      if (aiPresets) {
        presets = aiPresets;
        provider = `openai:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-luna"}`;
      }
      generated = await Promise.all(presets.map((preset) => this.generateHero(merchantId, storeId, orderedAssets[0], preset.prompt)));
      if (generated.some(Boolean)) {
        const imageModel = this.config.get<string>("app.openAi.imageModel") ?? "gpt-image-2";
        provider = provider.startsWith("openai:") ? `${provider}+${imageModel}` : `openai:${imageModel}`;
      }
    }

    const proposals = await this.prisma.$transaction(
      presets.map((preset, index) => {
        const heroUrl = generated[index]?.url ?? orderedAssets[index % orderedAssets.length].url;
        const proposalConfig = {
          ...preset.config,
          bannerUrl: heroUrl,
          heroSlides: [{ imageUrl: heroUrl }],
          editorialGallery: orderedAssets.slice(0, 6).map((asset) => ({ imageUrl: asset.url })),
        } as Prisma.InputJsonObject;
        return this.prisma.storeVisualProposal.create({
          data: {
            storeId,
            title: preset.title,
            rationale: preset.rationale,
            provider,
            config: proposalConfig,
            sourceAssetUrls: dto.assetUrls,
            generatedUrls: generated[index] ? [generated[index]!.url] : [],
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

  private presets(store: Store, dto: GenerateVisualProposalsDto, assets: MediaAsset[]): ProposalPreset[] {
    const subject = dto.businessCategory?.trim() || "los productos de la marca";
    const preference = dto.personality ? `La personalidad elegida es ${dto.personality}.` : "";
    const imageRule = `Usa la foto como referencia principal de ${subject}. Conserva fielmente el producto, sus colores y materiales. No agregues texto, logotipos, precios ni productos inventados. Crea una composición horizontal para ecommerce con espacio limpio alrededor. ${preference}`;
    const galleryFirst = assets.slice(0, 6).map((asset) => ({ imageUrl: asset.url }));
    return [
      {
        title: "Taller cálido",
        rationale: "Una dirección artesanal y cercana que deja que las fotos originales cuenten la historia.",
        prompt: `${imageRule} Fondo cálido de estudio artesanal, luz natural suave, sombras reales, tonos arena y terracota.`,
        config: { backgroundColor: "#f4ead7", accentColor: "#b4532a", fontStyle: "friendly", buttonStyle: "rounded", boardTexture: "kraft", buttonVariant: "solid", buttonMotion: "lift", cartButtonLabel: "Quiero comprar", contentOrder: ["hero", "products", "gallery", "about", "links"], editorialGallery: galleryFirst },
      },
      {
        title: "Editorial sereno",
        rationale: "Más aire, contraste sobrio y una jerarquía enfocada en producto para una sensación premium.",
        prompt: `${imageRule} Estudio editorial minimalista, fondo marfil, iluminación difusa, sombras muy sutiles, composición premium y sobria.`,
        config: { backgroundColor: "#f7f5f0", accentColor: "#274c43", fontStyle: "editorial", buttonStyle: "square", boardTexture: "painted", buttonVariant: "outline", buttonMotion: "none", cartButtonLabel: "Completar pedido", contentOrder: ["hero", "products", "about", "gallery", "links"], editorialGallery: galleryFirst },
      },
      {
        title: "Mercado vibrante",
        rationale: "Una propuesta más expresiva para captar atención sin esconder ni alterar el producto real.",
        prompt: `${imageRule} Fondo de color intenso pero elegante, iluminación comercial nítida, formas gráficas simples sin texto, energía de mercado contemporáneo.`,
        config: { backgroundColor: "#f6c84f", accentColor: "#c24132", fontStyle: "modern", buttonStyle: "pill", boardTexture: "painted", buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", contentOrder: ["hero", "products", "gallery", "links", "about"], editorialGallery: galleryFirst },
      },
    ];
  }

  private async generateDirections(store: Store, dto: GenerateVisualProposalsDto, assets: MediaAsset[]): Promise<ProposalPreset[] | null> {
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
      if (!usableImages.length) return null;

      const category = dto.businessCategory?.trim() || "productos de la marca";
      const personality = dto.personality?.trim() || "sin una personalidad indicada; infiérela de las fotos";
      const prompt = [
        "Actúa como director de arte de ecommerce. Analiza las fotos reales y devuelve exactamente tres sistemas visuales distintos para una tienda móvil.",
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad: ${personality}.`,
        "Cada dirección debe decidir el sistema completo: paleta, estilo tipográfico, forma/variante/movimiento de botones, textura, CTA y orden de secciones.",
        "Los colores deben dar contraste legible: acento oscuro suficiente sobre el fondo y con texto blanco. Los productos deben aparecer pronto; products debe ocupar la posición 2 o 3.",
        "El imagePrompt debe describir una composición horizontal de ecommerce basada fielmente en el producto fotografiado, sin texto, logos, precios ni productos inventados.",
        "Escribe títulos y razones breves en español. No devuelvas HTML, CSS, claims ni texto fuera del esquema.",
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
        prompt: direction.imagePrompt,
        config: {
          backgroundColor: direction.backgroundColor.toLowerCase(),
          accentColor: direction.accentColor.toLowerCase(),
          fontStyle: direction.fontStyle,
          buttonStyle: direction.buttonStyle,
          boardTexture: direction.boardTexture,
          buttonVariant: direction.buttonVariant,
          buttonMotion: direction.buttonMotion,
          cartButtonLabel: direction.cartButtonLabel,
          contentOrder: direction.contentOrder,
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
    if (!value.every((direction) => direction && typeof direction === "object" && !Array.isArray(direction))) return null;
    const directions = value as Array<Record<string, unknown>>;
    const titles = new Set(directions.map((direction) => direction.title));
    if (titles.size !== 3) return null;
    if (!directions.every((direction) =>
      typeof direction.title === "string" && direction.title.length >= 3 && direction.title.length <= 48
      && typeof direction.rationale === "string" && direction.rationale.length >= 20 && direction.rationale.length <= 240
      && typeof direction.imagePrompt === "string" && direction.imagePrompt.length >= 30 && direction.imagePrompt.length <= 600
      && validColor(direction.backgroundColor) && validColor(direction.accentColor)
      && enumValue(direction.fontStyle, ["mono", "modern", "editorial", "friendly"])
      && enumValue(direction.buttonStyle, ["rounded", "pill", "square"])
      && enumValue(direction.boardTexture, ["chalkboard", "kraft", "painted"])
      && enumValue(direction.buttonVariant, ["solid", "outline", "soft"])
      && enumValue(direction.buttonMotion, ["lift", "pulse", "none"])
      && enumValue(direction.cartButtonLabel, ["Ir a pagar", "Completar pedido", "Quiero comprar", "Agregar y pagar"])
      && validOrder(direction.contentOrder)
    )) return null;
    return directions as AiDirection[];
  }

  private async generateHero(merchantId: string, storeId: string, source: MediaAsset, prompt: string) {
    try {
      const filename = source.url.split("/").pop();
      if (!filename) return null;
      const sourceBytes = await this.uploads.getBuffer(filename);
      if (!sourceBytes) return null;
      const form = new FormData();
      form.append("model", this.config.get<string>("app.openAi.imageModel") ?? "gpt-image-2");
      form.append("prompt", prompt);
      form.append("size", "1536x1024");
      form.append("quality", "low");
      form.append("image", new Blob([sourceBytes], { type: source.mimeType }), filename);
      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      const body = await response.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
      if (!response.ok || !body.data?.[0]?.b64_json) throw new BadGatewayException(body.error?.message || "OpenAI image edit failed");
      const generated = await this.uploads.saveBuffer(Buffer.from(body.data[0].b64_json, "base64"), "image/png");
      await this.prisma.mediaAsset.create({
        data: { merchantId, storeId, url: generated.url, storageKey: generated.filename, mimeType: generated.mimeType, byteSize: generated.byteSize, kind: "AI_DERIVED", parentAssetId: source.id },
      });
      return { url: generated.url, parent: source };
    } catch (error) {
      this.logger.warn(`AI visual generation fell back to the original asset: ${(error as Error).message}`);
      return null;
    }
  }
}
