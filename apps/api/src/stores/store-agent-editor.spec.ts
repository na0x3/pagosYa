import type { StoreSiteDocument } from "./site-document";
import { applyStoreAgentEditorOperations, applyStoreAgentProposalVisualOperations, type StoreAgentEditorOperation } from "./store-agent-editor";

const operation = (value: Partial<StoreAgentEditorOperation>): StoreAgentEditorOperation => ({
  action: "set",
  entity: "theme",
  targetId: "",
  parentId: "",
  field: "",
  value: "",
  secondaryValue: "",
  position: -1,
  ...value,
});

function documentFixture(): StoreSiteDocument {
  return {
    version: 1,
    direction: "Editorial",
    artDirection: "editorial-house",
    designGenome: { composition: "editorial-split", rhythm: "balanced", geometry: "soft", colorStrategy: "accent-led", mediaStrategy: "natural", typeScale: "balanced", motionLanguage: "still" },
    theme: { pageBackground: "#ffffff", textColor: "#111111", accentColor: "#bb5500", secondaryColor: "#225566", surfaceColor: "#f5f5f5", mutedColor: "#666666", borderColor: "#dddddd", headingFont: "editorial", bodyFont: "grotesk", radius: 0, shadow: "none", productLayout: "editorial", displayScale: "dramatic", density: "airy", imageTreatment: "editorial" },
    navigation: { layout: "split", barStyle: "floating", sticky: false, transparent: false, logoTreatment: "wordmark", items: [{ id: "home", label: "Inicio", target: "home" }] },
    pages: [{ id: "story-page", label: "Historia", slug: "historia" }],
    footer: {
      enabled: true,
      brandDescription: "Hecho con calma.",
      columns: [{ id: "company", title: "Nueva columna", items: [{ id: "new-link", label: "Nuevo enlace", href: "" }] }],
      copyright: "© Taller",
      badge: "Hecho en Bolivia",
      newsletter: { enabled: true, title: "Novedades", body: "Noticias", buttonLabel: "Suscribirme", successMessage: "Gracias" },
    },
    motion: { intensity: "restrained" },
    merchandising: { featuredProductIds: ["product-1"], productOrderIds: ["product-1", "product-2"], spotlightLayout: "feature-first", showDescriptions: true, collectionMenuStyle: "tabs", collections: [{ id: "favorites", name: "Favoritos", productIds: ["product-1"] }] },
    experience: { type: "text-reveal-block", placement: "after-catalog", title: "Ritual", body: "Historia visual", mediaUrls: [] },
    sections: [
      { id: "opening", kind: "hero", family: "editorial", layout: "split", width: "wide", align: "left", motion: "reveal", title: "Taller", body: "Objetos honestos", ctaLabel: "Comprar", backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: ["/v1/uploads/hero.jpg"], items: [], blocks: [{ id: "heading", kind: "heading", slot: "heading", role: "primary", text: "Taller", mediaUrl: null, children: [] }] },
      { id: "catalog", kind: "catalog", family: "product-led", layout: "grid", width: "full", align: "left", motion: "none", title: "Colección", body: "", ctaLabel: "", backgroundColor: "#f5f5f5", textColor: "#111111", mediaUrls: [], items: [], productIds: ["product-1", "product-2"] },
      { id: "story", kind: "story", family: "editorial", layout: "offset", width: "wide", align: "left", motion: "reveal", title: "Nuestra historia", body: "Desde 2020", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: [], items: [] },
      { id: "contact", kind: "contact", family: "minimal", layout: "split", width: "wide", align: "left", motion: "none", title: "Contacto", body: "Escríbenos", ctaLabel: "Enviar", backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: [], items: [] },
    ],
  };
}

