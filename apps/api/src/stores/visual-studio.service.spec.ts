import { ConfigService } from "@nestjs/config";
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { VisualStudioService } from "./visual-studio.service";
import { storefrontCreativeRecipe } from "./storefront-engine";
import { STORE_MOTION_EXPERIENCES } from "./dto/create-store.dto";

const store = {
  id: "store_1",
  websiteRevision: 0,
  websitePublishedRevision: 0,
  websiteDraft: null,
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
  function expectGeneratedMotionInventory(config: any, expectedCount?: number) {
    const animations = Array.isArray(config.animations) ? config.animations : [];
    const types = animations.map((animation: { type: string }) => animation.type);
    const registeredTypes = new Set<string>(STORE_MOTION_EXPERIENCES);

    expect(animations.length).toBeGreaterThan(0);
    if (typeof expectedCount === "number") expect(animations).toHaveLength(expectedCount);
    expect(types.every((type: string) => registeredTypes.has(type))).toBe(true);
    expect(new Set(types).size).toBe(types.length);
    expect(config.motionDuoEnabled).toBe(true);
    expect(config.motionExperience).toBe(types[0]);
    expect(config.motionExperiences).toEqual(types);
    expect(config.contentOrder).toEqual(expect.arrayContaining(
      animations.map((animation: { id: string }) => `animation-${animation.id}`),
    ));

    const sectionTypes = config.siteDocument.sections.flatMap((section: { kind: string; mediaUrls?: string[]; motion: string }) => {
      const typesForSection = section.motion === "none" ? [] : [section.motion];
      if (section.kind === "hero" && (section.mediaUrls?.length ?? 0) >= 2) typesForSection.push("hero-carousel");
      return typesForSection;
    });
    expect(new Set(sectionTypes).size).toBe(sectionTypes.length);
    if (config.siteDocument.experience.type !== "none") {
      expect(sectionTypes).not.toContain(config.siteDocument.experience.type);
    }
    for (const type of types) {
      expect(sectionTypes).not.toContain(type);
      expect(config.siteDocument.experience.type).not.toBe(type);
    }
  }

  function setup(configValues: Record<string, unknown> = {}) {
    const prisma = {
      store: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue(store), update: jest.fn().mockResolvedValue({ ...store, accentColor: "#b4532a" }) },
      paymentLink: {
        findMany: jest.fn().mockResolvedValue([{ id: "product_matcha", name: "Matcha ceremonial", description: "Té verde", imageUrls: ["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"], tags: ["matcha"] }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      storeLink: { findMany: jest.fn().mockResolvedValue([{ label: "Instagram", url: "https://instagram.com/matcho" }]) },
      mediaAsset: {
        findMany: jest.fn().mockResolvedValue([
          { id: "asset_1", merchantId: "merchant_1", storeId: null, url: "/v1/uploads/11111111-1111-4111-8111-111111111111.jpg", storageKey: "11111111-1111-4111-8111-111111111111.jpg", mimeType: "image/jpeg", byteSize: 10, kind: "ORIGINAL", parentAssetId: null, createdAt: new Date() },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `asset_${data.storageKey}`, parentAssetId: null, createdAt: new Date(), ...data })),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      storeVisualProposal: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `proposal_${data.title}`, ...data, status: "READY", createdAt: new Date() })),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
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
    const uploads = { getBuffer: jest.fn(), saveBuffer: jest.fn(), deleteFiles: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn((key: string) => key === "app.openAi.enabled" ? true : configValues[key] ?? "") } as unknown as ConfigService;
    const paymentLinks = {
      create: jest.fn().mockImplementation((_merchantId, _storeId, dto) => Promise.resolve({
        id: `product_created_${dto.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        status: "ACTIVE",
        ...dto,
      })),
    };
    return { service: new VisualStudioService(prisma as never, uploads as never, config, paymentLinks as never), prisma, uploads, paymentLinks };
  }

  it("reports a truncated provider response as fallback and never consumes its partial JSON", async () => {
    const { service, prisma } = setup({ "app.openAi.apiKey": "test-key" });
    const originalFetch = global.fetch;
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", content: [{ type: "output_text", text: '{"analysis":{"brandEssence":"partial' }] }],
    }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await service.generate("merchant_1", "store_1", { creativeBrief: "Truncated analysis regression" });
      expect(result.mode).toBe("local");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("store_brand_analysis incomplete: max_output_tokens"));
      expect(prisma.storeVisualProposal.create.mock.calls.every((call) => call[0].data.provider === "local-curated")).toBe(true);
    } finally {
      global.fetch = originalFetch;
      warn.mockRestore();
    }
  });

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
      expectGeneratedMotionInventory(call[0].data.config, 2);
      expect(call[0].data.config.contactFormEnabled).toBe(true);
      expect(call[0].data.config.announcementMode).toBe("static");
      const document = call[0].data.config.siteDocument;
      expect(document.version).toBe(1);
      expect(document.sections.filter((section: { kind: string }) => section.kind === "hero")).toHaveLength(1);
      expect(document.sections.filter((section: { kind: string; pageId?: string }) => section.kind === "catalog" && !section.pageId)).toHaveLength(1);
      expect(document.sections.find((section: { kind: string; pageId?: string }) => section.kind === "catalog" && !section.pageId)?.productIds).toBeUndefined();
      expect(document.pages).toHaveLength(2);
      for (const page of document.pages) {
        expect(document.sections.find((section: { kind: string; pageId?: string; productIds?: string[] }) => section.kind === "catalog" && section.pageId === page.id)?.productIds).toEqual(["product_matcha"]);
      }
      expect(document.sections.filter((section: { kind: string }) => section.kind === "contact")).toHaveLength(1);
      expect(document.sections.flatMap((section: { mediaUrls: string[] }) => section.mediaUrls)).toContain(originalUrl);
      expect(typeof document.navigation.sticky).toBe("boolean");
      expect(["none", "reveal", "clip", "drift", "parallax", "story-scroll"]).toContain(document.sections.find((section: { kind: string }) => section.kind === "story").motion);
      expect(document.sections[0].kind).toBe("hero");
      expect(document.sections[0].motion).not.toBe("none");
      expect(document.sections[1].kind).toBe("catalog");
      expect(document.footer).toEqual(expect.objectContaining({
        enabled: true,
        brandDescription: expect.stringContaining("MATCHO"),
        copyright: expect.stringContaining("MATCHO"),
        badge: expect.stringContaining("pagosYa"),
        columns: expect.arrayContaining([expect.objectContaining({ items: expect.any(Array) })]),
      }));
      expect(document.sections.find((section: { kind: string }) => section.kind === "gallery")?.layout).not.toBe("rail");
      expect(document.pages).toHaveLength(2);
      expect(document.sections.filter((section: { pageId?: string }) => section.pageId).length).toBeGreaterThanOrEqual(4);
      expect(document.sections.find((section: { kind: string }) => section.kind === "contact")?.pageId).toBeUndefined();
      expect(document.navigation.items.filter((item: { target: string }) => item.target === "page")).toHaveLength(2);
      expect(document.sections.find((section: { kind: string }) => section.kind === "hero")?.pageId).toBeUndefined();
      expect(document.sections.find((section: { kind: string }) => section.kind === "catalog")?.pageId).toBeUndefined();
      expect(document.navigation.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Inicio", target: "home" }),
        expect.objectContaining({ target: "catalog" }),
        expect.objectContaining({ target: "page", pageId: document.pages[0].id }),
        expect.objectContaining({ target: "page", pageId: document.pages[1].id }),
      ]));
      expect(document.navigation.items.every((item: { target: string; sectionId?: string }) =>
        item.target !== "section" || document.sections.some((section: { id: string }) => section.id === item.sectionId),
      )).toBe(true);
      expect(new Set(document.sections.map((section: { family: string }) => section.family)).size).toBeGreaterThanOrEqual(2);
      expect(document.sections.every((section: { family: string }) => ["editorial", "cinematic", "product-led", "minimal"].includes(section.family))).toBe(true);
      expect(document.experience.placement).toBe("after-catalog");
      expect(["none", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"]).toContain(document.experience.type);
      expect(document.experience.mediaUrls).toEqual([]);
      expect(["hero-gallery-scroll", "image-stream"]).not.toContain(document.experience.type);
      expect(Object.values(document.theme)).not.toContain("#000000");
    }
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => JSON.stringify(call[0].data.config.siteDocument.sections.map((section: { kind: string; layout: string }) => [section.kind, section.layout])))).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections[0].motion))).toEqual(new Set(["reveal", "drift", "scale"]));
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.artDirection)).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "hero").layout)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "hero").family)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.navigation.layout)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.theme.productLayout)).size).toBe(3);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.experience.type)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "gallery").motion))).toEqual(new Set(["none"]));
    expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.cartButtonLabel)).size).toBe(3);
  });

  it("creates safe editorial source images when a store has no usable photography", async () => {
    const { service, prisma, uploads } = setup({
      "app.openAi.apiKey": "sk-test",
      "app.openAi.imageModel": "gpt-image-2",
    });
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "product_matcha", name: "Matcha ceremonial", description: "Té verde", imageUrls: [], tags: ["matcha"] }]);
    prisma.mediaAsset.findMany.mockResolvedValue([]);
    uploads.getBuffer.mockResolvedValue(null);
    uploads.saveBuffer
      .mockResolvedValueOnce({ filename: "11111111-1111-4111-8111-111111111112.jpg", url: "/v1/uploads/11111111-1111-4111-8111-111111111112.jpg", mimeType: "image/jpeg", byteSize: 12 })
      .mockResolvedValueOnce({ filename: "11111111-1111-4111-8111-111111111113.jpg", url: "/v1/uploads/11111111-1111-4111-8111-111111111113.jpg", mimeType: "image/jpeg", byteSize: 12 });
    const originalFetch = global.fetch;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("generated-landscape").toString("base64") }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("generated-portrait").toString("base64") }] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "use curated directions" } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });

      expect(result.proposals).toHaveLength(3);
      expect(prisma.mediaAsset.create).toHaveBeenCalledTimes(2);
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        merchantId: "merchant_1",
        storeId: "store_1",
        kind: "AI_DERIVED",
        mimeType: "image/jpeg",
      }) });
      const generatedUrls = [
        "/v1/uploads/11111111-1111-4111-8111-111111111112.jpg",
        "/v1/uploads/11111111-1111-4111-8111-111111111113.jpg",
      ];
      for (const call of prisma.storeVisualProposal.create.mock.calls) {
        expect(call[0].data.sourceAssetUrls).toEqual([]);
        expect(call[0].data.generatedUrls).toEqual(generatedUrls);
        expect(JSON.stringify(call[0].data.config.siteDocument)).toContain(generatedUrls[0]);
      }
      const imageRequest = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(imageRequest).toEqual(expect.objectContaining({ model: "gpt-image-2", size: "1536x1024", output_format: "jpeg" }));
      expect(imageRequest.prompt).toContain("Sin logotipos");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("turns unexpected composer failures into a recoverable API error", async () => {
    const { service, prisma } = setup();
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    prisma.paymentLink.findMany.mockRejectedValueOnce(new Error("database connection reset"));

    await expect(service.generate("merchant_1", "store_1", { businessCategory: "matcha" }))
      .rejects.toThrow(ServiceUnavailableException);
    await expect(service.generate("merchant_1", "store_1", { businessCategory: "matcha" }))
      .resolves.toEqual(expect.objectContaining({ proposals: expect.any(Array) }));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Visual proposal generation failed for store store_1"),
      expect.any(String),
    );
    errorSpy.mockRestore();
  });

  it("builds every proposal from colors sampled from the merchant's own images", async () => {
    const { service, prisma } = setup();
    const brandPalette = ["#315f46", "#d6b26a", "#684438"];

    await service.generate("merchant_1", "store_1", {
      businessCategory: "matcha",
      brandPalette,
    });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      const document = call[0].data.config.siteDocument;
      expect(document.theme.pageBackground).not.toBe("#f4ead7");
      expect(document.theme.accentColor).not.toBe("#7a351f");
      expect(document.sections.find((section: { kind: string }) => section.kind === "hero").backgroundColor)
        .toBe(document.theme.pageBackground);
      expect(document.sections.find((section: { kind: string }) => section.kind === "story").backgroundColor)
        .not.toBe(document.theme.pageBackground);
      expect(document.sections.find((section: { kind: string }) => section.kind === "gallery").backgroundColor)
        .not.toBe(document.theme.pageBackground);
    }
  });

  it("creates one targeted private revision while preserving catalog and commerce fields", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    const sourceDocument = structuredClone(sourceData.config.siteDocument);
    const sourceProposal = { baseWebsiteRevision: 0,
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

  it("changes explicit storefront copy without rewriting neighboring content", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    const sourceDocument = structuredClone(sourceData.config.siteDocument);
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
      id: "proposal_source",
      storeId: "store_1",
      title: "Dirección inicial",
      config: sourceData.config,
      sourceAssetUrls: sourceData.sourceAssetUrls,
      generatedUrls: [],
    });
    prisma.storeVisualProposal.create.mockClear();

    const result = await service.revise(
      "merchant_1",
      "store_1",
      "proposal_source",
      "Cambia el título de la portada a “Hecho para durar”.",
    );

    expect(result.plan).toEqual(expect.objectContaining({ target: "opening", action: "replace-title", value: "Hecho para durar" }));
    const revision = prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument;
    const sourceOpening = sourceDocument.sections.find((section: { pageId?: string }) => !section.pageId);
    const nextOpening = revision.sections.find((section: { pageId?: string }) => !section.pageId);
    expect(nextOpening.title).toBe("Hecho para durar");
    expect({ ...nextOpening, title: sourceOpening.title }).toEqual(sourceOpening);
    expect(revision.sections.slice(1)).toEqual(sourceDocument.sections.slice(1));
  });

  it("changes only the requested opening photo and text while preserving every animation", async () => {
    const configValues: Record<string, unknown> = {};
    const { service, prisma, uploads } = setup(configValues);
    await service.generate("merchant_1", "store_1", { businessCategory: "heladería" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    const sourceConfig = structuredClone(sourceData.config);
    const openingId = sourceConfig.siteDocument.sections.find((section: { pageId?: string }) => !section.pageId).id;
    const newPhoto = "/v1/uploads/11111111-1111-4111-8111-111111111199.jpg";
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
      id: "proposal_source",
      storeId: "store_1",
      title: "Dirección inicial",
      config: sourceConfig,
      sourceAssetUrls: sourceData.sourceAssetUrls,
      generatedUrls: [],
    });
    prisma.mediaAsset.findMany.mockResolvedValueOnce([{ url: newPhoto, mimeType: "image/jpeg" }]);
    uploads.getBuffer.mockResolvedValue(Buffer.from("attached-opening-photo"));
    prisma.storeVisualProposal.create.mockClear();
    configValues["app.openAi.apiKey"] = "test-key";
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          target: "opening",
          tone: "unchanged",
          action: "replace-title",
          value: "Helados al mejor precio",
          color: "",
          preserveCatalog: true,
          socialHandle: "",
          socialPlatform: "unknown",
          linkLabel: "",
          linkUrl: "",
          operations: [
            { action: "set", entity: "section", targetId: openingId, parentId: "", field: "title", value: "Helados al mejor precio", secondaryValue: "", position: -1 },
          ],
          imageRequests: [],
          productRequests: [],
          summary: "Cambiar únicamente la foto y el texto de la primera sección.",
        }) }] }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await service.revise(
        "merchant_1",
        "store_1",
        "proposal_source",
        "Pon el título a “Helados al mejor precio” y la foto a la foto que adjunté.",
        ["Comercio: Haz toda la tienda de nuevo y pon animaciones diferentes."],
        [newPhoto],
      );

      const request = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(request.input[0].content[0].text).toContain("La INSTRUCCIÓN ACTUAL tiene prioridad absoluta");
      expect(request.input[0].content[0].text).toContain(`1. ${newPhoto}`);
      expect(request.input[0].content).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "input_text", text: `Referencia adjunta 1: ${newPhoto}` }),
        expect.objectContaining({ type: "input_image", image_url: expect.stringMatching(/^data:image\/jpeg;base64,/) }),
      ]));
      const revision = prisma.storeVisualProposal.create.mock.calls[0][0].data.config;
      const nextOpening = revision.siteDocument.sections.find((section: { id: string }) => section.id === openingId);
      expect(nextOpening.title).toBe("Helados al mejor precio");
      expect(nextOpening.mediaUrls).toEqual([newPhoto]);
      expect(revision.siteDocument.sections.slice(1)).toEqual(sourceConfig.siteDocument.sections.slice(1));
      expect(revision.animations).toEqual(sourceConfig.animations);
      expect(revision.motionDuoEnabled).toBe(sourceConfig.motionDuoEnabled);
      expect(revision.motionExperience).toBe(sourceConfig.motionExperience);
      expect(revision.motionExperiences).toEqual(sourceConfig.motionExperiences);
      expect(revision.contentOrder).toEqual(sourceConfig.contentOrder);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rejects an AI plan that changes animations during a photo and text edit", async () => {
    const configValues: Record<string, unknown> = {};
    const { service, prisma } = setup(configValues);
    await service.generate("merchant_1", "store_1", { businessCategory: "heladería" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    const sourceConfig = structuredClone(sourceData.config);
    const openingId = sourceConfig.siteDocument.sections.find((section: { pageId?: string }) => !section.pageId).id;
    const animationId = sourceConfig.animations[0].id;
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
      id: "proposal_source",
      storeId: "store_1",
      title: "Dirección inicial",
      config: sourceConfig,
      sourceAssetUrls: sourceData.sourceAssetUrls,
      generatedUrls: [],
    });
    prisma.storeVisualProposal.create.mockClear();
    configValues["app.openAi.apiKey"] = "test-key";
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          target: "opening",
          tone: "unchanged",
          action: "replace-title",
          value: "Helados al mejor precio",
          color: "",
          preserveCatalog: true,
          socialHandle: "",
          socialPlatform: "unknown",
          linkLabel: "",
          linkUrl: "",
          operations: [
            { action: "set", entity: "section", targetId: openingId, parentId: "", field: "title", value: "Helados al mejor precio", secondaryValue: "", position: -1 },
            { action: "remove", entity: "animation", targetId: animationId, parentId: "", field: "", value: "", secondaryValue: "", position: -1 },
          ],
          imageRequests: [],
          productRequests: [],
          summary: "Cambiar la portada.",
        }) }] }],
      }),
    }) as unknown as typeof fetch;

    try {
      await expect(service.revise(
        "merchant_1",
        "store_1",
        "proposal_source",
        "Cambia la foto de la primera sección y el texto a “Helados al mejor precio”.",
      )).rejects.toThrow("Yapi intentó cambiar animaciones que no pediste");
      expect(prisma.storeVisualProposal.create).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
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

  it("assigns an explicit HTTPS URL to the named footer link without changing neighboring content", async () => {
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
        columns: [
          { id: "company", title: "Nueva columna", items: [{ id: "new-link", label: "Nuevo enlace", href: "" }] },
          { id: "social", title: "Redes", items: [{ id: "instagram", label: "Instagram", href: "https://instagram.com/matcho" }] },
        ],
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
      "en el que dice nuevo enlace ponle un enlace a https://pagosya.bo",
    );

    expect(result.plan).toEqual(expect.objectContaining({
      target: "footer",
      action: "set-link",
      linkLabel: "nuevo enlace",
      linkUrl: "https://pagosya.bo",
    }));
    const nextDocument = prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument;
    expect(nextDocument.footer.columns[0].items[0]).toEqual({ id: "new-link", label: "Nuevo enlace", href: "https://pagosya.bo" });
    expect(nextDocument.footer.columns[1]).toEqual(sourceDocument.footer.columns[1]);
    expect({ ...nextDocument, direction: sourceDocument.direction, footer: sourceDocument.footer }).toEqual(sourceDocument);
  });

  it("gives the configured AI the complete editor catalog and applies a multi-operation plan", async () => {
    const configValues: Record<string, unknown> = {};
    const { service, prisma } = setup(configValues);
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
      id: "proposal_source",
      storeId: "store_1",
      title: "Dirección inicial",
      config: sourceData.config,
      sourceAssetUrls: sourceData.sourceAssetUrls,
      generatedUrls: [],
    });
    prisma.storeVisualProposal.create.mockClear();
    configValues["app.openAi.apiKey"] = "test-key";
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          target: "site",
          tone: "unchanged",
          action: "restyle",
          value: "",
          color: "",
          preserveCatalog: true,
          socialHandle: "",
          socialPlatform: "unknown",
          linkLabel: "",
          linkUrl: "",
          operations: [
            { action: "set", entity: "navigation", targetId: "", parentId: "", field: "sticky", value: "no", secondaryValue: "", position: -1 },
            { action: "add", entity: "page", targetId: "care", parentId: "", field: "", value: "Cuidados", secondaryValue: "cuidados", position: -1 },
            { action: "set", entity: "visual-setting", targetId: "", parentId: "", field: "announcement", value: "Envío gratis hoy", secondaryValue: "", position: -1 },
          ],
          summary: "Soltar el encabezado, crear Cuidados y anunciar el envío.",
        }) }] }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await service.revise("merchant_1", "store_1", "proposal_source", "Deja de fijar el encabezado y crea una página llamada Cuidados.");

      const request = JSON.parse(fetchMock.mock.calls[0][1].body);
      const prompt = request.input[0].content[0].text;
      expect(prompt).toContain("Catálogo completo de operaciones");
      expect(prompt).toContain("navigation-item");
      expect(prompt).toContain("footer-link");
      expect(prompt).toContain("section-block");
      expect(prompt).toContain("allowedProductIds");
      expect(result.changedAreas).toEqual(expect.arrayContaining(["encabezado", "páginas", "marquesina"]));
      const nextConfig = prisma.storeVisualProposal.create.mock.calls[0][0].data.config;
      const nextDocument = nextConfig.siteDocument;
      expect(nextDocument.navigation.sticky).toBe(false);
      expect(nextDocument.pages).toContainEqual({ id: "care", label: "Cuidados", slug: "cuidados" });
      expect(nextConfig.announcement).toBe("Envío gratis hoy");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("lets Yapi generate one bounded image into a private storefront revision", async () => {
    const configValues: Record<string, unknown> = {};
    const { service, prisma, uploads } = setup(configValues);
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    const originalOpeningUrl = sourceData.config.siteDocument.sections[0].mediaUrls[0];
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
      id: "proposal_source",
      storeId: "store_1",
      title: "Dirección inicial",
      config: sourceData.config,
      sourceAssetUrls: sourceData.sourceAssetUrls,
      generatedUrls: [],
    });
    prisma.storeVisualProposal.create.mockClear();
    configValues["app.openAi.apiKey"] = "sk-test";
    configValues["app.openAi.imageModel"] = "gpt-image-2";
    uploads.saveBuffer.mockResolvedValue({
      filename: "11111111-1111-4111-8111-111111111114.jpg",
      url: "/v1/uploads/11111111-1111-4111-8111-111111111114.jpg",
      mimeType: "image/jpeg",
      byteSize: 16,
    });
    const originalFetch = global.fetch;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
          target: "opening",
          tone: "unchanged",
          action: "restyle",
          value: "",
          color: "",
          preserveCatalog: true,
          socialHandle: "",
          socialPlatform: "unknown",
          linkLabel: "",
          linkUrl: "",
          operations: [],
          imageRequests: [{ action: "set", entity: "visual-setting", targetId: "", parentId: "", field: "imageUrl", position: 0, aspectRatio: "landscape", prompt: "Una escena editorial cálida y abstracta con materiales naturales" }],
          summary: "Crear una imagen editorial para la portada.",
        }) }] }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("generated-editorial").toString("base64") }] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await service.revise("merchant_1", "store_1", "proposal_source", "Genera una imagen editorial para la portada.");

      expect(result.changedAreas).toEqual(expect.arrayContaining(["medios", "imágenes generadas"]));
      const created = prisma.storeVisualProposal.create.mock.calls[0][0].data;
      expect(created.generatedUrls).toEqual(["/v1/uploads/11111111-1111-4111-8111-111111111114.jpg"]);
      expect(created.config.siteDocument.sections[0].mediaUrls[0]).toBe("/v1/uploads/11111111-1111-4111-8111-111111111114.jpg");
      expect(sourceData.config.siteDocument.sections[0].mediaUrls[0]).toBe(originalOpeningUrl);
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "AI_DERIVED", storeId: "store_1" }) });
      const imageRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(imageRequest).toEqual(expect.objectContaining({ model: "gpt-image-2", quality: "medium", size: "1536x1024" }));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it.each(["budget", "missing-target"])("rejects an invalid complete plan before generating paid imagery: %s", async (failure) => {
    const { service, prisma, uploads, paymentLinks } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0, id: "proposal_source", storeId: "store_1", title: "Inicial", config: sourceData.config });
    prisma.storeVisualProposal.create.mockClear();
    const story = sourceData.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "story");
    const operation = { action: "set", entity: "section", targetId: story.id, parentId: "", field: "title", value: "Nuestra historia", secondaryValue: "", position: -1 };
    const plan = {
      target: "site", tone: "unchanged", action: "restyle", value: "", color: "", preserveCatalog: true,
      socialHandle: "", socialPlatform: "unknown", linkLabel: "", linkUrl: "", productRequests: [], summary: "Cambiar textos y crear una foto",
      operations: failure === "budget" ? Array.from({ length: 12 }, (_, index) => ({ ...operation, value: `Historia ${index}` })) : [],
      imageRequests: [{ action: "set", entity: "section-media", targetId: "", parentId: failure === "missing-target" ? "missing-section" : story.id, field: "", position: 0, aspectRatio: "landscape", prompt: "Una imagen editorial de materiales naturales sobre una mesa" }],
    };
    jest.spyOn(service as any, "agentRevisionPlan").mockResolvedValue(plan);
    const generateImage = jest.spyOn(service as any, "generateStorefrontImage");

    await expect(service.revise("merchant_1", "store_1", "proposal_source", "Cambia los textos de la historia y genera una imagen editorial.")).rejects.toThrow(
      failure === "budget" ? "13 pasos" : "missing-section",
    );
    expect(generateImage).not.toHaveBeenCalled();
    expect(uploads.saveBuffer).not.toHaveBeenCalled();
    expect(paymentLinks.create).not.toHaveBeenCalled();
    expect(prisma.storeVisualProposal.create).not.toHaveBeenCalled();
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it("creates a product with an ordered multi-image gallery and places it on the requested page", async () => {
    const configValues: Record<string, unknown> = {};
    const { service, prisma, uploads, paymentLinks } = setup(configValues);
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const sourceData = prisma.storeVisualProposal.create.mock.calls[0][0].data;
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
      id: "proposal_source",
      storeId: "store_1",
      title: "Dirección inicial",
      config: sourceData.config,
      sourceAssetUrls: sourceData.sourceAssetUrls,
      generatedUrls: [],
    });
    prisma.storeVisualProposal.create.mockClear();
    const firstPhoto = "/v1/uploads/11111111-1111-4111-8111-111111111121.jpg";
    const secondPhoto = "/v1/uploads/11111111-1111-4111-8111-111111111122.jpg";
    prisma.mediaAsset.findMany.mockResolvedValue([
      { url: firstPhoto },
      { url: secondPhoto },
    ]);
    configValues["app.openAi.apiKey"] = "sk-test";
    configValues["app.openAi.imageModel"] = "gpt-image-2";
    uploads.saveBuffer
      .mockResolvedValueOnce({ filename: "11111111-1111-4111-8111-111111111123.jpg", url: "/v1/uploads/11111111-1111-4111-8111-111111111123.jpg", mimeType: "image/jpeg", byteSize: 16 })
      .mockResolvedValueOnce({ filename: "11111111-1111-4111-8111-111111111124.jpg", url: "/v1/uploads/11111111-1111-4111-8111-111111111124.jpg", mimeType: "image/jpeg", byteSize: 16 });
    paymentLinks.create.mockResolvedValueOnce({ id: "product_matcha_frio", name: "Matcha frio", status: "ACTIVE" });
    const instruction = "Crea el producto Matcha frio por Bs. 35, descripción Bebida de matcha con leche de avena, stock 8, agrégalo a Inicio con estas fotos y genera dos fotos del vaso verde sobre una mesa clara.";
    const originalFetch = global.fetch;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
          target: "catalog",
          tone: "unchanged",
          action: "restyle",
          value: "",
          color: "",
          preserveCatalog: true,
          socialHandle: "",
          socialPlatform: "unknown",
          linkLabel: "",
          linkUrl: "",
          operations: [],
          imageRequests: [
            { action: "add", entity: "new-product", targetId: "matcha-frio", parentId: "", field: "imageUrl", position: -1, aspectRatio: "square", prompt: "Vaso verde de matcha frío sobre una mesa clara, vista frontal" },
            { action: "add", entity: "new-product", targetId: "matcha-frio", parentId: "", field: "imageUrl", position: -1, aspectRatio: "portrait", prompt: "Vaso verde de matcha frío sobre una mesa clara, detalle lateral" },
          ],
          productRequests: [{
            key: "matcha-frio",
            name: "Matcha frio",
            nameEvidence: "Matcha frio",
            description: "Bebida de matcha con leche de avena",
            descriptionEvidence: "Bebida de matcha con leche de avena",
            amount: 3500,
            amountEvidence: "Bs. 35",
            currency: "BOB",
            stock: 8,
            stockEvidence: "stock 8",
            categoryId: "",
            imageUrls: [firstPhoto, secondPhoto],
            pageIds: [""],
          }],
          summary: "Crear Matcha frio y mostrarlo en Inicio.",
        }) }] }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("generated-product-one").toString("base64") }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("generated-product-two").toString("base64") }] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await service.revise("merchant_1", "store_1", "proposal_source", instruction, [], [firstPhoto, secondPhoto]);

      expect(paymentLinks.create).toHaveBeenCalledWith("merchant_1", "store_1", expect.objectContaining({
        name: "Matcha frio",
        description: "Bebida de matcha con leche de avena",
        amount: 3500,
        currency: "BOB",
        stock: 8,
        imageUrls: [
          firstPhoto,
          secondPhoto,
          "/v1/uploads/11111111-1111-4111-8111-111111111123.jpg",
          "/v1/uploads/11111111-1111-4111-8111-111111111124.jpg",
        ],
      }));
      expect(result.createdProducts).toEqual([expect.objectContaining({ id: "product_matcha_frio", status: "ACTIVE" })]);
      expect(result.changedAreas).toEqual(expect.arrayContaining(["productos", "imágenes generadas"]));
      const nextDocument = prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument;
      const homeCatalog = nextDocument.sections.find((section: { kind: string; pageId?: string }) => section.kind === "catalog" && !section.pageId);
      const sourceHomeCatalog = sourceData.config.siteDocument.sections.find((section: { kind: string; pageId?: string }) => section.kind === "catalog" && !section.pageId);
      expect(homeCatalog.productIds).toEqual([...new Set([...(sourceHomeCatalog.productIds ?? []), "product_matcha_frio"])]);
      expect(prisma.mediaAsset.create).toHaveBeenCalledTimes(2);
      const firstImagePrompt = JSON.parse(fetchMock.mock.calls[1][1].body).prompt;
      expect(firstImagePrompt).toContain("Representa únicamente el producto descrito literalmente");
    } finally {
      global.fetch = originalFetch;
    }
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
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0, id: "proposal_1", storeId: "store_1", config: { siteDocument: document } });

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

  it("keeps generated media bounded while preserving purposeful section motion", async () => {
    const { service, prisma } = setup();

    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });

    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expectGeneratedMotionInventory(call[0].data.config, 2);
      expect(call[0].data.config.contentOrder[0]).toBe("hero");
      const motions = call[0].data.config.siteDocument.sections.map((section: { motion: string }) => section.motion);
      expect(motions).not.toContain("marquee");
      expect(motions.some((motion: string) => motion !== "none")).toBe(true);
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
    expect(config.animations).toEqual([{ id: "circle-one", type: "circle-reveal", media: [] }]);
    expect(config.motionExperiences).toEqual(["circle-reveal"]);
    expect(config.motionDuoEnabled).toBe(true);
    expect(config.contentOrder).toEqual(["hero", "animation-circle-one", "products", "about", "gallery", "links", "contact", "location"]);
    expect(JSON.stringify(config.contentOrder)).not.toContain("animation-circle-two");
    expect(config.siteDocument.experience.type).toBe("none");
    expect(config.siteDocument.sections.find((section: { kind: string }) => section.kind === "gallery").layout).toBe("grid");
    expect(config.siteDocument.sections.map((section: { motion: string }) => section.motion)).toEqual(["none", "story-scroll", "clip", "reveal", "none"]);
  });

  it("keeps a saved proposal stable when the live store changes", async () => {
    const { service, prisma } = setup();
    const savedConfig = {
      contentOrder: ["hero", "products"],
      animations: [],
      motionExperiences: [],
      siteDocument: {
        navigation: { layout: "inline", sticky: false, items: [] },
        experience: { type: "none", mediaUrls: [] },
        sections: [
          { id: "opening", kind: "hero", pageId: "", title: "Portada guardada", motion: "none", mediaUrls: ["/saved.webp"], items: [] },
          { id: "catalog", kind: "catalog", pageId: "", title: "Productos guardados", motion: "none", mediaUrls: [], items: [] },
        ],
      },
    };
    const persistedSnapshot = structuredClone(savedConfig);
    prisma.storeVisualProposal.findMany.mockResolvedValue([{ id: "proposal_saved", config: savedConfig }]);
    prisma.storeVisualVersion.findMany.mockResolvedValue([]);
    prisma.store.findFirst
      .mockResolvedValueOnce({ ...store, name: "MATCHO", slug: "matcho" })
      .mockResolvedValueOnce({ ...store, name: "OTRO NOMBRE", slug: "otro-slug" });

    const first = await service.list("merchant_1", "store_1");
    const second = await service.list("merchant_1", "store_1");

    expect(second.proposals[0].config).toEqual(first.proposals[0].config);
    expect(savedConfig).toEqual(persistedSnapshot);
    expect(prisma.storeLink.findMany).not.toHaveBeenCalled();
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
      expectGeneratedMotionInventory(call[0].data.config, 2);
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
        announcement: "MATCHO • Explora la tienda",
        announcementMode: "marquee",
        announcementSpeed: 22,
        announcementSize: "medium",
        announcementFont: "store",
        announcementEffect: "none",
      }));
      expectGeneratedMotionInventory(proposal.config, 2);
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
      expectGeneratedMotionInventory(config, 3);
      signatureTypes.push(config.siteDocument.experience.type);
      const catalog = config.siteDocument.sections.find((section: { kind: string }) => section.kind === "catalog");
      expect(config.siteDocument.experience.title).not.toBe(catalog.title);
      expect(config.siteDocument.experience.body).not.toBe(catalog.body);
      expect(config.siteDocument.sections.some((section: { motion: string }) => section.motion !== "none")).toBe(true);
      expect(config.siteDocument.pages).toHaveLength(2);
      expect(config.siteDocument.experience.mediaUrls).toEqual([]);
    }
    expect(new Set(signatureTypes).size).toBe(3);
    expect(signatureTypes.every((type) => ["none", "text-reveal-block", "text-rotate", "text-along-path"].includes(type))).toBe(true);
  });

  it("uses materially different visual hero openings while retaining every required commerce section", async () => {
    const { service, prisma } = setup();

    await service.generate("merchant_1", "store_1", {
      motionExperiences: ["story-scroll", "hero-carousel", "image-stream"],
    });

    const orders = prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections.map((section: { kind: string }) => section.kind));
    orders.forEach((order) => {
      expect(order).toEqual(expect.arrayContaining(["hero", "story", "catalog", "contact"]));
      expect(order[0]).toBe("hero");
      expect(order[1]).toBe("catalog");
    });
    expect(new Set(orders.map((order) => order.join("/"))).size).toBe(3);
    const openingMotions = prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.config.siteDocument.sections[0].motion);
    expect(new Set(openingMotions)).toEqual(new Set(["reveal", "drift", "scale"]));
  });

  it("uses an uploaded video as the lead scene for one generated opening", async () => {
    const { service, prisma } = setup();
    const assets = [
      { id: "asset_image_1", url: "/v1/uploads/00000000-0000-4000-8000-000000000001.jpg", storageKey: "one.jpg", mimeType: "image/jpeg" },
      { id: "asset_image_2", url: "/v1/uploads/00000000-0000-4000-8000-000000000002.jpg", storageKey: "two.jpg", mimeType: "image/jpeg" },
      { id: "asset_video", url: "/v1/uploads/00000000-0000-4000-8000-000000000003.mp4", storageKey: "opening.mp4", mimeType: "video/mp4" },
    ].map((asset) => ({
      ...asset,
      merchantId: "merchant_1",
      storeId: null,
      byteSize: 10,
      kind: "ORIGINAL",
      parentAssetId: null,
      createdAt: new Date(),
    }));
    prisma.mediaAsset.findMany.mockResolvedValue(assets);
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "product_matcha",
      name: "Matcha ceremonial",
      description: "Té verde",
      imageUrls: assets.slice(0, 2).map((asset) => asset.url),
      tags: ["matcha"],
    }]);

    await service.generate("merchant_1", "store_1", {
      assetUrls: assets.map((asset) => asset.url),
      businessCategory: "matcha",
    });

    const thirdOpening = prisma.storeVisualProposal.create.mock.calls[2][0].data.config.siteDocument.sections[0];
    expect(thirdOpening).toEqual(expect.objectContaining({ kind: "hero", motion: "scale" }));
    expect(thirdOpening.mediaUrls[0]).toBe(assets[2].url);
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
    expect(proposal.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "hero").mediaUrls).toHaveLength(1);
    expect(proposal.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "story").mediaUrls).toHaveLength(2);
    const homeNarrative = proposal.config.siteDocument.sections.filter((section: { kind: string; pageId?: string }) => !section.pageId && ["hero", "story", "gallery"].includes(section.kind));
    const homeMedia = homeNarrative.flatMap((section: { mediaUrls: string[] }) => section.mediaUrls);
    expect(new Set(homeMedia).size).toBe(homeMedia.length);
    expect(homeNarrative.filter((section: { width: string; layout: string; mediaUrls: string[] }) => section.mediaUrls.length && (section.width === "full" || section.layout === "full-bleed"))).toHaveLength(1);
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

  it("uses the selected second photo from the private draft and preserves a manually edited heading", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const document = structuredClone(prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument);
    document.sections[0].title = "Manual title";
    document.sections[0].mediaUrls = ["/v1/uploads/original-a.jpg", "/v1/uploads/original-b.jpg"];
    document.sections[0].blocks = [];
    const publicDocument = structuredClone(document);
    publicDocument.sections[0].title = "Public title";
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument: publicDocument, websiteRevision: 3,
      websiteDraft: { data: { siteDocument: document }, basePublishedRevision: 0 } });
    const assets = ["/v1/uploads/first.jpg", "/v1/uploads/second.jpg"];
    prisma.mediaAsset.findMany.mockResolvedValue(assets.map((url) => ({ url, mimeType: "image/jpeg" })));
    const selection = { entity: "section-media", parentId: document.sections[0].id, targetId: "", field: "imageUrl", position: 1, pageId: "" };
    const result = await service.revise("merchant_1", "store_1", null, "Reemplaza esta foto por la segunda imagen adjunta", [], assets, { revision: 3, selection });
    const revised = (result.proposal.config as any).siteDocument;
    expect(revised.sections[0].mediaUrls).toEqual([assets.length && "/v1/uploads/original-a.jpg", assets[1]]);
    expect(revised.sections[0].title).toBe("Manual title");
    expect(revised.sections.slice(1)).toEqual(document.sections.slice(1));
    expect(result.proposal.baseWebsiteRevision).toBe(3);
    expect(prisma.store.updateMany).not.toHaveBeenCalled();
    expect(publicDocument.sections[0].title).toBe("Public title");
  });

  it("edits a selected nested title and refuses a wrong target, no-op, stale revision or foreign section", async () => {
    const { service, prisma } = setup();
    await service.generate("merchant_1", "store_1", { businessCategory: "matcha" });
    const document = structuredClone(prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument);
    const section = document.sections[0];
    section.blocks = [{ id: "group-one", kind: "group", slot: "body", role: "primary", text: "", mediaUrl: null,
      children: [{ id: "child-heading", kind: "heading", slot: "body", role: "primary", text: "Before", mediaUrl: null, children: [] }] }];
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument: document });
    const selection = { entity: "section-block", parentId: section.id, targetId: "child-heading", field: "text", position: -1, pageId: "" };
    const result = await service.revise("merchant_1", "store_1", null, 'Cambia este título a “Exact words”', [], [], { revision: 0, selection });
    expect((result.proposal.config as any).siteDocument.sections[0].blocks[0].children[0].text).toBe("Exact words");
    expect(section.blocks[0].children[0].text).toBe("Before");
    await expect(service.revise("merchant_1", "store_1", null, 'Cambia este título a “Before”', [], [], { revision: 0, selection })).rejects.toThrow("ya tiene ese contenido");
    await expect(service.revise("merchant_1", "store_1", null, 'Cambia este título a “New”', [], [], { revision: 1, selection })).rejects.toThrow("borrador cambió");
    await expect(service.revise("merchant_1", "store_1", null, 'Cambia este título a “New”', [], [], { revision: 0, selection: { ...selection, parentId: "foreign-section" } })).rejects.toThrow("ya no está disponible");
    jest.spyOn(service as any, "agentRevisionPlan").mockResolvedValue({ ...result.plan, operations: [{ action: "set", entity: "section", targetId: document.sections[1].id, parentId: "", field: "title", value: "Wrong", secondaryValue: "", position: -1 }] });
    await expect(service.revise("merchant_1", "store_1", null, 'Cambia este título a “New”', [], [], { revision: 0, selection })).rejects.toThrow("salió del elemento seleccionado");
  });

  it("snapshots the current look and ignores proposal fields outside the visual allowlist", async () => {
    const { service, prisma } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
      id: "proposal_1",
      storeId: "store_1",
      title: "Taller cálido",
      config: { accentColor: "#b4532a", fontStyle: "friendly", name: "A name the model must not change", html: "<script>bad()</script>" },
    });

    await service.apply("merchant_1", "store_1", "proposal_1", 0);

    expect(prisma.storeVisualVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store_1", source: "draft-proposal:proposal_1" }) }));
    expect(prisma.store.update).not.toHaveBeenCalled();
    const updateData = prisma.store.updateMany.mock.calls[0][0].data.websiteDraft.data;
    expect(updateData).toEqual({ accentColor: "#b4532a", fontStyle: "friendly" });
    expect(updateData).not.toHaveProperty("name");
    expect(updateData).not.toHaveProperty("html");
  });

  it("keeps still-supported effects while retiring unknown effects from an older proposal", async () => {
    const { service, prisma } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
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

    await service.apply("merchant_1", "store_1", "proposal_legacy", 0);

    const updateData = prisma.store.updateMany.mock.calls[0][0].data.websiteDraft.data;
    expect(updateData.experienceStyle).toBe("editorial-grid");
    expect(updateData.motionExperience).toBe("hero-carousel");
    expect(updateData.motionExperiences).toEqual(["hero-carousel"]);
    expect(updateData.animations).toEqual([{ id: "safe", type: "hero-carousel", media: [] }]);
    expect(updateData.motionDuoEnabled).toBe(true);
    expect(updateData.siteDocument.experience).toEqual({ type: "none", mediaUrls: [] });
    expect(updateData.siteDocument.sections[0].motion).toBe("coverflow");
    expect(updateData.siteDocument.sections[0].layout).toBe("grid");
  });

  it("applies the same supported motion canvas shown by Ver aquí", async () => {
    const { service, prisma } = setup();
    const selected = { baseWebsiteRevision: 0,
      id: "proposal_selected",
      storeId: "store_1",
      title: "Compra sin vueltas",
      createdAt: new Date("2026-09-03T12:00:00.000Z"),
      config: {
        motionDuoEnabled: true,
        motionExperience: "gallery-accordion",
        motionExperiences: ["gallery-accordion", "draggable-cards", "sticky-gallery"],
        animations: [
          { id: "ai-gallery", name: "Galería", type: "gallery-accordion", media: [] },
          { id: "ai-cards", name: "Tarjetas", type: "draggable-cards", media: [] },
          { id: "ai-sticky", name: "Galería fija", type: "sticky-gallery", media: [] },
        ],
        contentOrder: ["hero", "animation-ai-gallery", "products", "animation-ai-cards", "animation-ai-sticky", "links"],
        siteDocument: {
          version: 1,
          experience: { type: "none", mediaUrls: [] },
          navigation: { layout: "brand-left", sticky: false, transparent: false },
          sections: [
            { id: "opening", kind: "hero", motion: "reveal", mediaUrls: [], items: [] },
            { id: "shop", kind: "catalog", motion: "none", mediaUrls: [], items: [] },
            { id: "contact", kind: "contact", motion: "clip", mediaUrls: [], items: [] },
          ],
        },
      },
    };
    const newer = { ...selected, id: "proposal_newer", title: "Otra dirección", createdAt: new Date("2026-09-03T13:00:00.000Z") };
    prisma.storeVisualProposal.findMany.mockResolvedValue([newer, selected]);
    prisma.storeVisualProposal.findFirst.mockResolvedValue(selected);

    const shown = (await service.list("merchant_1", "store_1")).proposals[1].config as any;
    await service.apply("merchant_1", "store_1", selected.id, 0);
    const applied = prisma.store.updateMany.mock.calls[0][0].data.websiteDraft.data;

    expect(applied.animations).toEqual(shown.animations);
    expect(applied.motionExperiences).toEqual(shown.motionExperiences);
    expect(applied.contentOrder).toEqual(shown.contentOrder);
    expect(applied.siteDocument).toEqual(shown.siteDocument);
    expect(applied.siteDocument.sections[0].motion).toBe("reveal");
    expect(applied.animations.map((animation: { type: string }) => animation.type)).toEqual([
      "gallery-accordion", "draggable-cards", "sticky-gallery",
    ]);
  });

  it("repairs duplicate animation types in proposals created before the uniqueness rule", async () => {
    const { service, prisma } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ baseWebsiteRevision: 0,
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

    await service.apply("merchant_1", "store_1", "proposal_duplicates", 0);

    const updateData = prisma.store.updateMany.mock.calls[0][0].data.websiteDraft.data;
    expect(updateData.animations).toEqual([
      { id: "frames-one", type: "frame-sequence", media: [] },
      { id: "circle", type: "circle-reveal", media: [] },
    ]);
    expect(updateData.motionExperiences).toEqual(["frame-sequence", "circle-reveal"]);
    expect(updateData.motionDuoEnabled).toBe(true);
    expect(updateData.siteDocument.experience).toEqual(expect.objectContaining({ type: "none", mediaUrls: [] }));
    expect(updateData.siteDocument.sections.map((section: { motion: string }) => section.motion)).not.toContain("marquee");
    expect(updateData.siteDocument.sections.every((section: { motion: string }) => ["none", "reveal", "clip", "drift", "scale", "parallax", "story-scroll"].includes(section.motion))).toBe(true);
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
          { id: "shop", pageId: "", kind: "catalog", layout: variant === 0 ? "offset" : "grid", width: "wide", align: "left", motion: "reveal", title: "La tienda", body: "Explora la selección actual de MATCHO.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaIndices: [], items: [] },
          { id: "story", pageId: "story-page", kind: "story", layout: variant === 2 ? "rail" : "split", width: "wide", align: variant === 2 ? "right" : "left", motion: "none", title: "Conoce MATCHO", body: "Texto borrador para contar la historia real de MATCHO; el comercio debe revisarlo antes de publicar.", ctaLabel: "", backgroundColor: "#edf3f8", textColor: "#171717", mediaIndices: [0], items: [] },
          { id: "visual-world", pageId: "story-page", kind: "gallery", layout: "grid", width: "wide", align: "left", motion: "reveal", title: "El mundo MATCHO", body: "Una mirada cercana a la colección.", ctaLabel: "", backgroundColor: "#c9a86a", textColor: "#171717", mediaIndices: [0], items: [] },
          { id: "story-shop", pageId: "story-page", kind: "catalog", layout: "grid", width: "wide", align: "left", motion: "scale", title: "Productos de la historia", body: "Una selección para esta página.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaIndices: [], items: [] },
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
        heroSlides: [],
        editorialGallery: [],
        siteDocument: expect.objectContaining({ version: 1, direction: "Bosque editorial" }),
      }));
      expectGeneratedMotionInventory(prisma.storeVisualProposal.create.mock.calls[0][0].data.config, 2);
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config).not.toHaveProperty("html");
      expect(prisma.storeVisualProposal.create.mock.calls.flatMap((call) => call[0].data.config.siteDocument.sections).some((section: { kind: string }) => section.kind === "benefits")).toBe(false);
      for (const call of prisma.storeVisualProposal.create.mock.calls) {
        const sections = call[0].data.config.siteDocument.sections;
        const activeMotions = sections
          .map((section: { motion: string }) => section.motion)
          .filter((motion: string) => motion !== "none");
        expect(activeMotions.length).toBeGreaterThan(0);
      }
      expect(new Set(prisma.storeVisualProposal.create.mock.calls.map((call) =>
        call[0].data.config.siteDocument.sections.find((section: { kind: string }) => section.kind === "gallery").motion,
      ))).toEqual(new Set(["none"]));
      expect(prisma.storeVisualProposal.create.mock.calls[2][0].data.config.siteDocument).toEqual(expect.objectContaining({ artDirection: "product-studio", theme: expect.objectContaining({ productLayout: "gallery" }) }));
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.provider).toBe("openai:gpt-5.6-sol");
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const analysisRequest = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      const designRequest = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body as string);
      // A real provider request rejected this keyword before generation began.
      // Check both outbound schemas, including all nested arrays.
      for (const request of [analysisRequest, designRequest]) {
        expect(JSON.stringify(request.text.format.schema)).not.toContain('"uniqueItems"');
      }
      expect(analysisRequest.model).toBe("gpt-5.6-sol");
      expect(analysisRequest.reasoning).toEqual({ effort: "medium" });
      expect(analysisRequest.max_output_tokens).toBe(8_000);
      expect(analysisRequest.input[0].content[1].detail).toBe("high");
      expect(designRequest.max_output_tokens).toBe(32_000);
      expect(designRequest.input[0].content[0].text).toContain("Análisis de marca obligatorio");
      expect(designRequest.input[0].content[0].text).toContain("No existe benefits");
      expect(designRequest.input[0].content[0].text).toContain("Hero debe ser la primera sección");
      expect(designRequest.input[0].content[0].text).toContain("Topologías de página asignadas");
      expect(analysisRequest.input[0].content[0].text).toContain("arquitectura de páginas en pagePlan");
      expect(designRequest.input[0].content[0].text).toContain("Contrato multipágina obligatorio");
      expect(designRequest.input[0].content[0].text).toContain("El string vacío significa Inicio");
      const siteSchema = designRequest.text.format.schema.properties.directions.items.properties.siteDocument;
      expect(siteSchema.required).toContain("pages");
      for (const section of siteSchema.properties.sections.items.anyOf) expect(section.required).toContain("pageId");
      const generatedDocument = prisma.storeVisualProposal.create.mock.calls[0][0].data.config.siteDocument;
      expect(generatedDocument.pages).toHaveLength(2);
      expect(generatedDocument.navigation.items.some((item: { target: string }) => item.target === "page")).toBe(true);
      for (const page of generatedDocument.pages) {
        expect(generatedDocument.sections.some((section: { pageId?: string; kind: string }) => section.pageId === page.id && section.kind === "catalog")).toBe(true);
      }
      expect(designRequest.input[0].content[0].text).toContain("No apiles muchas fotografías");
      expect(designRequest.input[0].content[0].text).toContain("placement siempre es after-catalog");
      expect(designRequest.input[0].content[0].text).toContain("El movimiento debe tener propósito");
      expect(designRequest.input[0].content[0].text).toContain("un catalog por cada página adicional");
      expect(designRequest.input[0].content[0].text).toContain("experience tipográfica discreta");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
