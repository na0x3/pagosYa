import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateStoreDto } from "./create-store.dto";

describe("CreateStoreDto storefront layout", () => {
  it("accepts every known content section once in a merchant-defined order", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["motion", "gallery", "products", "hero", "about", "links", "contact", "location"],
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", productId: "product_123", caption: "Nuestro taller", boxColor: "#f4ead7" }],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("accepts safe per-section backgrounds and rejects unknown sections or CSS", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      sectionBackgrounds: { products: "#f4ead7", "animation-portada": "#102030" },
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      sectionBackgrounds: { unknown: "red; background:url(https://invalid.test)" },
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts exact AI section ids for ordering and isolated backgrounds", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["site-opening", "animation-window", "site-shop", "site-information"],
      sectionBackgrounds: { "site-shop": "#224466", "animation-window": "#102030" },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("accepts bounded text styles for AI-authored sections and scenes", async () => {
    const section = {
      id: "opening",
      kind: "hero",
      title: "Portada",
      body: "Texto",
      ctaLabel: "Ver",
      layout: "full-bleed",
      width: "full",
      align: "left",
      motion: "reveal",
      backgroundColor: "#102030",
      textColor: "#ffffff",
      titleStyle: { textScale: 130, textAlign: "center", textColor: "#fef4df", fontStyle: "editorial" },
      bodyStyle: { textScale: 90, textAlign: "left", textColor: "#ffffff", fontStyle: "modern" },
      mediaUrls: [],
      items: [{ title: "Escena", body: "Detalle", mediaUrl: null, titleStyle: { textScale: 120, textColor: "#ffffff" } }],
    };
    const valid = plainToInstance(CreateStoreDto, { name: "Taller Norte", siteSections: [section] });
    const invalid = plainToInstance(CreateStoreDto, { name: "Taller Norte", siteSections: [{ ...section, titleStyle: { textScale: 500, textColor: "red" } }] });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("rejects the retired Zoom Parallax animation", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["motion-zoom-parallax", "hero", "products", "about", "gallery", "motion-stagger-testimonials", "links"],
      motionExperiences: ["zoom-parallax", "stagger-testimonials"],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("keeps accepting legacy orders only when motion is the omitted section", async () => {
    const legacy = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["gallery", "products", "hero", "about", "links"],
    });
    const missingAbout = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["motion", "gallery", "products", "hero", "links"],
    });

    await expect(validate(legacy)).resolves.toHaveLength(0);
    expect(await validate(missingAbout)).not.toHaveLength(0);
  });

  it("rejects unsafe editorial card colors", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      editorialGallery: [{
        imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp",
        caption: "Nuestro taller",
        boxColor: "red; background-image: url(https://invalid.test)",
      }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("rejects oversized or unsafe product references on editorial photos", async () => {
    const oversized = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", productId: "p".repeat(81) }],
    });
    const unsafe = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", productId: "producto\u202Eoculto" }],
    });

    expect(await validate(oversized)).not.toHaveLength(0);
    expect(await validate(unsafe)).not.toHaveLength(0);
  });

  it("rejects duplicated/missing sections and invisible caption controls", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["gallery", "products", "products", "about", "links"],
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", caption: "texto\u202Eoculto" }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("accepts safe announcement appearance values and rejects CSS injection", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      announcementSize: "large",
      announcementColor: "#f5d90a",
      announcementFont: "editorial",
      announcementEffect: "wave",
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      announcementSize: "enormous",
      announcementColor: "red; background:url(https://invalid.test)",
      announcementFont: "url(https://invalid.test)",
      announcementEffect: "spin-forever",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts known board textures and rejects arbitrary values", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      boardTexture: "kraft",
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      boardTexture: "url(https://invalid.test)",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts only uploaded-file paths for promotion imagery", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      promotionImageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp",
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      promotionImageUrl: "https://tracking.invalid/promo.webp",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts a safe external lead destination and rejects non-http protocols", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      checkoutMode: "external",
      leadCaptureUrl: "https://taller.example/contacto",
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      checkoutMode: "external",
      leadCaptureUrl: "javascript:alert(1)",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts trusted map embeds and rejects arbitrary iframe destinations", async () => {
    const google = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      locationMapUrl: "https://www.google.com/maps/embed?pb=trusted-map",
      locationDescription: "Visítanos de lunes a sábado.",
      locationHighlight: "A media cuadra de la plaza",
    });
    const openStreetMap = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      locationMapUrl: "https://www.openstreetmap.org/export/embed.html?bbox=-68.2%2C-16.6%2C-68.1%2C-16.4",
    });
    const arbitraryIframe = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      locationMapUrl: "https://tracking.invalid/embed/account-takeover",
    });
    const insecureMap = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      locationMapUrl: "http://www.google.com/maps/embed?pb=insecure",
    });
    const googleLookalike = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      locationMapUrl: "https://maps.google.evil.com/maps/embed?pb=tracking",
    });

    await expect(validate(google)).resolves.toHaveLength(0);
    await expect(validate(openStreetMap)).resolves.toHaveLength(0);
    expect(await validate(arbitraryIframe)).not.toHaveLength(0);
    expect(await validate(insecureMap)).not.toHaveLength(0);
    expect(await validate(googleLookalike)).not.toHaveLength(0);
  });

  it("accepts multiple locations with hours, fulfillment methods, and product stock", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Cocina Norte",
      locations: [
        {
          id: "centro",
          name: "Sucursal Centro",
          address: "Av. Arce 123",
          mapEmbedUrl: "https://www.google.com/maps/embed?pb=centro",
          pickupEnabled: true,
          deliveryEnabled: true,
          openingHours: [{ day: 1, open: "09:00", close: "18:00", closed: false }],
          inventory: [{ paymentLinkId: "link_1", stock: 8 }],
        },
        {
          id: "sur",
          name: "Sucursal Sur",
          pickupEnabled: true,
          deliveryEnabled: false,
          openingHours: [{ day: 0, open: "09:00", close: "18:00", closed: true }],
          inventory: [{ paymentLinkId: "link_1", stock: 0 }],
        },
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("accepts only booleans for the cart recommendation preference", async () => {
    const valid = plainToInstance(CreateStoreDto, { name: "Taller Norte", cartRecommendationsEnabled: false });
    const invalid = plainToInstance(CreateStoreDto, { name: "Taller Norte", cartRecommendationsEnabled: "no" });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts only booleans for customer stock visibility", async () => {
    const valid = plainToInstance(CreateStoreDto, { name: "Taller Norte", showLowStockToCustomers: true });
    const invalid = plainToInstance(CreateStoreDto, { name: "Taller Norte", showLowStockToCustomers: "yes" });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts only booleans for the opt-in animation section", async () => {
    const valid = plainToInstance(CreateStoreDto, { name: "Taller Norte", motionDuoEnabled: true });
    const invalid = plainToInstance(CreateStoreDto, { name: "Taller Norte", motionDuoEnabled: "yes" });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts multiple unique animation templates and rejects duplicates", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      motionExperiences: ["story-scroll", "hero-carousel", "stagger-testimonials", "portfolio-scroller", "circle-reveal", "clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path", "full-screen-chapters", "magnetic-target", "frame-sequence"],
    });
    const duplicated = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      motionExperiences: ["hero-carousel", "hero-carousel"],
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(duplicated)).not.toHaveLength(0);
  });

  it("accepts named animation instances with independent media and dynamic order keys", async () => {
    const imageUrl = "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp";
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [
        { id: "invierno", name: "Colección invierno", type: "hero-carousel", title: "Abrigos", productId: "product_1", textPositionX: 72, textPositionY: 28, textScale: 143, textWidthPercent: 74, textAlign: "right", textSize: "large", textWidth: "wide", textColor: "#fff4d6", backgroundColor: "#26170d", media: [{ imageUrl, title: "Lana", textPositionX: 24, textPositionY: 70, textScale: 110, textWidthPercent: 58, textAlign: "left", textColor: "#ffffff" }] },
        { id: "clientes", name: "Reseñas favoritas", type: "stagger-testimonials", media: [{ imageUrl, caption: "Ana", body: "Me encantó." }] },
      ],
      contentOrder: ["animation-invierno", "hero", "products", "about", "gallery", "animation-clientes", "links"],
    });
    const duplicateId = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [
        { id: "repetida", name: "Una", type: "hero-carousel", media: [] },
        { id: "repetida", name: "Dos", type: "frame-sequence", media: [] },
      ],
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(duplicateId)).not.toHaveLength(0);
  });

  it("rejects the retired 3D gallery animation", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [{ id: "retirada", name: "Galería", type: "3d-gallery", media: [] }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("rejects retired depth and diagonal gallery styles", async () => {
    const coverflowAnimation = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [{ id: "retirada", name: "Galería", type: "coverflow-carousel", media: [] }],
    });
    const coverflowGallery = plainToInstance(CreateStoreDto, { name: "Taller Norte", experienceStyle: "coverflow" });
    const diagonalGallery = plainToInstance(CreateStoreDto, { name: "Taller Norte", experienceStyle: "diagonal-marquee" });

    expect(await validate(coverflowAnimation)).not.toHaveLength(0);
    expect(await validate(coverflowGallery)).not.toHaveLength(0);
    expect(await validate(diagonalGallery)).not.toHaveLength(0);
  });

  it("rejects animation layout values outside the supported position, shape, and color ranges", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [{
        id: "invalida",
        name: "Inválida",
        type: "hero-carousel",
        textPositionX: 101,
        textPositionY: -1,
        textScale: 201,
        textWidthPercent: 19,
        textAlign: "justify",
        textSize: "gigantic",
        textWidth: "edge-to-edge",
        textColor: "white",
        backgroundColor: "#12345",
        media: [],
      }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("rejects invalid per-scene text box layout values", async () => {
    const imageUrl = "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp";
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [{
        id: "escenas",
        name: "Escenas",
        type: "hero-carousel",
        media: [{ imageUrl, title: "Texto", textPositionX: 104, textScale: 20, textAlign: "justify", textColor: "white" }],
      }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("accepts multiple independently styled titles and subtitles per animation", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [{
        id: "editorial",
        name: "Apertura editorial",
        type: "hero-carousel",
        fontStyle: "classic",
        textBlocks: [
          { id: "title-1", role: "title", text: "Primera historia", textPositionX: 18, textPositionY: 30, textScale: 130, textWidthPercent: 62, textAlign: "left", textColor: "#fff4d6", fontStyle: "editorial" },
          { id: "subtitle-1", role: "subtitle", text: "Otro punto de vista", textPositionX: 54, textPositionY: 66, textScale: 82, textWidthPercent: 45, textAlign: "center", textColor: "#ffffff", fontStyle: "modern" },
        ],
        media: [],
      }],
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [{
        id: "editorial",
        name: "Apertura editorial",
        type: "hero-carousel",
        textBlocks: [{ id: "bad id", role: "caption", text: "Texto", textScale: 300, fontStyle: "comic" }],
        media: [],
      }],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("rejects an animation product reference longer than the product id limit", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [{ id: "destacada", name: "Destacada", type: "circle-reveal", productId: "p".repeat(81), media: [] }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("does not impose a store-wide limit on independent animation sections", async () => {
    const animations = Array.from({ length: 16 }, (_, index) => ({
      id: `seccion-${index + 1}`,
      name: `Sección ${index + 1}`,
      type: index % 2 ? "story-scroll" : "hero-carousel",
      media: [],
    }));
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations,
      contentOrder: ["hero", "products", "about", "gallery", ...animations.map((animation) => `animation-${animation.id}`), "links"],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("allows merchants to reuse an animation type after AI generation", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      animations: [
        { id: "historia-uno", name: "Historia uno", type: "story-scroll", media: [] },
        { id: "historia-dos", name: "Historia dos", type: "story-scroll", media: [] },
      ],
      contentOrder: ["hero", "animation-historia-uno", "products", "animation-historia-dos", "about", "gallery", "links"],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

});
