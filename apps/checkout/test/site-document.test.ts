import { describe, expect, it } from "vitest";
import { sanitizeSiteDocument, synchronizeSiteDocument } from "../src/site-document";

function documentFixture() {
  const section = (id: string, kind: string, mediaUrls: string[] = []) => ({
    id, kind, layout: "split", width: "wide", align: "left", motion: "none",
    title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls, items: [],
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
  });

  it("keeps advanced art direction, safe motion and product merchandising", () => {
    const fixture = {
      ...documentFixture(),
      theme: { ...documentFixture().theme, displayScale: "monumental", density: "airy", imageTreatment: "cinematic" },
      navigation: { ...documentFixture().navigation, logoTreatment: "seal" },
      motion: { intensity: "cinematic" },
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

  it("turns retired moving marquees into static galleries", () => {
    const fixture = documentFixture();
    fixture.sections[1] = { ...fixture.sections[1], kind: "gallery", motion: "marquee" };

    const document = sanitizeSiteDocument(fixture);

    expect(document?.sections[1].kind).toBe("gallery");
    expect(document?.sections[1].motion).toBe("none");
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
  });

  it("colors one authored section by its stable site id without coloring sibling sections", () => {
    const document = sanitizeSiteDocument(documentFixture())!;
    const synchronized = synchronizeSiteDocument(document, {
      sectionBackgrounds: { "site-shop": "#224466" },
    });

    expect(synchronized.sections.find((section) => section.id === "shop")?.backgroundColor).toBe("#224466");
    expect(synchronized.sections.find((section) => section.id === "story")?.backgroundColor).toBe("#f5f2ea");
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
