import { ConfigService } from "@nestjs/config";
import { VisualStudioService } from "./visual-studio.service";
import { storefrontCreativeRecipe } from "./storefront-engine";

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
  experienceStyle: "editorial-grid",
  motionDuoEnabled: false,
  motionExperience: "hero-carousel",
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
      storeVisualTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "template_1", ...data, createdAt: new Date(), updatedAt: new Date() })),
      },
      storeVisualSignature: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "signature_1", ...data, createdAt: new Date() })),
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((input) => (
      typeof input === "function" ? input(prisma) : Promise.all(input)
    ));
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
    expect(result.engine.diversity).toEqual(expect.objectContaining({ accepted: true, uniqueOrders: 3, uniqueGrammars: 3 }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { storeId: "store_1" } }));
    expect(prisma.storeVisualSignature.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ storeId: "store_1", sourceType: "PROPOSAL", fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/) }),
    ]) });
    expect(JSON.stringify(prisma.storeVisualSignature.createMany.mock.calls[0][0].data)).not.toContain(originalUrl);
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
      expect(typeof document.navigation.sticky).toBe("boolean");
      expect(document.sections.find((section: { kind: string }) => section.kind === "story")).toEqual(expect.objectContaining({ motion: "story-scroll" }));
      expect(["hero", "story", "gallery"]).toContain(document.sections[0].kind);
      expect(document.sections[0].motion).not.toBe("none");
      expect(document.sections[1].kind).toBe("catalog");
      expect(document.sections.find((section: { kind: string }) => section.kind === "gallery")?.layout).not.toBe("rail");
      expect(document.pages).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "contact-page", label: "Contacto", slug: "contacto" }),
      ]));
      expect(document.sections.find((section: { kind: string }) => section.kind === "contact")?.pageId).toBe("contact-page");
      expect(document.navigation.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ target: "page", pageId: "contact-page", label: "Contacto" }),
      ]));
      expect(document.sections.find((section: { kind: string }) => section.kind === "hero")?.pageId).toBeUndefined();
      expect(document.sections.find((section: { kind: string }) => section.kind === "catalog")?.pageId).toBeUndefined();
      expect(new Set(document.sections.map((section: { family: string }) => section.family)).size).toBeGreaterThanOrEqual(2);
      expect(document.sections.every((section: { family: string }) => ["editorial", "cinematic", "product-led", "minimal"].includes(section.family))).toBe(true);
      expect(document.experience.placement).toBe("after-catalog");
      expect(["layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"]).toContain(document.experience.type);
      expect(document.experience.mediaUrls).toEqual([]);
      expect(["hero-gallery-scroll", "image-stream"]).not.toContain(document.experience.type);
      expect(Object.values(document.theme)).not.toContain("#000000");
    }
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => JSON.stringify(call[0].data.config.siteDocument.sections.map((section: { kind: string; layout: string }) => [section.kind, section.layout])))).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections[0].kind)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.artDirection)).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "hero").layout)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "hero").family)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.navigation.layout)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.theme.productLayout)).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.experience.type)).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "gallery").motion)).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.cartButtonLabel)).size).toBe(3);
  });

  it("creates one targeted private revision while preserving catalog and commerce fields", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    const sourceDocument = structuredClone(sourceData.config.siteDocument);
    const sourceProposal = {
      id: "proposal_source",
      storeId: "store_1",
      title: "Dirección inicial",
      config: { ...sourceData.config, checkoutMode: "payment", siteDocument: sourceDocument },
      sourceAssetUrls: sourceData.sourceAssetUrls,
      generatedUrls: [],
    };
    prisma.storeVisualProposal.findFirst.mockResolvedValue(sourceProposal);
    prisma.storeVisualProposal.create.mockClear();
    prisma.storeVisualSignature.create.mockClear();

    const result = await service.revise(
      "merchant_1",
      "store_1",
      "proposal_source",
      "Mantén el catálogo, pero haz la apertura más cálida.",
    );

    expect(result.plan).toEqual(expect.objectContaining({ target: "opening", tone: "warmer", preserveCatalog: true }));
    expect(result.preservedAreas).toEqual(expect.arrayContaining(["catálogo", "productos", "precios", "inventario", "checkout", "estado público"]));
    expect(prisma.storeVisualProposal.create).toHaveBeenCalledTimes(1);
    const revision = prisma.storeVisualProposal.create.mock.calls[0][0].data.config;
    const sourceOpening = sourceDocument.sections.find((section: { pageId?: string }) => !section.pageId);
    const nextOpening = revision.siteDocument.sections.find((section: { pageId?: string }) => !section.pageId);
    const sourceCatalog = sourceDocument.sections.find((section: { kind: string }) => section.kind === "catalog");
    const nextCatalog = revision.siteDocument.sections.find((section: { kind: string }) => section.kind === "catalog");
    expect(nextOpening.backgroundColor).not.toBe(sourceOpening.backgroundColor);
    expect(nextCatalog).toEqual(sourceCatalog);
    expect(revision.checkoutMode).toBe("payment");
    expect(prisma.storeVisualSignature.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      storeId: "store_1",
      sourceType: "PROPOSAL",
      fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
    }) });
  });

  it("adds an unambiguous social handle to the footer without changing the menu or site", async () => {
    const { service, prisma } = setup();
    const sourceDocument = {
      version: 1,
      direction: "Editorial",
      designGenome: { composition: "editorial-split", rhythm: "editorial", geometry: "framed", colorStrategy: "accent-led", mediaStrategy: "framed", typeScale: "editorial", motionLanguage: "reveal" },
      theme: { pageBackground: "#ffffff", textColor: "#111111", accentColor: "#bb5500", secondaryColor: "#225566", surfaceColor: "#f5f5f5", mutedColor: "#666666", borderColor: "#dddddd", headingFont: "editorial", bodyFont: "grotesk", radius: 0, shadow: "none", productLayout: "editorial", displayScale: "dramatic", density: "airy", imageTreatment: "editorial" },
      navigation: { layout: "split", sticky: false, transparent: false, logoTreatment: "wordmark", items: [{ id: "home", label: "Inicio", target: "home" }] },
      motion: { intensity: "restrained" },
      merchandising: { featuredProductIds: ["product_matcha"], productOrderIds: ["product_matcha"], spotlightLayout: "feature-first", showDescriptions: true },
      experience: { type: "text-reveal-block", placement: "after-catalog", title: "Ritual", body: "Matcha", mediaUrls: [] },
      sections: [{ id: "opening", kind: "hero", family: "editorial", layout: "split", width: "wide", align: "left", motion: "reveal", title: "MATCHO", body: "Matcha", ctaLabel: "Comprar", backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: [], items: [] }],
      footer: {
        enabled: true,
        brandDescription: "Matcha preparado con calma.",
        columns: [{ id: "brand", title: "Sigue la marca", items: [] }],
        copyright: "MATCHO",
        badge: "Hecho en Bolivia",
      },
    };
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument: sourceDocument });
    prisma.storeVisualProposal.create.mockClear();

    const result = await service.revise(
      "merchant_1",
      "store_1",
      null,
      "incluye mis redes en el footer @joaoreis",
    );

    expect(result.plan).toEqual(expect.objectContaining({
      target: "footer",
      tone: "unchanged",
      socialHandle: "@joaoreis",
      socialPlatform: "unknown",
    }));
    expect(result.changedAreas).toEqual(["pie de página"]);
    expect(result.preservedAreas).toEqual(expect.arrayContaining(["menú", "secciones", "colores y tipografía", "catálogo", "checkout"]));
    const nextDocument = prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument;
    const { direction: _sourceDirection, footer: _sourceFooter, ...sourceSite } = sourceDocument;
    const { direction: _nextDirection, footer: nextFooter, ...nextSite } = nextDocument;
    expect(nextSite).toEqual(sourceSite);
    expect(nextFooter.enabled).toBe(true);
    expect(nextFooter.columns.flatMap((column: { items: Array<{ label: string; href: string }> }) => column.items)).toContainEqual({
      id: "social-joaoreis",
      label: "@joaoreis",
      href: "",
    });
  });

  it("stores a proposal as a content-free creative recipe", async () => {
    const { service, prisma } = setup();
    const document = {
      version: 1,
      direction: "Editorial",
      designGenome: { composition: "editorial-split", rhythm: "editorial", geometry: "framed", colorStrategy: "accent-led", mediaStrategy: "framed", typeScale: "editorial", motionLanguage: "reveal" },
      theme: { pageBackground: "#ffffff", textColor: "#111111", accentColor: "#bb5500", secondaryColor: "#225566", surfaceColor: "#f5f5f5", mutedColor: "#666666", borderColor: "#dddddd", headingFont: "editorial", bodyFont: "grotesk", radius: 0, shadow: "none", productLayout: "editorial", displayScale: "dramatic", density: "airy", imageTreatment: "editorial" },
      navigation: { layout: "split", sticky: false, transparent: false, logoTreatment: "wordmark" },
      motion: { intensity: "restrained" },
      merchandising: { featuredProductIds: ["private-product"], productOrderIds: ["private-product"], spotlightLayout: "feature-first", showDescriptions: true },
      experience: { type: "text-reveal-block", placement: "after-catalog", title: "Texto privado", body: "Texto privado", mediaUrls: ["/v1/uploads/private.webp"] },
      sections: [{ id: "opening", kind: "hero", family: "editorial", layout: "split", width: "wide", align: "left", motion: "none", title: "Texto privado", body: "Texto privado", ctaLabel: "Comprar", backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: ["/v1/uploads/private.webp"], items: [] }],
    };
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ id: "proposal_1", storeId: "store_1", config: { siteDocument: document } });

    await service.saveTemplate("merchant_1", "store_1", "proposal_1", "Mi receta");

    const recipe = prisma.storeVisualTemplate.create.mock.calls[0][0].data.recipe;
    expect(recipe.name).toBe("Mi receta");
    expect(recipe.sections[0].mediaBindings).toEqual([{ slot: "primary-media", role: "featured-product", cardinality: 1 }]);
    expect(JSON.stringify(recipe)).not.toContain("Texto privado");
    expect(JSON.stringify(recipe)).not.toContain("private-product");
    expect(JSON.stringify(recipe)).not.toContain("private.webp");
    expect(recipe.sectionOrders).toEqual(expect.arrayContaining([expect.objectContaining({ value: ["hero"] })]));
    expect(recipe.theme).toEqual(expect.objectContaining({ headingFont: expect.any(Array), density: expect.any(Array) }));
    expect(prisma.storeVisualSignature.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      storeId: "store_1",
      sourceType: "TEMPLATE",
      sourceId: "template_1",
      fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
    }) });
  });

  it("reuses a selected recipe without treating its own source proposal as an originality violation", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceDocument = prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument;
    const recipe = storefrontCreativeRecipe(sourceDocument, "Reusable source");
    prisma.storeVisualTemplate.findFirst.mockResolvedValue({
      id: "template_source",
      merchantId: "merchant_1",
      sourceProposalId: "proposal_source",
      recipe,
    });
    prisma.storeVisualTemplate.findMany.mockResolvedValue([{ id: "template_source", recipe }]);
    prisma.storeVisualProposal.findMany.mockResolvedValue([{ id: "proposal_source", config: { siteDocument: sourceDocument } }]);
    prisma.storeVisualVersion.findMany.mockResolvedValue([{ source: "proposal:proposal_source", snapshot: { siteDocument: sourceDocument } }]);
    prisma.storeVisualProposal.create.mockClear();

    const result = await service.generate("merchant_1", "store_1", {
      businessCategory: "matcha",
      templateId: "template_source",
    });

    expect(result.proposals).toHaveLength(3);
    expect(result.engine.templateId).toBe("template_source");
    expect(prisma.storeVisualSignature.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        NOT: [
          { sourceType: "TEMPLATE", sourceId: "template_source" },
          { sourceType: "PROPOSAL", sourceId: "proposal_source" },
        ],
      },
    }));
  });

  it("puts a merchant-selected art direction first and keeps the alternatives distinct", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", {
      assetUrls: ["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"],
      businessCategory: "cerámica",
      artDirection: "quiet-gallery",
    });

    const documents = prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument);
    expect(documents[0].artDirection).toBe("quiet-gallery");
    expect(new Set(documents.map((document) => document.designGenome.composition)).size).toBe(3);
    expect(new Set(documents.map((document) => document.sections.map((section: { kind: string }) => section.kind).join("/"))).size).toBe(3);
    expect(new Set(documents.map((document) => document.artDirection)).size).toBe(3);
  });

  it("keeps merchant-locked sections exact while regenerating the rest", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const currentDocument = structuredClone(prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument);
    const lockedStory = currentDocument.sections.find((section: { kind: string }) => section.kind === "story");
    lockedStory.title = "Relato aprobado por el comercio";
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument: currentDocument });
    prisma.storeVisualProposal.create.mockClear();

    const result = await service.generate("merchant_1", "store_1", {
      businessCategory: "matcha",
      lockedSectionIds: [lockedStory.id],
    });

    expect(result.engine.lockedSectionIds).toEqual([lockedStory.id]);
    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.config.siteDocument.sections.find((section: { id: string }) => section.id === lockedStory.id))
        .toEqual(lockedStory);
    }
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
      const activeMotions = motions.filter((motion: string) => motion !== "none");
      expect(new Set(activeMotions).size).toBe(activeMotions.length);
    }
  });

  it("shows older saved proposals with duplicate animation types already repaired", async () => {
    const { service, prisma } = setup();
    prisma.storeVisualProposal.findMany.mockResolvedValue([{
      id: "proposal_old",
      config: {
        motionDuoEnabled: true,
        motionExperiences: ["circle-reveal", "circle-reveal"],
        animations: [
          { id: "circle-one", type: "circle-reveal", media: [] },
          { id: "circle-two", type: "circle-reveal", media: [] },
        ],
        contentOrder: ["hero", "animation-circle-one", "products", "animation-circle-two", "links"],
        siteDocument: {
          experience: { type: "story-scroll", mediaUrls: [] },
          sections: [
            { id: "opening", kind: "hero", motion: "none", mediaUrls: ["/one.webp", "/two.webp"] },
            { id: "story", kind: "story", motion: "story-scroll", mediaUrls: ["/one.webp", "/two.webp"] },
            { id: "gallery", kind: "gallery", layout: "rail", motion: "clip", mediaUrls: ["/one.webp", "/two.webp"] },
            { id: "contact", kind: "contact", motion: "reveal", mediaUrls: [] },
            { id: "links", kind: "links", motion: "reveal", mediaUrls: [] },
          ],
        },
      },
    }]);
    prisma.storeVisualVersion.findMany.mockResolvedValue([]);

    const result = await service.list("merchant_1", "store_1");

    const config = result.proposals[0].config as any;
    expect(config.animations).toEqual([]);
    expect(config.motionExperiences).toEqual([]);
    expect(config.motionDuoEnabled).toBe(false);
    expect(config.contentOrder).toEqual(["hero", "products", "links", "about", "gallery"]);
    expect(JSON.stringify(config.contentOrder)).not.toContain("animation-circle");
    expect(config.siteDocument.experience.type).toBe("none");
    expect(config.siteDocument.sections.find((section: { kind: string }) => section.kind === "gallery").layout).toBe("grid");
    expect(config.siteDocument.sections.map((section: { motion: string }) => section.motion)).toEqual(["none", "story-scroll", "clip", "reveal", "none"]);
  });

  it("starts a new AI site without carrying merchant-authored animation sections into it", async () => {
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
      expect(call[0].data.config.motionDuoEnabled).toBe(false);
      expect(call[0].data.config.motionExperience).toBe("hero-carousel");
      expect(call[0].data.config.motionExperiences).toEqual([]);
      expect(call[0].data.config.animations).toEqual([]);
      expect(JSON.stringify(call[0].data.config)).not.toContain(slidingWindow.id);
    }
  });

  it("treats a generated store as a fresh visual canvas instead of merging the live design", async () => {
    const { service, prisma } = setup();
    const oldBanner = "/v1/uploads/22222222-2222-4222-8222-222222222222.jpg";
    const oldAbout = "/v1/uploads/33333333-3333-4333-8333-333333333333.jpg";
    const oldPromotion = "/v1/uploads/44444444-4444-4444-8444-444444444444.jpg";
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      bannerUrl: oldBanner,
      backgroundMode: "image",
      backgroundImageUrl: oldBanner,
      aboutImageUrl: oldAbout,
      sectionBackgrounds: { about: oldAbout },
      announcement: "Este anuncio pertenece al diseño anterior",
      announcementMode: "marquee",
      promotionEnabled: true,
      promotionImageUrl: oldPromotion,
      promotionTitle: "Promoción anterior",
      heroSlides: [{ imageUrl: oldBanner, title: "Portada anterior" }],
      editorialGallery: [{ imageUrl: oldAbout, title: "Galería anterior" }],
      motionDuoEnabled: true,
      motionExperiences: ["scroll-expansion"],
      animations: [{ id: "old-animation", type: "scroll-expansion", media: [] }],
    });

    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      const proposal = call[0].data;
      expect(proposal.sourceAssetUrls).toEqual(["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"]);
      expect(proposal.config).toEqual(expect.objectContaining({
        bannerUrl: null,
        backgroundMode: "solid",
        backgroundImageUrl: null,
        aboutImageUrl: null,
        sectionBackgrounds: {},
        promotionEnabled: false,
        promotionImageUrl: null,
        motionDuoEnabled: false,
        motionExperiences: [],
        animations: [],
      }));
      expect(proposal.config.announcement).not.toBe("Este anuncio pertenece al diseño anterior");
      expect(proposal.config.promotionTitle).not.toBe("Promoción anterior");
      expect(JSON.stringify(proposal.config)).not.toContain("old-animation");
      expect(JSON.stringify(proposal.config)).not.toContain(oldBanner);
      expect(JSON.stringify(proposal.config)).not.toContain(oldAbout);
      expect(JSON.stringify(proposal.config)).not.toContain(oldPromotion);
    }
  });

  it("uses every visible animation type at most once across the complete generated page", async () => {
    const { service, prisma } = setup();
    const asset = (index: number) => ({
      id: `asset_${index}`,
      merchantId: "merchant_1",
      storeId: null,
      url: `/v1/uploads/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.jpg`,
      storageKey: `asset-${index}.jpg`,
      mimeType: "image/jpeg",
      byteSize: 10,
      kind: "ORIGINAL",
      parentAssetId: null,
      createdAt: new Date(),
    });
    const assets = [asset(1), asset(2), asset(3)];
    prisma.mediaAsset.findMany.mockResolvedValue(assets);
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "product_matcha", name: "Matcha ceremonial", description: "Té verde", imageUrls: assets.map((entry) => entry.url), tags: ["matcha"] }]);
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      motionDuoEnabled: true,
      motionExperience: "story-scroll",
      motionExperiences: ["story-scroll", "hero-carousel", "frame-sequence", "frame-sequence"],
      animations: [
        { id: "story-again", name: "Historia repetida", type: "story-scroll", media: [] },
        { id: "hero-again", name: "Portada repetida", type: "hero-carousel", media: [] },
        { id: "frames-one", name: "Cuadros uno", type: "frame-sequence", media: [] },
        { id: "frames-two", name: "Cuadros dos", type: "frame-sequence", media: [] },
        { id: "text-block", name: "Bloques", type: "text-reveal-block", media: [] },
        { id: "text-rotate", name: "Texto rotado", type: "text-rotate", media: [] },
        { id: "text-path", name: "Texto en ruta", type: "text-along-path", media: [] },
      ],
    });

    await service.generate("merchant_1", "store_1", { assetUrls: assets.map((entry) => entry.url), businessCategory: "matcha" });

    const signatureTypes: string[] = [];
    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      const config = call[0].data.config;
      expect(config.animations).toEqual([]);
      expect(config.motionExperiences).toEqual([]);
      signatureTypes.push(config.siteDocument.experience.type);
      const visibleTypes = [
        "hero-carousel",
        ...config.siteDocument.sections.map((section: { motion: string }) => section.motion).filter((motion: string) => motion !== "none"),
        ...(config.siteDocument.experience.type === "none" ? [] : [config.siteDocument.experience.type]),
      ];
      expect(new Set(visibleTypes).size).toBe(visibleTypes.length);
      if (config.siteDocument.experience.type === "scroll-expansion") {
        expect(config.siteDocument.experience.mediaUrls).toHaveLength(2);
      } else {
        expect(config.siteDocument.experience.mediaUrls.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(new Set(signatureTypes)).toEqual(new Set(["scroll-expansion", "full-screen-chapters", "frame-sequence"]));
  });

  it("uses materially different openings while retaining every required commerce section", async () => {
    const { service, prisma } = setup();

    await service.generate("merchant_1", "store_1", {
      motionExperiences: ["story-scroll", "hero-carousel", "image-stream"],
    });

    const orders = prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.map((section: { kind: string }) => section.kind));
    orders.forEach((order) => {
      expect(order).toEqual(expect.arrayContaining(["hero", "story", "catalog", "contact"]));
    });
    expect(new Set(orders.map((order) => order[0])).size).toBeGreaterThanOrEqual(2);
    expect(new Set(orders.map((order) => order.join("/"))).size).toBe(3);
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
    expect(proposal.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "hero").items.every((item: { title: string; body: string }) => item.title && item.body)).toBe(true);
    expect(proposal.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "story").items.every((item: { title: string; body: string }) => item.title && item.body)).toBe(true);
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

  it("neutralizes retired gallery effects in older proposals before applying them", async () => {
    const { service, prisma } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue({
      id: "proposal_legacy",
      storeId: "store_1",
      title: "Galería anterior",
      config: {
        experienceStyle: "diagonal-marquee",
        motionExperience: "coverflow-carousel",
        motionExperiences: ["coverflow-carousel", "hero-carousel"],
        animations: [
          { id: "retired", type: "coverflow-carousel", media: [] },
          { id: "safe", type: "hero-carousel", media: [] },
        ],
        siteDocument: {
          version: 1,
          experience: { type: "3d-gallery", mediaUrls: ["/v1/uploads/one.webp"] },
          sections: [{ id: "gallery", kind: "gallery", layout: "rail", motion: "coverflow" }],
        },
      },
    });

    await service.apply("merchant_1", "store_1", "proposal_legacy");

    const updateData = prisma.store.update.mock.calls[0][0].data;
    expect(updateData.experienceStyle).toBe("editorial-grid");
    expect(updateData.motionExperience).toBe("hero-carousel");
    expect(updateData.motionExperiences).toEqual([]);
    expect(updateData.animations).toEqual([]);
    expect(updateData.motionDuoEnabled).toBe(false);
    expect(updateData.siteDocument.experience).toEqual({ type: "none", mediaUrls: [] });
    expect(updateData.siteDocument.sections[0].motion).toBe("none");
    expect(updateData.siteDocument.sections[0].layout).toBe("grid");
  });

  it("repairs duplicate animation types in proposals created before the uniqueness rule", async () => {
    const { service, prisma } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue({
      id: "proposal_duplicates",
      storeId: "store_1",
      title: "Propuesta anterior",
      config: {
        motionDuoEnabled: true,
        motionExperience: "story-scroll",
        motionExperiences: ["hero-carousel", "story-scroll", "frame-sequence", "frame-sequence"],
        animations: [
          { id: "hero-again", type: "hero-carousel", media: [] },
          { id: "story-again", type: "story-scroll", media: [] },
          { id: "frames-one", type: "frame-sequence", media: [] },
          { id: "frames-two", type: "frame-sequence", media: [] },
          { id: "circle", type: "circle-reveal", media: [] },
        ],
        siteDocument: {
          version: 1,
          experience: { type: "frame-sequence", mediaUrls: ["/v1/uploads/one.webp", "/v1/uploads/two.webp"] },
          sections: [
            { id: "opening", kind: "hero", motion: "none", mediaUrls: ["/v1/uploads/one.webp", "/v1/uploads/two.webp"] },
            { id: "story", kind: "story", motion: "story-scroll", mediaUrls: ["/v1/uploads/one.webp", "/v1/uploads/two.webp"] },
            { id: "contact", kind: "contact", motion: "reveal", mediaUrls: [] },
            { id: "links", kind: "links", motion: "reveal", mediaUrls: [] },
          ],
        },
      },
    });

    await service.apply("merchant_1", "store_1", "proposal_duplicates");

    const updateData = prisma.store.update.mock.calls[0][0].data;
    expect(updateData.animations).toEqual([]);
    expect(updateData.motionExperiences).toEqual([]);
    expect(updateData.motionDuoEnabled).toBe(false);
    expect(updateData.siteDocument.experience).toEqual(expect.objectContaining({ type: "frame-sequence" }));
    expect(updateData.siteDocument.sections.map((section: { motion: string }) => section.motion)).toEqual(["none", "story-scroll", "reveal", "none"]);
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
        pages: [{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }],
        artDirection: (["editorial-house", "cinematic-atelier", "product-studio"] as const)[variant],
        designGenome: {
          composition: (["editorial-split", "quiet-monument", "spatial-cascade"] as const)[variant],
          rhythm: (["editorial", "cinematic", "compact"] as const)[variant],
          geometry: (["soft", "framed", "structured"] as const)[variant],
          colorStrategy: (["accent-led", "surface-led", "contrast-blocks"] as const)[variant],
          mediaStrategy: (["framed", "full-bleed", "collage"] as const)[variant],
          typeScale: (["editorial", "cinematic", "poster"] as const)[variant],
          motionLanguage: (["reveal", "cinematic", "tactile"] as const)[variant],
        },
        theme: {
          pageBackground: ["#edf3f8", "#f2eee7", "#e8f2ef"][variant], textColor: "#171717", accentColor: "#274c43", secondaryColor: "#c9a86a",
          surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4", headingFont: variant === 0 ? "editorial" : variant === 1 ? "humanist" : "geometric",
          bodyFont: "grotesk", radius: variant * 8, shadow: variant === 1 ? "soft" : "none", productLayout: variant === 0 ? "editorial" : variant === 1 ? "gallery" : "showcase",
        },
        navigation: { layout: variant === 0 ? "centered" : variant === 1 ? "brand-left" : "split", sticky: false, transparent: variant === 0 },
        sections: [
          { id: "opening", pageId: "", kind: "hero", layout: variant === 0 ? "full-bleed" : variant === 1 ? "split" : "offset", width: variant === 0 ? "full" : "wide", align: "left", motion: "none", title: "Matcha preparado para tu ritual diario", body: "Un recorrido propio para explorar MATCHO.", ctaLabel: "Ver productos", backgroundColor: ["#edf3f8", "#f2eee7", "#e8f2ef"][variant], textColor: "#171717", mediaIndices: [0], items: [] },
          { id: "shop", pageId: "", kind: "catalog", layout: variant === 0 ? "offset" : "grid", width: "wide", align: "left", motion: "none", title: "La tienda", body: "Explora la selección actual de MATCHO.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaIndices: [], items: [] },
          { id: "story", pageId: "story-page", kind: "story", layout: variant === 2 ? "rail" : "split", width: "wide", align: variant === 2 ? "right" : "left", motion: "none", title: "Conoce MATCHO", body: "Texto borrador para contar la historia real de MATCHO; el comercio debe revisarlo antes de publicar.", ctaLabel: "", backgroundColor: "#edf3f8", textColor: "#171717", mediaIndices: [0], items: [] },
          { id: "visual-world", pageId: "story-page", kind: "gallery", layout: "grid", width: "wide", align: "left", motion: "reveal", title: "El mundo MATCHO", body: "Una mirada cercana a la colección.", ctaLabel: "", backgroundColor: "#c9a86a", textColor: "#171717", mediaIndices: [0], items: [] },
          { id: "information", pageId: "", kind: "contact", layout: "split", width: "wide", align: "left", motion: "reveal", title: "¿Tienes una pregunta?", body: "Escríbele al equipo de MATCHO.", ctaLabel: "Enviar pregunta", backgroundColor: "#ffffff", textColor: "#171717", mediaIndices: [], items: [] },
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
      pagePlan: [{
        id: "story-page",
        label: "Nuestra historia",
        slug: "nuestra-historia",
        purpose: "Separar el relato editorial y la galería del recorrido comercial de Inicio.",
        sectionKinds: ["story", "gallery"],
      }],
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
      for (const call of prisma.storeVisualProposal.create.mock.calls) {
        const sections = call[0].data.config.siteDocument.sections;
        const activeMotions = sections
          .map((section: { motion: string }) => section.motion)
          .filter((motion: string) => motion !== "none");
        expect(activeMotions).toContain("story-scroll");
        expect(activeMotions.filter((motion: string) => ["clip", "drift", "scale"].includes(motion)).length).toBeGreaterThanOrEqual(1);
        expect(activeMotions.length).toBeGreaterThanOrEqual(2);
        expect(activeMotions.length).toBeLessThanOrEqual(3);
        expect(sections[0].motion).not.toBe("none");
        expect(new Set(activeMotions).size).toBe(activeMotions.length);
      }
      expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) =>
        call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "gallery").motion,
      )).size).toBe(3);
      expect(prisma.storeVisualProposal.create.mock.calls[2][0].data.config.siteDocument).toEqual(expect.objectContaining({ artDirection: "product-studio", theme: expect.objectContaining({ productLayout: "gallery" }) }));
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
      expect(designRequest.input[0].content[0].text).toContain("catalog debe ser exactamente la segunda sección");
      expect(designRequest.input[0].content[0].text).toContain("Topologías de página asignadas");
      expect(analysisRequest.input[0].content[0].text).toContain("arquitectura de páginas en pagePlan");
      expect(designRequest.input[0].content[0].text).toContain("Contrato multipágina obligatorio");
      expect(designRequest.input[0].content[0].text).toContain("El string vacío significa Inicio");
      const siteSchema = designRequest.text.format.schema.properties.directions.items.properties.siteDocument;
      expect(siteSchema.required).toContain("pages");
      expect(siteSchema.properties.sections.items.required).toContain("pageId");
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument).toEqual(expect.objectContaining({
        pages: [{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }],
        navigation: expect.objectContaining({ items: expect.arrayContaining([
          expect.objectContaining({ target: "page", pageId: "story-page", label: "Nuestra historia" }),
        ]) }),
      }));
      expect(designRequest.input[0].content[0].text).toContain("No apiles muchas fotografías");
      expect(designRequest.input[0].content[0].text).toContain("placement siempre es after-catalog");
      expect(designRequest.input[0].content[0].text).toContain("Cada tipo distinto de none puede aparecer como máximo una vez");
      expect(designRequest.input[0].content[0].text).toContain("Están prohibidos el layout rail en gallery");
      expect(designRequest.input[0].content[0].text).toContain("no repitas su tipo entre las tres propuestas");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
