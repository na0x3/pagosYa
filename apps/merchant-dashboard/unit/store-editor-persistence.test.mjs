import assert from "node:assert/strict";
import test from "node:test";
import { storeSettingsPayloadFromSnapshot } from "../src/store-editor/persistence.js";
import { createStoreEditorStore } from "../src/store-editor/state.js";

function snapshot(overrides = {}) {
  return {
    storeName: "Tienda Uno",
    tagline: "  Hecho en Bolivia  ",
    logoUrl: null,
    bannerUrl: "/uploads/banner.webp",
    backgroundColor: "#f8fafc",
    contactPhone: "+59170000000",
    contactEmail: "ventas@example.com",
    contactFormEnabled: true,
    contactTitle: "Contacto",
    contactSubtitle: "Escríbenos",
    contactFormEmail: "formularios@example.com",
    locations: [{ id: "principal", mapEmbedUrl: "https://maps.example/embed", highlight: "Centro", description: "Primer piso" }],
    locationTitle: "Visítanos",
    locationSubtitle: "La Paz",
    aboutText: "Historia",
    aboutTitle: "Nosotros",
    aboutSubtitle: "Desde 2020",
    aboutImageUrl: null,
    catalogTitle: "Productos",
    catalogSubtitle: "Elegidos",
    galleryTitle: "Galería",
    gallerySubtitle: "Ideas",
    linksTitle: "Enlaces",
    announcement: "Oferta",
    announcementMode: "static",
    announcementSpeed: 18,
    announcementSize: "small",
    announcementColor: "#ffffff",
    announcementFont: "store",
    announcementEffect: "none",
    promotionEnabled: false,
    promotionImageUrl: null,
    promotionTitle: null,
    promotionBody: null,
    promotionCtaLabel: null,
    promotionCtaUrl: null,
    heroSlides: [{ imageUrl: "/uploads/hero.webp", title: "  Portada  ", body: "", ctaLabel: "Ver", ctaUrl: "/catalogo" }],
    siteDocument: {
      artDirection: "cinematic-atelier",
      designGenome: { composition: "gallery-axis" },
      pages: [{ id: " historia ", label: " Historia ", slug: "Nuestra Historia" }],
      navigation: {
        layout: "brand-left", barStyle: "square", brandPosition: "center", navPosition: "left",
        searchPosition: "right", profilePosition: "right", cartPosition: "left",
        brandStyle: { textOffsetX: -24, textOffsetY: 8, textOffsetBasis: "element" },
        taglineStyle: { textOffsetX: 4, textOffsetY: 12, textOffsetBasis: "element" },
        sticky: true, transparent: false, logoTreatment: "wordmark",
        items: [{ id: "home", label: "Inicio", target: "home", style: { textOffsetX: 10, textOffsetY: 0, textOffsetBasis: "element" } }],
      },
      footer: { enabled: true, brandDescription: "Marca", columns: [], copyright: "Derechos", badge: "Bolivia" },
      sections: [{
        id: "story", kind: "story", title: "Historia", body: "Cuerpo", ctaLabel: "Leer", layout: "split", width: "wide", align: "left", motion: "none",
        heightPx: 640, mobileHeightPx: 460,
        backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: [], items: [],
        blocks: [{ id: "heading", kind: "heading", slot: "heading", role: "primary", text: "Título", mediaUrl: null, children: [] }],
      }, {
        id: "page-products", pageId: "historia", kind: "catalog", productIds: ["product_1", "product_2", "product_1"], title: "Selección", body: "Productos elegidos", ctaLabel: "", layout: "grid", width: "full", align: "left", motion: "none",
        backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: [], items: [], blocks: [],
      }],
    },
    contentOrder: ["site-story"],
    sectionBackgrounds: {},
    experienceStyle: "editorial-grid",
    motionDuoEnabled: false,
    motionExperience: "clarity-marquee",
    motionExperiences: [],
    animations: [],
    editorialGallery: [{ imageUrl: "/uploads/gallery.webp", title: "  Foto  ", caption: "", body: "", boxColor: "#ffffff" }],
    layoutStyle: "cinematic",
    accentColor: null,
    fontStyle: "modern",
    buttonStyle: "rounded",
    buttonVariant: "solid",
    buttonMotion: "lift",
    cartButtonLabel: "Ir a pagar",
    checkoutMode: "payment",
    leadCaptureUrl: null,
    cartRecommendationsEnabled: true,
    cartRecommendationProductIds: ["product_1"],
    showLowStockToCustomers: false,
    links: [{ label: "Instagram", url: "https://instagram.com/example" }],
    ...overrides,
  };
}

test("serializes the canonical snapshot into the settings API contract", () => {
  const payload = storeSettingsPayloadFromSnapshot(snapshot());

  assert.equal(payload.name, "Tienda Uno");
  assert.equal(payload.tagline, "Hecho en Bolivia");
  assert.equal(payload.contactFormEmail, "formularios@example.com");
  assert.deepEqual(payload.heroSlides[0], { imageUrl: "/uploads/hero.webp", title: "Portada", ctaLabel: "Ver", ctaUrl: "/catalogo" });
  assert.equal(payload.siteSections[0].family, "cinematic");
  assert.equal(payload.siteSections[0].heightPx, 640);
  assert.equal(payload.siteSections[0].mobileHeightPx, 460);
  assert.equal(payload.siteSections[0].blocks[0].text, "Título");
  assert.deepEqual(payload.siteSections[1].productIds, ["product_1", "product_2"]);
  assert.deepEqual(payload.sitePages[0], { id: "historia", label: "Historia", slug: "nuestra-historia" });
  assert.deepEqual(payload.siteNavigation, {
    layout: "brand-left",
    barStyle: "full",
    brandPosition: "center",
    navPosition: "left",
    searchPosition: "right",
    profilePosition: "right",
    cartPosition: "left",
    brandStyle: { textOffsetX: -24, textOffsetY: 8, textOffsetBasis: "element" },
    taglineStyle: { textOffsetX: 4, textOffsetY: 12, textOffsetBasis: "element" },
    sticky: true,
    transparent: false,
    logoTreatment: "wordmark",
  });
  assert.deepEqual(payload.siteNavigationItems[0].style, { textOffsetX: 10, textOffsetY: 0, textOffsetBasis: "element" });
  assert.deepEqual(payload.editorialGallery[0], { imageUrl: "/uploads/gallery.webp", title: "Foto", boxColor: "#ffffff" });
});

test("save serialization stays pinned to the captured revision", () => {
  const editor = createStoreEditorStore();
  editor.hydrate("store_1", snapshot({ storeName: "Original" }));
  editor.replaceDraft("store_1", snapshot({ storeName: "First edit", contactFormEmail: "first@example.com" }));
  const operation = editor.beginSave();
  assert.ok(operation);

  editor.replaceDraft("store_1", snapshot({ storeName: "Newest edit", contactFormEmail: "newest@example.com" }));
  const payload = storeSettingsPayloadFromSnapshot(operation.snapshot);

  assert.equal(payload.name, "First edit");
  assert.equal(payload.contactFormEmail, "first@example.com");
  assert.equal(editor.getState().snapshot.storeName, "Newest edit");
});

test("refuses to serialize an unhydrated editor", () => {
  assert.throws(() => storeSettingsPayloadFromSnapshot(null), /borrador de tienda/);
});
