import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_DESIGN_GENOME, SITE_SECTION_CAPABILITIES, resolveSiteSectionFamily, siteSectionSupportsCapability } from "@pagosya/shared-types";
import { sanitizeSiteDocument, synchronizeSiteDocument } from "../src/site-document";

function documentFixture() {
  const section = (id: string, kind: string, mediaUrls: string[] = [], eventId?: string) => ({
    id, kind, layout: "split", width: "wide", align: "left", motion: "none",
    title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls, items: [],
    ...(eventId ? { eventId } : {}),
  });
  return {
    version: 1,
    direction: "Editorial propio",
    theme: {
      pageBackground: "#f5f2ea", textColor: "#171717", accentColor: "#315c49", secondaryColor: "#c9a86a",
      surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4", headingFont: "editorial", bodyFont: "grotesk",
      radius: 8, shadow: "soft", productLayout: "editorial",
    },
    navigation: { layout: "centered", sticky: true, transparent: false },
    sections: [
      section("opening", "hero", ["/v1/uploads/hero.webp"]),
      section("story", "story"),
      section("shop", "catalog"),
      section("information", "contact"),
    ],
  };
}

describe("sanitizeSiteDocument", () => {
  it("keeps a complete document while stripping non-owned media URLs", () => {
    const fixture = documentFixture();
    fixture.sections[0].mediaUrls.push("https://attacker.invalid/image.jpg");
    const document = sanitizeSiteDocument(fixture);
    expect(document?.sections[0].mediaUrls).toEqual(["/v1/uploads/hero.webp"]);
    expect(document?.sections.map((section) => section.kind)).toEqual(["hero", "story", "catalog", "contact"]);
    expect(document?.theme.displayScale).toBe("balanced");
    expect(document?.navigation.logoTreatment).toBe("wordmark");
    expect(document?.motion.intensity).toBe("restrained");
    expect(document?.designGenome).toEqual(DEFAULT_SITE_DESIGN_GENOME);
    expect(document?.sections.every((section) => section.family === "editorial")).toBe(true);
    expect(document?.sections[0].blocks?.map((block) => [block.id, block.slot, block.kind])).toEqual([
      ["heading", "heading", "heading"],
      ["body", "body", "text"],
      ["media-1", "primary-media", "media"],
    ]);
    expect(document?.sections[2].blocks?.at(-1)).toMatchObject({ id: "commerce", kind: "commerce", slot: "products" });
  });

  it("keeps advanced art direction, safe motion and product merchandising", () => {
    const fixture = {
      ...documentFixture(),
      artDirection: "cinematic-atelier",
      theme: { ...documentFixture().theme, displayScale: "monumental", density: "airy", imageTreatment: "cinematic" },
      navigation: { ...documentFixture().navigation, logoTreatment: "seal" },
      motion: { intensity: "cinematic" },
      designGenome: {
        composition: "gallery-axis",
        rhythm: "cinematic",
        geometry: "framed",
        colorStrategy: "contrast-blocks",
        mediaStrategy: "collage",
        typeScale: "poster",
        motionLanguage: "cinematic",
      },
      merchandising: {
        featuredProductIds: ["product_matcha", "product_matcha", "<unsafe>"],
        productOrderIds: ["product_latte", "product_matcha"],
        spotlightLayout: "lookbook",
        showDescriptions: false,
      },
      experience: {
        type: "scroll-expansion",
        placement: "after-story",
        title: "La imagen se abre",
        body: "Una transición entre historia y colección.",
        mediaUrls: ["/v1/uploads/window-a.webp", "/v1/uploads/window-b.webp", "https://unsafe.invalid/image.jpg"],
      },
      sections: documentFixture().sections.map((section, index) => ({ ...section, motion: index === 1 ? "story-scroll" : section.motion })),
    };
    const document = sanitizeSiteDocument(fixture);
    expect(document?.theme).toEqual(expect.objectContaining({ displayScale: "monumental", density: "airy", imageTreatment: "cinematic" }));
    expect(document?.navigation.logoTreatment).toBe("seal");
    expect(document?.motion.intensity).toBe("cinematic");
    expect(document?.artDirection).toBe("cinematic-atelier");
    expect(document?.designGenome).toEqual(fixture.designGenome);
    expect(document?.merchandising).toEqual({
      featuredProductIds: ["product_matcha"],
      productOrderIds: ["product_latte", "product_matcha"],
      spotlightLayout: "lookbook",
      showDescriptions: false,
    });
    expect(document?.experience).toEqual({
      type: "scroll-expansion",
      placement: "after-story",
      title: "La imagen se abre",
      body: "Una transición entre historia y colección.",
      mediaUrls: ["/v1/uploads/window-a.webp", "/v1/uploads/window-b.webp"],
    });
    expect(document?.sections[1].motion).toBe("story-scroll");
  });

  it("keeps editable header navigation and a bounded structured footer", () => {
    const fixture: any = documentFixture();
    fixture.navigation.items = [
      { id: "home", label: "Inicio", target: "home" },
      { id: "story-link", label: "Nuestra historia", target: "section", sectionId: "story" },
      { id: "missing", label: "No existe", target: "section", sectionId: "unknown" },
    ];
    fixture.footer = {
      enabled: true,
      brandDescription: "Hecho en Bolivia.",
      columns: [{
        id: "visit",
        title: "Visítanos",
        items: [
          { id: "address", label: "La Paz", href: "" },
          { id: "email", label: "hola@example.com", href: "mailto:hola@example.com" },
          { id: "unsafe", label: "No ejecutar", href: "javascript:alert(1)" },
        ],
      }],
      copyright: "© 2026 Mi tienda",
      badge: "Tienda impulsada por pagosYa",
    };

    const document = sanitizeSiteDocument(fixture);

    expect(document?.navigation.items).toEqual([
      { id: "home", label: "Inicio", target: "home" },
      { id: "story-link", label: "Nuestra historia", target: "section", sectionId: "story" },
    ]);
    expect(document?.footer).toMatchObject({
      enabled: true,
      brandDescription: "Hecho en Bolivia.",
      copyright: "© 2026 Mi tienda",
      badge: "Tienda impulsada por pagosYa",
    });
    expect(document?.footer?.columns[0].items.map((item) => item.href)).toEqual(["", "mailto:hola@example.com", ""]);
  });

  it("keeps real storefront pages, their navigation, section ownership, and newsletter copy", () => {
    const fixture: any = documentFixture();
    fixture.pages = [
      { id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" },
      { id: "duplicate", label: "Duplicada", slug: "nuestra-historia" },
    ];
    fixture.sections[1].pageId = "story-page";
    fixture.navigation.items = [
      { id: "home", label: "Inicio", target: "home" },
      { id: "story-nav", label: "Nuestra historia", target: "page", pageId: "story-page" },
      { id: "missing-page", label: "No existe", target: "page", pageId: "unknown" },
    ];
    fixture.footer = {
      enabled: true,
      columns: [],
      newsletter: {
        enabled: true,
        title: "Cartas desde el taller",
        body: "Historias y lanzamientos sin ruido.",
        buttonLabel: "Suscribirme",
        successMessage: "Ya estás dentro.",
      },
    };

    const document = sanitizeSiteDocument(fixture);

    expect(document?.pages).toEqual([
      { id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" },
    ]);
    expect(document?.sections[1].pageId).toBe("story-page");
    expect(document?.navigation.items).toEqual([
      { id: "home", label: "Inicio", target: "home" },
      { id: "story-nav", label: "Nuestra historia", target: "page", pageId: "story-page" },
    ]);
    expect(document?.footer?.newsletter).toEqual({
      enabled: true,
      title: "Cartas desde el taller",
      body: "Historias y lanzamientos sin ruido.",
      buttonLabel: "Suscribirme",
      successMessage: "Ya estás dentro.",
    });
  });

  it("drops an unknown art direction without rejecting a safe legacy document", () => {
    const document = sanitizeSiteDocument({ ...documentFixture(), artDirection: "arbitrary-css-world" });
    expect(document).not.toBeNull();
    expect(document?.artDirection).toBeUndefined();
  });

  it("repairs unsafe genome values without rejecting a legacy document", () => {
    const document = sanitizeSiteDocument({
      ...documentFixture(),
      designGenome: { composition: "<script>", rhythm: "cinematic", geometry: "unknown" },
    });

    expect(document?.designGenome).toEqual({
      ...DEFAULT_SITE_DESIGN_GENOME,
      rhythm: "cinematic",
    });
  });

  it("publishes compatible renderer families beside slots, layouts and motion", () => {
    expect(SITE_SECTION_CAPABILITIES.hero.slots).toContain("primary-media");
    expect(SITE_SECTION_CAPABILITIES.catalog.slots).toContain("products");
    expect(SITE_SECTION_CAPABILITIES.gallery.families).toEqual(["editorial", "cinematic", "product-led", "minimal"]);
    expect(siteSectionSupportsCapability("story", "stacked", "story-scroll", undefined, "cinematic")).toBe(true);
    expect(siteSectionSupportsCapability("contact", "rail", "parallax")).toBe(false);
    expect(resolveSiteSectionFamily("gallery", undefined, { ...DEFAULT_SITE_DESIGN_GENOME, composition: "gallery-axis" })).toBe("cinematic");
  });

  it("keeps an explicit section family and rejects an unknown one", () => {
    const fixture: any = documentFixture();
    fixture.sections[0].family = "product-led";
    expect(sanitizeSiteDocument(fixture)?.sections[0].family).toBe("product-led");
    fixture.sections[0].family = "floating-cards";
    expect(sanitizeSiteDocument(fixture)).toBeNull();
  });

  it("keeps a bounded nested block tree in registered section slots", () => {
    const fixture: any = documentFixture();
    fixture.sections[1].blocks = [{
      id: "chapter-custom",
      kind: "group",
      slot: "chapters",
      role: "primary",
      text: "",
      mediaUrl: null,
      children: [
        { id: "chapter-custom-heading", kind: "heading", slot: "chapters", role: "secondary", text: "Un capítulo propio", mediaUrl: null, style: { textScale: 115 }, children: [] },
        { id: "chapter-custom-media", kind: "media", slot: "chapters", role: "primary", text: "", mediaUrl: "/v1/uploads/chapter.webp", children: [] },
      ],
    }];

    const document = sanitizeSiteDocument(fixture);

    expect(document?.sections[1].blocks?.[0]).toMatchObject({ id: "chapter-custom", slot: "chapters" });
    expect(document?.sections[1].blocks?.[0].children).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chapter-custom-heading", text: "Un capítulo propio", style: { textScale: 115 } }),
      expect.objectContaining({ id: "chapter-custom-media", mediaUrl: "/v1/uploads/chapter.webp" }),
    ]));
  });

  it("rejects block trees that escape their registered slots or nesting depth", () => {
    const wrongSlot: any = documentFixture();
    wrongSlot.sections[0].blocks = [{ id: "bad", kind: "text", slot: "products", role: "primary", text: "No", mediaUrl: null, children: [] }];
    expect(sanitizeSiteDocument(wrongSlot)).toBeNull();

    const tooDeep: any = documentFixture();
    tooDeep.sections[1].blocks = [{
      id: "outer", kind: "group", slot: "chapters", role: "primary", text: "", mediaUrl: null,
      children: [{ id: "inner", kind: "group", slot: "chapters", role: "primary", text: "", mediaUrl: null, children: [] }],
    }];
    expect(sanitizeSiteDocument(tooDeep)).toBeNull();
  });

  it("turns retired moving marquees into static galleries", () => {
    const fixture = documentFixture();
    fixture.sections[1] = { ...fixture.sections[1], kind: "gallery", motion: "marquee" };

    const document = sanitizeSiteDocument(fixture);

    expect(document?.sections[1].kind).toBe("gallery");
    expect(document?.sections[1].motion).toBe("none");
  });

  it("retires saved coverflow sections and signature experiences", () => {
    const fixture = {
      ...documentFixture(),
      experience: {
        type: "coverflow-carousel",
        placement: "after-catalog",
        title: "Galería antigua",
        body: "Ya no debe moverse.",
        mediaUrls: ["/v1/uploads/uno.webp", "/v1/uploads/dos.webp"],
      },
      sections: documentFixture().sections.map((section, index) => ({
        ...section,
        motion: index === 1 ? "coverflow" : section.motion,
      })),
    };

    const document = sanitizeSiteDocument(fixture);

    expect(document?.sections[1].motion).toBe("none");
    expect(document?.experience.type).toBe("none");
  });

  it("removes the retired generic benefits block from saved AI sites", () => {
    const fixture = documentFixture();
    fixture.sections.splice(1, 0, {
      ...fixture.sections[1],
      id: "reasons",
      kind: "benefits",
      title: "Una tienda hecha para esta marca",
    });

    const document = sanitizeSiteDocument(fixture);

    expect(document?.sections.map((section) => section.kind)).toEqual(["hero", "story", "catalog", "contact"]);
  });

  it("keeps a connected Paya event block and its server-owned event id", () => {
    const fixture = documentFixture();
    fixture.sections.splice(3, 0, {
      ...fixture.sections[2],
      id: "event-summer",
      kind: "event-tickets",
      eventId: "event_123",
      title: "Entradas",
    });

    const document = sanitizeSiteDocument(fixture);

    expect(document?.sections.find((section) => section.kind === "event-tickets")).toMatchObject({
      id: "event-summer",
      eventId: "event_123",
      title: "Entradas",
    });
  });

  it("rejects documents that omit or duplicate trusted commerce zones", () => {
    const missingContact = documentFixture();
    missingContact.sections = missingContact.sections.filter((section) => section.kind !== "contact");
    expect(sanitizeSiteDocument(missingContact)).toBeNull();

    const duplicateCatalog = documentFixture();
    duplicateCatalog.sections.push({ ...duplicateCatalog.sections[2], id: "shop-again" });
    expect(sanitizeSiteDocument(duplicateCatalog)).toBeNull();
  });
});

