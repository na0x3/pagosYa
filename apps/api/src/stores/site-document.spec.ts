import { AI_SITE_DOCUMENT_SCHEMA, materializeSiteDocument } from "./site-document";

function aiDocument() {
  const section = (id: string, kind: string, pageId = "") => ({
    id,
    pageId,
    kind,
    family: kind === "catalog" ? "product-led" : "editorial",
    layout: kind === "catalog" ? "grid" : "split",
    width: "wide",
    align: "left",
    motion: kind === "story" ? "story-scroll" : "none",
    title: id,
    body: "Contenido real de la tienda.",
    ctaLabel: "",
    backgroundColor: "#f5f2ea",
    textColor: "#171717",
    mediaIndices: [],
    items: [],
    blocks: [],
  });
  return {
    version: 1,
    direction: "Editorial multipágina",
    pages: [{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }],
    designGenome: {
      composition: "editorial-split",
      rhythm: "editorial",
      geometry: "soft",
      colorStrategy: "accent-led",
      mediaStrategy: "framed",
      typeScale: "editorial",
      motionLanguage: "reveal",
    },
    theme: {
      pageBackground: "#f5f2ea",
      textColor: "#171717",
      accentColor: "#315c49",
      secondaryColor: "#c9a86a",
      surfaceColor: "#ffffff",
      mutedColor: "#626262",
      borderColor: "#c9c9c4",
      headingFont: "editorial",
      bodyFont: "grotesk",
      radius: 4,
      shadow: "none",
      productLayout: "editorial",
      displayScale: "dramatic",
      density: "airy",
      imageTreatment: "editorial",
    },
    navigation: { layout: "brand-left", sticky: false, transparent: false, logoTreatment: "wordmark" },
    motion: { intensity: "restrained" },
    merchandising: { featuredProductIndices: [], productOrderIndices: [], spotlightLayout: "collection", showDescriptions: true },
    experience: { type: "none", placement: "after-catalog", title: "", body: "", mediaIndices: [] },
    sections: [
      section("opening", "hero"),
      section("shop", "catalog"),
      section("story", "story", "story-page"),
      section("information", "contact"),
    ],
  };
}

describe("AI site document page architecture", () => {
  it("requires the AI to return pages and a pageId for every section", () => {
    expect(AI_SITE_DOCUMENT_SCHEMA.required).toContain("pages");
    expect(AI_SITE_DOCUMENT_SCHEMA.properties.sections.items.required).toContain("pageId");
  });

  it("materializes valid pages and derives their navigation items", () => {
    const document = materializeSiteDocument(aiDocument(), []);

    expect(document).toEqual(expect.objectContaining({
      pages: [{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }],
      navigation: expect.objectContaining({ items: [
        { id: "home", label: "Inicio", target: "home" },
        { id: "catalog", label: "Tienda", target: "catalog" },
        { id: "nav-story-page", label: "Nuestra historia", target: "page", pageId: "story-page" },
      ] }),
    }));
    expect(document?.sections.find((section) => section.id === "story")?.pageId).toBe("story-page");
  });

  it("rejects orphan assignments, commerce pages and empty declared pages", () => {
    const orphan = aiDocument();
    orphan.sections[2].pageId = "missing-page";
    expect(materializeSiteDocument(orphan, [])).toBeNull();

    const commercePage = aiDocument();
    commercePage.sections[0].pageId = "story-page";
    expect(materializeSiteDocument(commercePage, [])).toBeNull();

    const emptyPage = aiDocument();
    emptyPage.sections[2].pageId = "";
    expect(materializeSiteDocument(emptyPage, [])).toBeNull();
  });

  it("keeps a simple AI document on Inicio when no separate page is justified", () => {
    const input = aiDocument();
    input.pages = [];
    input.sections.forEach((section) => { section.pageId = ""; });

    const document = materializeSiteDocument(input, []);

    expect(document?.pages).toBeUndefined();
    expect(document?.navigation.items).toEqual([
      { id: "home", label: "Inicio", target: "home" },
      { id: "catalog", label: "Tienda", target: "catalog" },
    ]);
  });
});
