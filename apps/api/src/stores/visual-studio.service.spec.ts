import { ConfigService } from "@nestjs/config";
import { VisualStudioService } from "./visual-studio.service";

const store = {
  id: "store_1",
  merchantId: "merchant_1",
  slug: "matcho",
  name: "MATCHO",
  tagline: null,
  logoUrl: null,
  bannerUrl: null,
  backgroundColor: "#f8fafc",
  backgroundMode: "solid",
  backgroundGradientStart: "#f8fafc",
  backgroundGradientEnd: "#e0e7ff",
  backgroundGradientAngle: 135,
  backgroundImageUrl: null,
  contactPhone: null,
  contactEmail: null,
  aboutText: null,
  aboutTitle: null,
  aboutSubtitle: null,
  aboutImageUrl: null,
  catalogTitle: null,
  catalogSubtitle: null,
  galleryTitle: null,
  gallerySubtitle: null,
  accentColor: null,
  fontStyle: "mono",
  buttonStyle: "rounded",
  boardTexture: "chalkboard",
  announcement: null,
  announcementMode: "static",
  announcementSpeed: 18,
  promotionEnabled: false,
  promotionImageUrl: null,
  promotionTitle: null,
  promotionBody: null,
  promotionCtaLabel: null,
  promotionCtaUrl: null,
  heroSlides: [],
  contentOrder: ["hero", "products", "about", "gallery", "links"],
  layoutStyle: "cinematic",
  experienceStyle: "coverflow",
  motionDuoEnabled: false,
  motionExperience: "coverflow-carousel",
  editorialGallery: [],
  buttonVariant: "solid",
  buttonMotion: "lift",
  cartButtonLabel: "Ir a pagar",
  checkoutMode: "payment",
  status: "ACTIVE",
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("VisualStudioService", () => {
  function setup(configValues: Record<string, unknown> = {}) {
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue(store), update: jest.fn().mockResolvedValue({ ...store, accentColor: "#b4532a" }) },
      paymentLink: { findMany: jest.fn().mockResolvedValue([{ name: "Matcha ceremonial", description: "Té verde", imageUrls: ["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"], tags: ["matcha"] }]) },
      storeLink: { findMany: jest.fn().mockResolvedValue([{ label: "Instagram", url: "https://instagram.com/matcho" }]) },
      mediaAsset: {
        findMany: jest.fn().mockResolvedValue([
          { id: "asset_1", merchantId: "merchant_1", storeId: null, url: "/v1/uploads/11111111-1111-4111-8111-111111111111.jpg", storageKey: "11111111-1111-4111-8111-111111111111.jpg", mimeType: "image/jpeg", byteSize: 10, kind: "ORIGINAL", parentAssetId: null, createdAt: new Date() },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      storeVisualProposal: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `proposal_${data.title}`, ...data, status: "READY", createdAt: new Date() })),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn(),
      },
      storeVisualVersion: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
    };
    const uploads = { getBuffer: jest.fn(), saveBuffer: jest.fn() };
    const config = { get: jest.fn((key: string) => key === "app.openAi.enabled" ? true : configValues[key] ?? "") } as unknown as ConfigService;
    return { service: new VisualStudioService(prisma as never, uploads as never, config), prisma, uploads };
  }

  it("creates three bounded local proposals while retaining original asset URLs", async () => {
    const { service, prisma } = setup();
    const originalUrl = "/v1/uploads/11111111-1111-4111-8111-111111111111.jpg";
    const result = await service.generate("merchant_1", "store_1", {
      assetUrls: [originalUrl],
      businessCategory: "matcha",
      announcementMarqueeEnabled: false,
      motionExperiences: ["hero-gallery-scroll", "stagger-testimonials"],
    });

    expect(result.mode).toBe("local");
    expect(result.originalsPreserved).toBe(true);
    expect(result.proposals).toHaveLength(3);
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { storeId: "store_1" } }));
    for (const [proposalIndex, call] of prisma.storeVisualProposal.create.mock.calls.entries()) {
      expect(call[0].data.sourceAssetUrls).toEqual([originalUrl]);
      expect(call[0].data.config).not.toHaveProperty("html");
      expect(call[0].data.config).not.toHaveProperty("css");
      expect(call[0].data.config.heroSlides).toEqual([]);
      expect(call[0].data.config.editorialGallery).toEqual([]);
      expect(call[0].data.config.motionDuoEnabled).toBe(true);
      expect(call[0].data.config.motionExperience).toBe("hero-gallery-scroll");
      expect(call[0].data.config.motionExperiences).toEqual(["hero-gallery-scroll", "stagger-testimonials"]);
      expect(call[0].data.config.animations).toHaveLength(2);
      expect(call[0].data.config.animations[0].media[0]).toEqual(expect.objectContaining({ imageUrl: originalUrl }));
      expect(call[0].data.config.contentOrder.indexOf(`animation-ai-${proposalIndex + 1}-1-hero-gallery-scroll`)).toBeLessThan(call[0].data.config.contentOrder.indexOf("hero"));
      expect(call[0].data.config.contentOrder.indexOf(`animation-ai-${proposalIndex + 1}-2-stagger-testimonials`)).toBe(call[0].data.config.contentOrder.indexOf("products") + 1);
      expect(call[0].data.config.contentOrder.some((section: string, sectionIndex: number, order: string[]) => section.startsWith("animation-") && order[sectionIndex + 1]?.startsWith("animation-"))).toBe(false);
      expect(call[0].data.config.announcementMode).toBe("static");
      expect(["#f6c84f", "#7f1d1d"]).not.toContain(call[0].data.config.backgroundColor);
    }
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.layoutStyle)).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.experienceStyle))).toEqual(new Set(["coverflow", "diagonal-marquee", "story-scroller"]));
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => JSON.stringify(call[0].data.config.contentOrder))).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.cartButtonLabel)).size).toBe(3);
  });

  it("keeps every proposal static when the merchant selects no animations", async () => {
    const { service, prisma } = setup();

    await service.generate("merchant_1", "store_1", { businessCategory: "matcha", motionExperiences: [] });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.config.motionDuoEnabled).toBe(false);
      expect(call[0].data.config.motionExperiences).toEqual([]);
      expect(call[0].data.config.animations).toEqual([]);
      expect(call[0].data.config.heroSlides).toEqual([]);
      expect(call[0].data.config.editorialGallery).toEqual([]);
      expect(call[0].data.config.contentOrder.every((section: string) => !section.startsWith("animation-"))).toBe(true);
    }
  });

  it("balances four generated animations on both sides of the product catalog", async () => {
    const { service, prisma } = setup();

    await service.generate("merchant_1", "store_1", {
      motionExperiences: ["story-scroll", "coverflow-carousel", "hero-carousel", "image-stream"],
    });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      const order = call[0].data.config.contentOrder as string[];
      const productsIndex = order.indexOf("products");
      const animationIndexes = order.flatMap((section, index) => section.startsWith("animation-") ? [index] : []);
      expect(animationIndexes.filter((index) => index < productsIndex)).toHaveLength(2);
      expect(animationIndexes.filter((index) => index > productsIndex)).toHaveLength(2);
    }
  });

  it("accepts more than eight photos and allocates different photos to each animation", async () => {
    const { service, prisma } = setup();
    const urls = Array.from({ length: 12 }, (_, index) => `/v1/uploads/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.jpg`);
    prisma.paymentLink.findMany.mockResolvedValue([{ name: "Colección", description: "Doce piezas", imageUrls: urls, tags: [] }]);
    prisma.mediaAsset.findMany.mockResolvedValue(urls.map((url, index) => ({ id: `asset_${index}`, merchantId: "merchant_1", storeId: null, url, storageKey: url.split("/").pop(), mimeType: "image/jpeg", byteSize: 10, kind: "ORIGINAL", parentAssetId: null, createdAt: new Date() })));

    await service.generate("merchant_1", "store_1", {
      motionExperiences: ["hero-gallery-scroll", "stagger-testimonials", "zoom-parallax"],
    });

    const proposal = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    expect(proposal.sourceAssetUrls).toHaveLength(12);
    const mediaSets = proposal.config.animations.map((animation: { media: Array<{ imageUrl: string }> }) => new Set(animation.media.map((media) => media.imageUrl)));
    expect(mediaSets.map((set: Set<string>) => set.size)).toEqual([4, 4, 4]);
    expect(new Set(mediaSets.flatMap((set: Set<string>) => [...set])).size).toBe(12);
  });

  it("keeps WhatsApp conversion and its phone in every generated proposal", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", {
      checkoutMode: "whatsapp",
      whatsappPhone: "+591 71234567",
    });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.config).toEqual(expect.objectContaining({
        checkoutMode: "whatsapp",
        contactPhone: "+591 71234567",
        cartButtonLabel: "Pedir por WhatsApp",
      }));
    }
  });

  it("rejects WhatsApp proposals that would leave checkout without a usable recipient", async () => {
    const { service, prisma } = setup();

    await expect(service.generate("merchant_1", "store_1", {
      checkoutMode: "whatsapp",
      whatsappPhone: "sin número",
    })).rejects.toThrow("Configura un número de WhatsApp válido");

    expect(prisma.paymentLink.findMany).not.toHaveBeenCalled();
    expect(prisma.storeVisualProposal.create).not.toHaveBeenCalled();
  });

  it("preserves an existing WhatsApp conversion when older clients omit the mode", async () => {
    const { service, prisma } = setup();
    prisma.store.findFirst.mockResolvedValue({ ...store, checkoutMode: "whatsapp", contactPhone: "+591 71234567" });

    await service.generate("merchant_1", "store_1", {});

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.config).toEqual(expect.objectContaining({
        checkoutMode: "whatsapp",
        contactPhone: "+591 71234567",
        cartButtonLabel: "Pedir por WhatsApp",
      }));
    }
  });

  it("explains how to continue when the store has no usable imagery", async () => {
    const { service, prisma } = setup();
    prisma.paymentLink.findMany.mockResolvedValue([{ name: "Servicio", description: null, imageUrls: [], tags: [] }]);
    prisma.mediaAsset.findMany.mockResolvedValue([]);

    await expect(service.generate("merchant_1", "store_1", {})).rejects.toThrow(
      "Agrega al menos una foto o video a la tienda o a un producto antes de crear el sitio con IA",
    );
    expect(prisma.storeVisualProposal.create).not.toHaveBeenCalled();
  });

  it("snapshots the current look and ignores proposal fields outside the visual allowlist", async () => {
    const { service, prisma } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue({
      id: "proposal_1",
      storeId: "store_1",
      title: "Taller cálido",
      config: { accentColor: "#b4532a", fontStyle: "friendly", name: "A name the model must not change", html: "<script>bad()</script>" },
    });

    await service.apply("merchant_1", "store_1", "proposal_1");

    expect(prisma.storeVisualVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store_1", source: "proposal:proposal_1" }) }));
    expect(prisma.storeVisualProposal.updateMany).toHaveBeenCalledWith({
      where: { storeId: "store_1", id: { not: "proposal_1" }, status: "APPLIED" },
      data: { status: "READY", appliedAt: null },
    });
    const updateData = prisma.store.update.mock.calls[0][0].data;
    expect(updateData).toEqual({ accentColor: "#b4532a", fontStyle: "friendly" });
    expect(updateData).not.toHaveProperty("name");
    expect(updateData).not.toHaveProperty("html");
  });

  it("uses structured AI directions for the whole appearance while keeping the model inside the visual allowlist", async () => {
    const { service, prisma, uploads } = setup({
      "app.openAi.apiKey": "sk-test",
      "app.openAi.designModel": "gpt-5.6-luna",
      "app.openAi.imageModel": "gpt-image-2",
    });
    uploads.getBuffer.mockResolvedValue(Buffer.from("source-image"));
    const direction = (title: string, overrides: Record<string, unknown> = {}) => ({
      title,
      rationale: "Una dirección completa que organiza el contenido real de la tienda con una jerarquía clara.",
      tagline: "Matcha preparado para tu ritual diario",
      aboutText: "Texto borrador para contar la historia real de MATCHO; el comercio debe revisarlo antes de publicar.",
      aboutTitle: "Conoce MATCHO",
      aboutSubtitle: "La intención que guía cada elección de la marca.",
      catalogTitle: "La tienda",
      catalogSubtitle: "Explora la selección actual de MATCHO.",
      galleryTitle: "La marca en imágenes",
      gallerySubtitle: "Una mirada más cercana al universo de MATCHO.",
      backgroundColor: "#edf3f8",
      accentColor: "#274c43",
      fontStyle: "editorial",
      buttonStyle: "square",
      buttonVariant: "outline",
      buttonMotion: "none",
      cartButtonLabel: "Completar pedido",
      contentOrder: ["hero", "about", "products", "gallery", "motion", "links"],
      layoutStyle: "cinematic",
      experienceStyle: "coverflow",
      announcement: "MATCHO • Explora la selección actual",
      announcementMode: "marquee",
      announcementSpeed: 18,
      announcementSize: "medium",
      announcementColor: "#274c43",
      promotionEnabled: false,
      promotionTitle: "",
      promotionBody: "",
      promotionCtaLabel: "",
      heroSlides: Array.from({ length: 4 }, (_, index) => ({ assetIndex: 0, title: index ? `Descubre MATCHO ${index}` : "Tu ritual empieza aquí", body: "Explora el catálogo actual de MATCHO.", ctaLabel: "Ver productos" })),
      editorialGallery: [{ assetIndex: 0, title: "Matcha ceremonial", caption: "Una mirada cercana", body: "Una imagen que presenta el producto con contexto y acompaña la historia visual de la marca.", boxColor: "#f4ead7" }],
      ...overrides,
    });
    const directions = [
      direction("Bosque editorial"),
      direction("Taller natural", { backgroundColor: "#b91c1c", accentColor: "#7a351f", buttonStyle: "rounded", buttonVariant: "solid", buttonMotion: "lift", cartButtonLabel: "Quiero comprar", layoutStyle: "editorial", experienceStyle: "story-scroller", contentOrder: ["motion", "about", "hero", "products", "links", "gallery"] }),
      direction("Mercado gráfico", { backgroundColor: "#f6c84f", accentColor: "#7f1d1d", buttonStyle: "pill", buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", layoutStyle: "catalog-first", experienceStyle: "diagonal-marquee", contentOrder: ["products", "hero", "motion", "about", "links", "gallery"] }),
    ];
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ directions }) }] }] }) });

    try {
      const result = await service.generate("merchant_1", "store_1", { assetUrls: ["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"], businessCategory: "matcha", fontStyle: "friendly", announcementMarqueeEnabled: false, motionExperience: "story-scroll" });
      expect(result.mode).toBe("ai");
      expect(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.title)).toEqual(directions.map((direction) => direction.title));
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config).toEqual(expect.objectContaining({
        tagline: "Matcha preparado para tu ritual diario",
        announcementMode: "static",
        backgroundColor: "#edf3f8",
        accentColor: "#274c43",
        fontStyle: "friendly",
        buttonStyle: "square",
        boardTexture: "painted",
        buttonVariant: "outline",
        buttonMotion: "none",
        cartButtonLabel: "Completar pedido",
        contentOrder: ["animation-ai-1-1-story-scroll", "hero", "about", "products", "gallery", "links"],
        layoutStyle: "cinematic",
        experienceStyle: "coverflow",
        motionDuoEnabled: true,
        motionExperience: "story-scroll",
        animations: expect.arrayContaining([expect.objectContaining({ id: "ai-1-1-story-scroll", name: "Story Scroll", type: "story-scroll" })]),
        heroSlides: [],
        editorialGallery: [],
      }));
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config).not.toHaveProperty("html");
      expect(prisma.storeVisualProposal.create.mock.calls[1][0].data.config.backgroundColor).toBe("#e8f2ef");
      expect(prisma.storeVisualProposal.create.mock.calls[2][0].data.config.backgroundColor).toBe("#eeebf5");
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.provider).toBe("openai:gpt-5.6-luna");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
