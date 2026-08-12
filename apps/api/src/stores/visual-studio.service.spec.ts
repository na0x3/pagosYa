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
  backgroundImageUrl: null,
  contactPhone: null,
  contactEmail: null,
  aboutText: null,
  aboutImageUrl: null,
  accentColor: null,
  fontStyle: "mono",
  buttonStyle: "rounded",
  boardTexture: "chalkboard",
  announcement: null,
  announcementMode: "static",
  announcementSpeed: 18,
  promotionEnabled: false,
  promotionTitle: null,
  promotionBody: null,
  promotionCtaLabel: null,
  promotionCtaUrl: null,
  heroSlides: [],
  contentOrder: ["hero", "products", "about", "gallery", "links"],
  editorialGallery: [],
  buttonVariant: "solid",
  buttonMotion: "lift",
  cartButtonLabel: "Ir a pagar",
  status: "ACTIVE",
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("VisualStudioService", () => {
  function setup(configValues: Record<string, unknown> = {}) {
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue(store), update: jest.fn().mockResolvedValue({ ...store, accentColor: "#b4532a" }) },
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
    const result = await service.generate("merchant_1", "store_1", { assetUrls: [originalUrl], businessCategory: "matcha" });

    expect(result.mode).toBe("local");
    expect(result.originalsPreserved).toBe(true);
    expect(result.proposals).toHaveLength(3);
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { storeId: "store_1" } }));
    for (const call of prisma.storeVisualProposal.create.mock.calls) {
      expect(call[0].data.sourceAssetUrls).toEqual([originalUrl]);
      expect(call[0].data.config.heroSlides).toEqual([{ imageUrl: originalUrl }]);
      expect(call[0].data.config).not.toHaveProperty("html");
      expect(call[0].data.config).not.toHaveProperty("css");
    }
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
    const directions = [
      { title: "Bosque editorial", rationale: "Una dirección serena que convierte el producto real en el centro visual.", imagePrompt: "Composición horizontal editorial con el producto real, luz natural y fondo marfil sin texto.", backgroundColor: "#f7f5f0", accentColor: "#274c43", fontStyle: "editorial", buttonStyle: "square", boardTexture: "painted", buttonVariant: "outline", buttonMotion: "none", cartButtonLabel: "Completar pedido", contentOrder: ["hero", "products", "about", "gallery", "links"] },
      { title: "Taller natural", rationale: "Una dirección cálida y táctil que transmite cercanía sin cambiar el producto.", imagePrompt: "Composición horizontal artesanal con el producto real, sombras suaves y materiales cálidos sin texto.", backgroundColor: "#f4ead7", accentColor: "#7a351f", fontStyle: "friendly", buttonStyle: "rounded", boardTexture: "kraft", buttonVariant: "solid", buttonMotion: "lift", cartButtonLabel: "Quiero comprar", contentOrder: ["hero", "products", "gallery", "about", "links"] },
      { title: "Mercado gráfico", rationale: "Una dirección contemporánea con energía comercial y jerarquía clara de compra.", imagePrompt: "Composición horizontal gráfica con el producto real, formas simples y contraste nítido sin texto.", backgroundColor: "#f6c84f", accentColor: "#7f1d1d", fontStyle: "modern", buttonStyle: "pill", boardTexture: "painted", buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", contentOrder: ["hero", "gallery", "products", "links", "about"] },
    ];
    const originalFetch = global.fetch;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ directions }) }] }] }) })
      .mockResolvedValue({ ok: false, json: async () => ({ error: { message: "image generation unavailable in unit test" } }) });

    try {
      const result = await service.generate("merchant_1", "store_1", { assetUrls: ["/v1/uploads/11111111-1111-4111-8111-111111111111.jpg"], businessCategory: "matcha" });
      expect(result.mode).toBe("ai");
      expect(prisma.storeVisualProposal.create.mock.calls.map((call) => call[0].data.title)).toEqual(directions.map((direction) => direction.title));
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config).toEqual(expect.objectContaining({
        backgroundColor: "#f7f5f0",
        accentColor: "#274c43",
        fontStyle: "editorial",
        buttonStyle: "square",
        boardTexture: "painted",
        buttonVariant: "outline",
        buttonMotion: "none",
        cartButtonLabel: "Completar pedido",
        contentOrder: ["hero", "products", "about", "gallery", "links"],
      }));
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.config).not.toHaveProperty("html");
      expect(prisma.storeVisualProposal.create.mock.calls[0][0].data.provider).toBe("openai:gpt-5.6-luna");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