describe("synchronizeSiteDocument", () => {
  it("projects compatible editor fields without replacing authored structure", () => {
    const document = sanitizeSiteDocument(documentFixture())!;
    const synchronized = synchronizeSiteDocument(document, {
      tagline: "Una portada nueva",
      catalogTitle: "Compra la colección",
      contactSubtitle: "Cuéntanos qué necesitas",
      accentColor: "#AA2244",
      sectionBackgrounds: { products: "#EEE8DD" },
      bannerUrl: "/v1/uploads/replacement.webp",
    });

    expect(synchronized.sections.map((section) => section.kind)).toEqual(document.sections.map((section) => section.kind));
    expect(synchronized.sections.find((section) => section.kind === "hero")?.title).toBe("Una portada nueva");
    expect(synchronized.sections.find((section) => section.kind === "hero")?.mediaUrls).toEqual(["/v1/uploads/hero.webp"]);
    expect(synchronized.sections.find((section) => section.kind === "catalog")?.title).toBe("Compra la colección");
    expect(synchronized.sections.find((section) => section.kind === "catalog")?.backgroundColor).toBe("#eee8dd");
    expect(synchronized.sections.find((section) => section.kind === "contact")?.body).toBe("Cuéntanos qué necesitas");
    expect(synchronized.theme.accentColor).toBe("#aa2244");
    expect(synchronized.sections.find((section) => section.kind === "hero")?.blocks?.find((block) => block.id === "heading")?.text).toBe("Una portada nueva");
  });

  it("colors one authored section by its stable site id without coloring sibling sections", () => {
    const document = sanitizeSiteDocument(documentFixture())!;
    const synchronized = synchronizeSiteDocument(document, {
      sectionBackgrounds: { "site-shop": "#224466" },
    });

    expect(synchronized.sections.find((section) => section.id === "shop")?.backgroundColor).toBe("#224466");
    expect(synchronized.sections.find((section) => section.id === "story")?.backgroundColor).toBe("#f5f2ea");
  });

  it("keeps additional authored stories independent from the legacy story fields", () => {
    const fixture = documentFixture();
    fixture.sections.splice(2, 0, {
      ...fixture.sections[1],
      id: "story-new",
      title: "Nueva historia",
      body: "Su propio relato",
    });
    const document = sanitizeSiteDocument(fixture)!;
    const synchronized = synchronizeSiteDocument(document, {
      aboutTitle: "Historia principal actualizada",
      aboutText: "Texto principal actualizado",
    });

    expect(synchronized.sections.find((section) => section.id === "story")).toMatchObject({ title: "Historia principal actualizada", body: "Texto principal actualizado" });
    expect(synchronized.sections.find((section) => section.id === "story-new")).toMatchObject({ title: "Nueva historia", body: "Su propio relato" });
  });

  it("retires the hidden AI signature once the editable animation list takes ownership", () => {
    const fixture = {
      ...documentFixture(),
      experience: {
        type: "text-rotate",
        placement: "after-catalog",
        title: "Vestidos|Abrigos",
        body: "Encuentra tu favorito",
        mediaUrls: [],
      },
    };
    const document = sanitizeSiteDocument(fixture)!;
    const synchronized = synchronizeSiteDocument(document, {
      animations: [{ id: "ai-signature-experience" }],
    });

    expect(synchronized.experience.type).toBe("none");
    expect(synchronized.experience.title).toBe("Vestidos|Abrigos");
  });
});