describe("store agent editor operation boundary", () => {
  const products = new Set(["product-1", "product-2"]);
  const media = new Set(["/v1/uploads/new.jpg"]);

  it("centers a header using its supported layout while rejecting invented tab layouts atomically", () => {
    const source = documentFixture();
    const before = structuredClone(source);
    const result = applyStoreAgentEditorOperations(source, [
      operation({ entity: "navigation", field: "layout", value: "centered" }),
      operation({ entity: "navigation", field: "navPosition", value: "center" }),
    ]);
    expect(result.document.navigation).toMatchObject({ layout: "centered", navPosition: "center" });
    expect(() => applyStoreAgentEditorOperations(source, [
      operation({ entity: "navigation", field: "layout", value: "centered" }),
      operation({ entity: "navigation", field: "layout", value: "animated-tabs" }),
    ])).toThrow("encabezado");
    expect(source).toEqual(before);
  });

  it("rejects an oversized edit as a whole instead of silently dropping its last step", () => {
    const source = documentFixture();
    const before = structuredClone(source);
    const operations = Array.from({ length: 13 }, (_, index) => operation({
      entity: "section", targetId: "story", field: "title", value: `Título ${index + 1}`,
    }));
    expect(() => applyStoreAgentEditorOperations(source, operations)).toThrow("13 pasos");
    expect(source).toEqual(before);

    const config = { announcement: "Original" };
    expect(() => applyStoreAgentProposalVisualOperations(config, operations.map((item) => ({
      ...item, entity: "visual-setting", field: "announcement",
    })))).toThrow("13 pasos");
    expect(config).toEqual({ announcement: "Original" });
  });

  it("covers every global website design surface with bounded set operations", () => {
    const result = applyStoreAgentEditorOperations(documentFixture(), [
      operation({ entity: "art-direction", field: "value", value: "quiet-gallery" }),
      operation({ entity: "design-genome", field: "composition", value: "quiet-monument" }),
      operation({ entity: "theme", field: "accentColor", value: "#123456" }),
      operation({ entity: "navigation", field: "sticky", value: "sí" }),
      operation({ entity: "footer", field: "brandDescription", value: "Una marca del sur." }),
      operation({ entity: "newsletter", field: "buttonLabel", value: "Quiero recibirlas" }),
      operation({ entity: "motion", field: "intensity", value: "cinematic" }),
      operation({ entity: "merchandising", field: "productOrderIds", value: "product-2,product-1" }),
      operation({ entity: "experience", field: "placement", value: "after-story" }),
      operation({ entity: "section", targetId: "opening", field: "layout", value: "full-bleed" }),
      operation({ entity: "section", targetId: "opening", field: "heightPx", value: "760" }),
      operation({ entity: "footer-link", targetId: "Nuevo enlace", field: "href", value: "https://pagosya.bo" }),
    ], { allowedProductIds: products, allowedMediaUrls: media });

    expect(result.document).toEqual(expect.objectContaining({ artDirection: "quiet-gallery" }));
    expect(result.document.designGenome.composition).toBe("quiet-monument");
    expect(result.document.theme.accentColor).toBe("#123456");
    expect(result.document.navigation.sticky).toBe(true);
    expect(result.document.footer?.brandDescription).toBe("Una marca del sur.");
    expect(result.document.footer?.newsletter?.buttonLabel).toBe("Quiero recibirlas");
    expect(result.document.footer?.columns[0].items[0].href).toBe("https://pagosya.bo");
    expect(result.document.motion.intensity).toBe("cinematic");
    expect(result.document.merchandising.productOrderIds).toEqual(["product-2", "product-1"]);
    expect(result.document.experience.placement).toBe("after-story");
    expect(result.document.sections[0]).toEqual(expect.objectContaining({ layout: "full-bleed", heightPx: 760 }));
  });

  it("can create and edit pages, navigation, sections, items, blocks, media, footer structure, and collections", () => {
    const first = applyStoreAgentEditorOperations(documentFixture(), [
      operation({ action: "add", entity: "page", targetId: "care", value: "Cuidados", secondaryValue: "cuidados" }),
      operation({ action: "add", entity: "section", targetId: "care-guide", parentId: "care", field: "story", value: "Cómo cuidar tus piezas" }),
      operation({ action: "add", entity: "navigation-item", targetId: "nav-catalog", value: "Comprar", secondaryValue: "catalog" }),
      operation({ action: "add", entity: "section-item", parentId: "story", value: "Primer capítulo", secondaryValue: "El inicio" }),
      operation({ action: "add", entity: "section-block", parentId: "story", targetId: "story-note", field: "text", value: "Hecho a mano" }),
      operation({ action: "add", entity: "section-media", parentId: "story", value: "/v1/uploads/new.jpg" }),
      operation({ action: "add", entity: "footer-column", targetId: "support", value: "Ayuda" }),
      operation({ action: "add", entity: "footer-link", parentId: "support", targetId: "contact-link", value: "Contacto", secondaryValue: "/contacto" }),
      operation({ action: "add", entity: "collection", targetId: "new-season", value: "Nueva temporada" }),
      operation({ entity: "collection", targetId: "new-season", field: "productIds", value: "product-2" }),
    ], { allowedProductIds: products, allowedMediaUrls: media });

    expect(first.document.pages).toContainEqual({ id: "care", label: "Cuidados", slug: "cuidados" });
    expect(first.document.sections).toContainEqual(expect.objectContaining({ id: "care-guide", pageId: "care", kind: "story" }));
    expect(first.document.navigation.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "nav-catalog", target: "catalog" })]));
    expect(first.document.sections.find((section) => section.id === "story")?.items?.[0]).toEqual(expect.objectContaining({ title: "Primer capítulo" }));
    expect(first.document.sections.find((section) => section.id === "story")?.blocks?.[0]).toEqual(expect.objectContaining({ id: "story-note", text: "Hecho a mano" }));
    expect(first.document.sections.find((section) => section.id === "story")?.mediaUrls).toContain("/v1/uploads/new.jpg");
    expect(first.document.footer?.columns.find((column) => column.id === "support")?.items[0]).toEqual(expect.objectContaining({ label: "Contacto", href: "/contacto" }));
    expect(first.document.merchandising.collections).toContainEqual({ id: "new-season", name: "Nueva temporada", productIds: ["product-2"] });

    const second = applyStoreAgentEditorOperations(first.document, [
      operation({ entity: "page", targetId: "care", field: "label", value: "Guía de cuidados" }),
      operation({ action: "move", entity: "navigation-item", targetId: "nav-catalog", position: 0 }),
      operation({ action: "duplicate", entity: "section", targetId: "story", secondaryValue: "story-copy" }),
      operation({ entity: "section-item", parentId: "story", targetId: "0", field: "body", value: "Un comienzo paciente" }),
      operation({ entity: "section-block", parentId: "story", targetId: "story-note", field: "textColor", value: "#654321" }),
      operation({ action: "set", entity: "section-media", parentId: "opening", position: 0, value: "/v1/uploads/new.jpg" }),
      operation({ action: "move", entity: "footer-column", targetId: "support", position: 0 }),
      operation({ entity: "footer-column", targetId: "support", field: "title", value: "Soporte" }),
      operation({ entity: "footer-link", targetId: "contact-link", field: "label", value: "Habla con nosotros" }),
      operation({ action: "move", entity: "collection", targetId: "new-season", position: 0 }),
    ], { allowedProductIds: products, allowedMediaUrls: media });

    expect(second.document.pages?.find((page) => page.id === "care")?.label).toBe("Guía de cuidados");
    expect(second.document.navigation.items?.[0].id).toBe("nav-catalog");
    expect(second.document.sections).toContainEqual(expect.objectContaining({ id: "story-copy" }));
    expect(second.document.sections.find((section) => section.id === "story")?.items?.[0].body).toBe("Un comienzo paciente");
    expect(second.document.sections.find((section) => section.id === "story")?.blocks?.[0].style?.textColor).toBe("#654321");
    expect(second.document.sections.find((section) => section.id === "opening")?.mediaUrls).toEqual(["/v1/uploads/new.jpg"]);
    expect(second.document.footer?.columns[0]).toEqual(expect.objectContaining({ id: "support", title: "Soporte" }));
    expect(second.document.footer?.columns[0].items[0].label).toBe("Habla con nosotros");
  });

  it("rejects invented media, foreign products, unsafe links, and protected-section deletion", () => {
    expect(() => applyStoreAgentEditorOperations(documentFixture(), [
      operation({ action: "add", entity: "section-media", parentId: "story", value: "https://attacker.example/image.jpg" }),
    ], { allowedProductIds: products })).toThrow("sólo puede usar imágenes");

    expect(() => applyStoreAgentEditorOperations(documentFixture(), [
      operation({ entity: "collection", targetId: "favorites", field: "productIds", value: "foreign-product" }),
    ], { allowedProductIds: products })).toThrow("no pertenece a esta tienda");

    expect(() => applyStoreAgentEditorOperations(documentFixture(), [
      operation({ entity: "footer-link", targetId: "new-link", field: "href", value: "javascript:alert(1)" }),
    ])).toThrow("destino seguro");

    expect(() => applyStoreAgentEditorOperations(documentFixture(), [
      operation({ action: "remove", entity: "section", targetId: "opening" }),
    ])).toThrow("se protegen");
  });

  it("covers announcement, promotion, content order, hero slides, editorial images, and standalone animation editing", () => {
    const source = {
      announcement: "Antes",
      promotionEnabled: false,
      contentOrder: ["hero", "products", "animation-existing", "about"],
      heroSlides: [{ imageUrl: "/v1/uploads/hero.jpg", title: "Anterior" }],
      editorialGallery: [],
      animations: [{ id: "existing", name: "Movimiento actual", type: "text-rotate", title: "Antes", media: [], textBlocks: [] }],
    };
    const result = applyStoreAgentProposalVisualOperations(source, [
      operation({ entity: "visual-setting", field: "announcement", value: "Envío gratis hoy" }),
      operation({ entity: "visual-setting", field: "announcementMode", value: "marquee" }),
      operation({ entity: "visual-setting", field: "promotionEnabled", value: "sí" }),
      operation({ action: "move", entity: "content-order", targetId: "about", position: 1 }),
      operation({ action: "add", entity: "hero-slide", value: "/v1/uploads/new.jpg", secondaryValue: "Nueva colección" }),
      operation({ action: "add", entity: "editorial-image", value: "/v1/uploads/new.jpg" }),
      operation({ action: "add", entity: "animation", targetId: "new-motion", field: "layered-text", value: "Relato en capas" }),
      operation({ action: "add", entity: "animation-text", parentId: "existing", targetId: "note", field: "subtitle", value: "Texto adicional" }),
      operation({ action: "add", entity: "animation-media", parentId: "existing", value: "/v1/uploads/new.jpg" }),
      operation({ entity: "animation", targetId: "existing", field: "backgroundColor", value: "#123456" }),
    ], { allowedProductIds: products, allowedMediaUrls: new Set(["/v1/uploads/new.jpg"]) });

    expect(result.config).toEqual(expect.objectContaining({
      announcement: "Envío gratis hoy",
      announcementMode: "marquee",
      promotionEnabled: true,
      contentOrder: ["hero", "about", "products", "animation-existing", "animation-new-motion"],
      motionDuoEnabled: true,
      motionExperiences: ["text-rotate", "layered-text"],
    }));
    expect((result.config.heroSlides as any[])[1]).toEqual(expect.objectContaining({ imageUrl: "/v1/uploads/new.jpg", title: "Nueva colección" }));
    expect((result.config.editorialGallery as any[])[0]).toEqual({ imageUrl: "/v1/uploads/new.jpg" });
    const animations = result.config.animations as any[];
    expect(animations.find((entry) => entry.id === "existing")).toEqual(expect.objectContaining({
      backgroundColor: "#123456",
      textBlocks: [expect.objectContaining({ id: "note", role: "subtitle", text: "Texto adicional" })],
      media: [{ imageUrl: "/v1/uploads/new.jpg" }],
    }));
    expect(animations.find((entry) => entry.id === "new-motion")).toEqual(expect.objectContaining({ type: "layered-text", name: "Relato en capas" }));
  });

  it("keeps proposal-level media and product bindings inside the merchant allowlists", () => {
    expect(() => applyStoreAgentProposalVisualOperations({ heroSlides: [], editorialGallery: [], animations: [], contentOrder: [] }, [
      operation({ action: "add", entity: "hero-slide", value: "https://attacker.example/image.jpg" }),
    ])).toThrow("sólo puede usar imágenes");

    expect(() => applyStoreAgentProposalVisualOperations({ heroSlides: [], editorialGallery: [{ imageUrl: "/v1/uploads/hero.jpg" }], animations: [], contentOrder: [] }, [
      operation({ entity: "editorial-image", targetId: "0", field: "productId", value: "foreign-product" }),
    ], { allowedProductIds: products })).toThrow("no pertenece a esta tienda");
  });
});
