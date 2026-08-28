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
  fontStyle: "modern",
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
      paymentLink: { findMany: jest.fn().mockResolvedValue([{ id: "product_matcha", name: "Matcha ceremonial", description: "Té verde", imageUrls: ["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"], tags: ["matcha"] }]) },
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

  it("creates three bounded, complete site documents while retaining original asset URLs", async () => {
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
    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.sourceAssetUrls).toEqual([originalUrl]);
      expect(call[0].data.config).not.toHaveProperty("html");
      expect(call[0].data.config).not.toHaveProperty("css");
      expect(call[0].data.config.motionDuoEnabled).toBe(false);
      expect(call[0].data.config.motionExperiences).toEqual([]);
      expect(call[0].data.config.animations).toEqual([]);
      expect(call[0].data.config.contactFormEnabled).toBe(true);
      expect(call[0].data.config.announcementMode).toBe("static");
      const document = call[0].data.config.siteDocument;
      expect(document.version).toBe(1);
      expect(document.sections.filter((section: { kind: string }) => section.kind === "hero")).toHaveLength(1);
      expect(document.sections.filter((section: { kind: string }) => section.kind === "catalog")).toHaveLength(1);
      expect(document.sections.filter((section: { kind: string }) => section.kind === "contact")).toHaveLength(1);
      expect(document.sections.flatMap((section: { mediaUrls: string[] }) => section.mediaUrls)).toContain(originalUrl);
      expect(document.navigation.sticky).toBe(false);
      expect(document.sections.find((section: { kind: string }) => section.kind === "hero")).toEqual(expect.objectContaining({ align: "left" }));
      expect(document.sections.find((section: { kind: string; layout: string }) => section.kind === "hero")?.layout).not.toBe("centered");
      expect(document.sections.slice(0, 3).map((section: { kind: string }) => section.kind)).toEqual(["hero", "story", "catalog"]);
      expect(document.sections[0].motion).toBe("none");
      expect(document.sections[1]).toEqual(expect.objectContaining({ layout: "stacked", width: "full", motion: "story-scroll" }));
      expect(document.experience.placement).toBe("after-catalog");
      expect(["layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"]).toContain(document.experience.type);
      expect(document.experience.mediaUrls).toEqual([]);
      expect(["hero-gallery-scroll", "image-stream"]).not.toContain(document.experience.type);
      expect(Object.values(document.theme)).not.toContain("#000000");
    }
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => JSON.stringify(call[0].data.config.siteDocument.sections.map((section: { kind: string; layout: string }) => [section.kind, section.layout])))).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.cartButtonLabel)).size).toBe(3);
  });

  it("uses the authored site motion system without reviving legacy animations", async () => {
    const { service, prisma } = setup();

    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.config.motionDuoEnabled).toBe(false);
      expect(call[0].data.config.motionExperiences).toEqual([]);
      expect(call[0].data.config.animations).toEqual([]);
      const motions = call[0].data.config.siteDocument.sections.map((section: { motion: string }) => section.motion);
      expect(motions).not.toContain("marquee");
      expect(motions.some((motion: string) => motion !== "none")).toBe(true);
      expect(motions.filter((motion: string) => motion !== "none").length).toBeLessThanOrEqual(4);
    }
  });

  it("preserves merchant-authored animation sections when generating a new AI site", async () => {
    const { service, prisma } = setup();
    const slidingWindow = {
      id: "brand-window",
      name: "Ventana de colección",
      type: "scroll-expansion",
      title: "La colección se abre",
      subtitle: "Una transición con las fotos reales de la tienda.",
      media: [
        { imageUrl: "/v1/uploads/11111111-1111-4111-8111-111111111111.jpg", title: "Primera escena" },
        { imageUrl: "/v1/uploads/22222222-2222-4222-8222-222222222222.jpg", title: "Segunda escena" },
      ],
    };
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      motionDuoEnabled: true,
      motionExperience: "scroll-expansion",
      motionExperiences: ["scroll-expansion"],
      animations: [slidingWindow],
    });

    await service.generate("merchant_1", "store_1", { businessCategory: "moda" });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.config.motionDuoEnabled).toBe(true);
      expect(call[0].data.config.motionExperience).toBe("scroll-expansion");
      expect(call[0].data.config.motionExperiences).toEqual(["scroll-expansion"]);
      expect(call[0].data.config.animations).toEqual([slidingWindow]);
    }
  });

  it("keeps the Bikano-inspired opening narrative ahead of the stable store", async () => {
    const { service, prisma } = setup();

    await service.generate("merchant_1", "store_1", {
      motionExperiences: ["story-scroll", "coverflow-carousel", "hero-carousel", "image-stream"],
    });

    const orders = prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.map((section: { kind: string }) => section.kind));
    orders.forEach((order) => {
      expect(order.slice(0, 3)).toEqual(["hero", "story", "catalog"]);
      expect(order.indexOf("contact")).toBeGreaterThan(order.indexOf("catalog"));
    });
  });

  it("accepts a large photo library without dumping it into the generated page", async () => {
    const { service, prisma } = setup();
    const urls = Array.from({ length: 12 }, (_, index) => `/v1/uploads/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.jpg`);
    prisma.paymentLink.findMany.mockResolvedValue([{ name: "Colección", description: "Doce piezas", imageUrls: urls, tags: [] }]);
    prisma.mediaAsset.findMany.mockResolvedValue(urls.map((url, index) => ({ id: `asset_${index}`, merchantId: "merchant_1", storeId: null, url, storageKey: url.split("/").pop(), mimeType: "image/jpeg", byteSize: 10, kind: "ORIGINAL", parentAssetId: null, createdAt: new Date() })));

    await service.generate("merchant_1", "store_1", {
      motionExperiences: ["hero-gallery-scroll", "stagger-testimonials", "frame-sequence"],
    });

    const proposal = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    expect(proposal.sourceAssetUrls).toHaveLength(12);
    const used = new Set(proposal.config.siteDocument.sections.flatMap((section: { mediaUrls: string[] }) => section.mediaUrls));
    expect(used.size).toBeGreaterThanOrEqual(3);
    expect(proposal.config.siteDocument.sections.every((section: { mediaUrls: string[] }) => section.mediaUrls.length <= 4)).toBe(true);
    expect(proposal.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "hero").mediaUrls).toHaveLength(3);
    expect(proposal.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "story").mediaUrls).toHaveLength(3);
    expect([...used].every((url) => urls.includes(url as string))).toBe(true);
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
      "app.openAi.designModel": "gpt-5.6-sol",
      "app.openAi.imageModel": "gpt-image-2",
    });
    uploads.getBuffer.mockResolvedValue(Buffer.from("source-image"));
    const direction = (title: string, variant: number) => ({
      title,
      rationale: "Una dirección completa que organiza el contenido real de la tienda con una jerarquía clara.",
      siteDocument: {
        version: 1,
        direction: title,
        theme: {
          pageBackground: ["#edf3f8", "#f2eee7", "#e8f2ef"][variant], textColor: "#171717", accentColor: "#274c43", secondaryColor: "#c9a86a",
          surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4", headingFont: variant === 0 ? "editorial" : variant === 1 ? "humanist" : "geometric",
          bodyFont: "grotesk", radius: variant * 8, shadow: variant === 1 ? "soft" : "none", productLayout: variant === 0 ? "editorial" : variant === 1 ? "gallery" : "showcase",
        },
        navigation: { layout: variant === 0 ? "centered" : variant === 1 ? "brand-left" : "split", sticky: false, transparent: variant === 0 },
        sections: [
          { id: "opening", kind: "hero", layout: variant === 0 ? "full-bleed" : variant === 1 ? "split" : "offset", width: variant === 0 ? "full" : "wide", align: "left", motion: "none", title: "Matcha preparado para tu ritual diario", body: "Un recorrido propio para explorar MATCHO.", ctaLabel: "Ver productos", backgroundColor: ["#edf3f8", "#f2eee7", "#e8f2ef"][variant], textColor: "#171717", mediaIndices: [0], items: [] },
          { id: "shop", kind: "catalog", layout: variant === 0 ? "offset" : "grid", width: "wide", align: "left", motion: "none", title: "La tienda", body: "Explora la selección actual de MATCHO.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaIndices: [], items: [] },
          { id: "story", kind: "story", layout: variant === 2 ? "rail" : "split", width: "wide", align: variant === 2 ? "right" : "left", motion: "none", title: "Conoce MATCHO", body: "Texto borrador para contar la historia real de MATCHO; el comercio debe revisarlo antes de publicar.", ctaLabel: "", backgroundColor: "#edf3f8", textColor: "#171717", mediaIndices: [0], items: [] },
          { id: "information", kind: "contact", layout: "split", width: "wide", align: "left", motion: "none", title: "¿Tienes una pregunta?", body: "Escríbele al equipo de MATCHO.", ctaLabel: "Enviar pregunta", backgroundColor: "#ffffff", textColor: "#171717", mediaIndices: [], items: [] },
        ],
      },
    });
    const directions = [
      direction("Bosque editorial", 0),
      direction("Taller natural", 1),
      direction("Mercado gráfico", 2),
    ];
    const analysis = {
      brandEssence: "Una marca de matcha contemporánea que convierte el ritual diario en una elección clara y visual.",
      audienceScene: "Personas que descubren la colección desde el teléfono y quieren reconocer rápido cada producto antes de comprar.",
      logoStrategy: "Usar la marca únicamente en navegación, con aire suficiente y sin convertirla en textura ni fotografía.",
      colorStrategy: "Derivar una familia verde fría del producto y sostenerla con superficies neutras de contraste alto.",
      typographyStrategy: "Combinar una voz de titulares editorial con texto funcional de lectura rápida para compra y formularios.",
      compositionStrategy: "Abrir con el producto principal, alternar una historia de detalle con un catálogo amplio y cerrar con contacto integrado.",
      motionStrategy: "Usar un reveal para jerarquía y una expansión de imagen para conectar la historia con el catálogo.",
      assetRoles: [{ assetIndex: 0, role: "product", productIndex: 0, reasoning: "Es la fotografía declarada del producto Matcha ceremonial." }],
      merchandisingPlan: [{ productIndex: 0, role: "lead", placement: "Portada y primer grupo del catálogo", imageAssetIndices: [0] }],
      sectionPlan: [
        { kind: "hero", purpose: "Presentar el producto principal y la acción de compra.", backgroundRole: "Fondo de marca principal" },
        { kind: "story", purpose: "Dar contexto visual sin inventar información comercial.", backgroundRole: "Superficie secundaria" },
        { kind: "catalog", purpose: "Permitir comparar y comprar los productos reales.", backgroundRole: "Superficie de máxima legibilidad" },
        { kind: "contact", purpose: "Resolver preguntas con un formulario integrado.", backgroundRole: "Cierre en la misma familia cromática" },
      ],
      riskChecks: ["No usar el logo como fondo", "No separar fotos de sus productos", "No inventar beneficios"],
    };
    const originalFetch = global.fetch;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ analysis }) }] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ directions }) }] }] }) });

    try {
      const result = await service.generate("merchant_1", "store_1", { assetUrls: ["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"], businessCategory: "matcha", creativeBrief: "Que parezca una publicación cultural con fotos grandes y ritmo pausado." });
      expect(result.mode).toBe("ai");
      expect(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.title)).toEqual(directions.map((direction) => direction.title));
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config).toEqual(expect.objectContaining({
        tagline: "Matcha preparado para tu ritual diario",
        backgroundColor: "#edf3f8",
        accentColor: "#274c43",
        fontStyle: "editorial",
        contactFormEnabled: true,
        contactTitle: "¿Tienes una pregunta?",
        motionDuoEnabled: false,
        motionExperiences: [],
        animations: [],
        heroSlides: [],
        editorialGallery: [],
        siteDocument: expect.objectContaining({ version: 1, direction: "Bosque editorial" }),
      }));
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config).not.toHaveProperty("html");
      expect(prisma.storeVisualProposal.create.mock.calls.flatMap((call) => call[0].data.config.siteDocument.sections).some((section: { kind: string }) => section.kind === "benefits")).toBe(false);
      expect(prisma.storeVisualProposal.create.mock.calls[2][0].data.config.siteDocument.theme.productLayout).toBe("showcase");
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.provider).toBe("openai:gpt-5.6-sol");
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const analysisRequest = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      const designRequest = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body as string);
      expect(analysisRequest.model).toBe("gpt-5.6-sol");
      expect(analysisRequest.reasoning).toEqual({ effort: "high" });
      expect(analysisRequest.max_output_tokens).toBe(5_000);
      expect(analysisRequest.input[0].content[1].detail).toBe("high");
      expect(designRequest.max_output_tokens).toBe(14_000);
      expect(designRequest.input[0].content[0].text).toContain("Análisis de marca obligatorio");
      expect(designRequest.input[0].content[0].text).toContain("No existe benefits");
      expect(designRequest.input[0].content[0].text).toContain("hero, story y catalog, en ese orden");
      expect(designRequest.input[0].content[0].text).toContain("No apiles muchas fotografías");
      expect(designRequest.input[0].content[0].text).toContain("placement siempre es after-catalog");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
