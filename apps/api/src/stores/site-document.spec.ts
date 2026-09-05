import { STORE_SITE_SECTION_KINDS } from "@pagosya/shared-types";
import { AI_SITE_DOCUMENT_SCHEMA, SITE_SECTION_KINDS, materializeSiteDocument } from "./site-document";

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
      section("story-shop", "catalog", "story-page"),
      section("information", "contact"),
    ],
  };
}

describe("AI site document page architecture", () => {
  it("keeps server-owned event tickets out of the AI authoring contract", () => {
    expect(STORE_SITE_SECTION_KINDS).toContain("event-tickets");
    expect(SITE_SECTION_KINDS).not.toContain("event-tickets");
    expect(AI_SITE_DOCUMENT_SCHEMA.properties.sections.items.anyOf.flatMap((schema) => schema.properties.kind.enum)).toEqual(SITE_SECTION_KINDS);
  });

  it("requires the AI to return pages and a pageId for every section", () => {
    expect(AI_SITE_DOCUMENT_SCHEMA.required).toContain("pages");
    for (const schema of AI_SITE_DOCUMENT_SCHEMA.properties.sections.items.anyOf) expect(schema.required).toContain("pageId");
  });

  it("constrains motion, layouts and block slots to their section kind in the provider schema", () => {
    const catalog = AI_SITE_DOCUMENT_SCHEMA.properties.sections.items.anyOf.find((schema) => schema.properties.kind.enum.includes("catalog"))!;
    expect(catalog.properties.motion.enum).toContain("reveal");
    expect(catalog.properties.motion.enum).not.toContain("clip");
    expect(catalog.properties.layout.enum).not.toContain("full-bleed");
    expect(catalog.properties.blocks.items.properties.children.items.properties.slot.enum).toContain("products");
    expect(catalog.properties.blocks.items.properties.slot.enum).not.toContain("primary-media");
  });

  it("normalizes an explicit Inicio page and registered incompatible motion without losing content", () => {
    const input = aiDocument();
    input.pages.unshift({ id: "home", label: "Inicio", slug: "home" });
    input.sections.forEach((section) => { if (!section.pageId) section.pageId = "home"; });
    input.sections[1].motion = "clip";
    const document = materializeSiteDocument(input, []);
    expect(document?.pages).toEqual([{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }]);
    expect(document?.sections[0]).toMatchObject({ title: input.sections[0].title });
    expect(document?.sections[0].pageId).toBeUndefined();
    expect(document?.sections[1].motion).toBe("reveal");
    expect(document?.sections[2].pageId).toBe("story-page");
    input.sections[1].motion = "invented-motion";
    expect(materializeSiteDocument(input, [])).toBeNull();
  });

  it("rejects ambiguous duplicate Inicio declarations", () => {
    const input = aiDocument();
    input.pages = [{ id: "home", label: "Inicio", slug: "home" }, { id: "home", label: "Otra", slug: "home" }];
    expect(materializeSiteDocument(input, [])).toBeNull();
  });

  it("binds each additional catalog to its declared product indices without accepting foreign IDs", () => {
    const input = aiDocument();
    Object.assign(input.sections[3], { productIndices: [1, 1, 99, "foreign"] });
    const document = materializeSiteDocument(input, [], [{ id: "bikini" }, { id: "enterizo" }]);
    expect(document?.sections.find((section) => section.id === "story-shop")?.productIds).toEqual(["enterizo"]);
    expect(document?.sections.find((section) => section.id === "shop")?.productIds).toBeUndefined();
  });

  it("materializes valid pages and derives their navigation items", () => {
    const document = materializeSiteDocument(aiDocument(), []);

    expect(document).toEqual(expect.objectContaining({
      pages: [{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }],
      navigation: expect.objectContaining({ items: [
        { id: "home", label: "Inicio", target: "home" },
        { id: "catalog", label: "Tienda", target: "catalog" },
        { id: "nav-story-page", label: "Nuestra historia", target: "page", pageId: "story-page" },
      ], barStyle: "floating", brandPosition: "left", navPosition: "center", searchPosition: "right", profilePosition: "right", cartPosition: "right" }),
    }));
    expect(document?.sections.find((section) => section.id === "story")?.pageId).toBe("story-page");
  });

  it("rejects orphan assignments, page heroes and pages without commerce", () => {
    const orphan = aiDocument();
    orphan.sections[2].pageId = "missing-page";
    expect(materializeSiteDocument(orphan, [])).toBeNull();

    const pageHero = aiDocument();
    pageHero.sections[0].pageId = "story-page";
    expect(materializeSiteDocument(pageHero, [])).toBeNull();

    const emptyPage = aiDocument();
    emptyPage.sections[2].pageId = "";
    emptyPage.sections[3].pageId = "";
    expect(materializeSiteDocument(emptyPage, [])).toBeNull();
  });

  it("keeps a simple AI document on Inicio when no separate page is justified", () => {
    const input = aiDocument();
    input.pages = [];
    input.sections.forEach((section) => { section.pageId = ""; });
    input.sections = input.sections.filter((section) => section.id !== "story-shop");

    const document = materializeSiteDocument(input, []);

    expect(document?.pages).toBeUndefined();
    expect(document?.navigation.items).toEqual([
      { id: "home", label: "Inicio", target: "home" },
      { id: "catalog", label: "Tienda", target: "catalog" },
    ]);
  });

  it("drops model-invented executable fields and never resolves invented media URLs", () => {
    const input = aiDocument() as any;
    input.html = "<script>steal()</script>";
    input.sections[0].onload = "steal()";
    input.sections[0].mediaIndices = [0, 999, "https://attacker.example/tracker.png"];
    input.sections[0].title = "<img src=x onerror=steal()>";

    const document = materializeSiteDocument(input, []);

    expect(document).not.toBeNull();
    expect(document).not.toHaveProperty("html");
    expect(document?.sections[0]).not.toHaveProperty("onload");
    expect(document?.sections[0].mediaUrls).toEqual([]);
    // Copy remains plain text for the renderer to escape; it is never treated as HTML here.
    expect(document?.sections[0].title).toBe("<img src=x onerror=steal()>");
  });
});
