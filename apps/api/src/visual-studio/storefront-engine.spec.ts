import {
  STOREFRONT_TOPOLOGY_PLANS,
  TtlLruCache,
  beginStorefrontGeneration,
  evaluateStorefrontDiversity,
  applyStorefrontCreativeRecipe,
  applyStorefrontTopology,
  preserveLockedStorefrontSections,
  storefrontBrandFingerprint,
  storefrontCreativeRecipe,
  storefrontDirectionsAreDiverse,
  storefrontGrammar,
  storefrontOriginalityGate,
  storefrontStructuralSimilarity,
  storefrontStructuralSignature,
  storefrontTopologyPlan,
  storefrontWeightedChoice,
  varyStorefrontStructure,
  withStorefrontEngineMetadata,
} from "./storefront-engine";
import type { StoreSiteDocument } from "./site-document";

function documentFixture(variant: number): StoreSiteDocument {
  const layouts = ["split", "full-bleed", "offset"] as const;
  const fonts = ["humanist", "editorial", "geometric"] as const;
  const products = ["gallery", "editorial", "showcase"] as const;
  const nav = ["brand-left", "centered", "split"] as const;
  const spotlight = ["feature-first", "lookbook", "alternating"] as const;
  const families = ["editorial", "minimal", "cinematic"] as const;
  const section = (id: string, kind: StoreSiteDocument["sections"][number]["kind"]) => ({
    id, kind, family: families[variant], layout: layouts[variant], width: variant === 0 ? "wide" as const : "full" as const,
    align: variant === 2 ? "right" as const : "left" as const, motion: "none" as const,
    title: kind, body: "", ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [],
  });
  return {
    version: 1, direction: `direction-${variant}`,
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
      pageBackground: "#f5f2ea", textColor: "#171717", accentColor: "#315c49", secondaryColor: "#c9a86a", surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4",
      headingFont: fonts[variant], bodyFont: "grotesk", radius: variant * 4, shadow: "none", productLayout: products[variant],
      displayScale: variant === 0 ? "balanced" : variant === 1 ? "dramatic" : "monumental", density: variant === 1 ? "airy" : "balanced", imageTreatment: variant === 2 ? "cutout" : "natural",
    },
    navigation: { layout: nav[variant], sticky: false, transparent: false, logoTreatment: variant === 2 ? "seal" : "wordmark" },
    motion: { intensity: "restrained" },
    merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: spotlight[variant], showDescriptions: true },
    experience: { type: (["text-reveal-block", "text-rotate", "text-along-path"] as const)[variant], placement: "after-catalog", title: "", body: "", mediaUrls: [] },
    sections: [
      section("opening", "hero"),
      section("story", "story"),
      section("shop", "catalog"),
      section("visuals", "gallery"),
      section("information", "contact"),
    ],
  };
}

describe("StorefrontGenerationEngine", () => {
  it("fingerprints brand evidence deterministically and advances a unique generation seed", () => {
    const fingerprint = storefrontBrandFingerprint({ name: "QUEMADO2", assets: ["cup.webp"], products: ["Taza roja"] });
    expect(storefrontBrandFingerprint({ name: "QUEMADO2", assets: ["cup.webp"], products: ["Taza roja"] })).toBe(fingerprint);
    const first = beginStorefrontGeneration(fingerprint);
    const second = beginStorefrontGeneration(fingerprint);
    expect(second.generation).toBe(first.generation + 1);
    expect(second.seed).not.toBe(first.seed);
    expect(new Set([0, 1, 2].map((index) => storefrontGrammar(first, index))).size).toBe(3);
    const enriched = withStorefrontEngineMetadata(documentFixture(0), first, 0);
    expect(enriched.engine).toEqual(expect.objectContaining({ version: "2.0", brandFingerprint: fingerprint }));
    expect(enriched.designGenome.composition).toBe(enriched.engine.grammar);
  });

  it("treats page architecture as a structural generation decision", () => {
    const singlePage = documentFixture(0);
    const multiPage = structuredClone(singlePage);
    multiPage.pages = [{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }];
    multiPage.sections = multiPage.sections.map((section) => section.kind === "story" || section.kind === "gallery"
      ? { ...section, pageId: "story-page" }
      : section);

    expect(storefrontStructuralSignature(multiPage).fingerprint).not.toBe(storefrontStructuralSignature(singlePage).fingerprint);
    expect(storefrontStructuralSimilarity(singlePage, multiPage)).toBeLessThan(1);
  });

  it("ignores retired section kinds in historical proposal signatures", () => {
    const current = documentFixture(0);
    const historical = structuredClone(current) as StoreSiteDocument;
    historical.sections.push({
      ...structuredClone(historical.sections[0]),
      id: "retired-benefits",
      kind: "benefits",
    } as unknown as StoreSiteDocument["sections"][number]);

    expect(() => storefrontStructuralSignature(historical)).not.toThrow();
    expect(storefrontStructuralSimilarity(current, historical)).toBe(1);
    expect(storefrontOriginalityGate(current, [historical])).toEqual({ accepted: false, closestSimilarity: 1 });
  });

  it("keeps only recent brand analysis while rejecting template-level direction variance", () => {
    const cache = new TtlLruCache<string>(2, 10_000);
    cache.set("a", "one"); cache.set("b", "two");
    expect(cache.get("a")).toBe("one");
    cache.set("c", "three");
    expect(cache.get("b")).toBeUndefined();
    expect(storefrontDirectionsAreDiverse([documentFixture(0), documentFixture(1), documentFixture(2)])).toBe(true);
    expect(new Set([documentFixture(0), documentFixture(1), documentFixture(2)].map((document) => document.sections[0].family))).toEqual(new Set(["editorial", "minimal", "cinematic"]));
    expect(storefrontDirectionsAreDiverse([documentFixture(0), documentFixture(0), documentFixture(2)])).toBe(false);
  });

  it("offers at least ten macro topologies with genuinely different openings and orders", () => {
    expect(STOREFRONT_TOPOLOGY_PLANS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(STOREFRONT_TOPOLOGY_PLANS.map((plan) => plan.order.join("/"))).size).toBe(STOREFRONT_TOPOLOGY_PLANS.length);
    expect(new Set(STOREFRONT_TOPOLOGY_PLANS.map((plan) => plan.order[0]))).toEqual(new Set(["hero", "story", "gallery"]));
    expect(STOREFRONT_TOPOLOGY_PLANS.every((plan) => plan.order[1] === "catalog")).toBe(true);

    const context = beginStorefrontGeneration("topology-range");
    const assigned = [0, 1, 2].map((index) => storefrontTopologyPlan(context, index));
    expect(new Set(assigned.map((plan) => plan.id)).size).toBe(3);
    const rendered = assigned.map((_, index) => applyStorefrontTopology(documentFixture(index), context, index));
    expect(new Set(rendered.map((document) => document.sections.map((section) => section.kind).join("/"))).size).toBe(3);
    rendered.forEach((document, index) => {
      expect(document.designGenome.composition).toBe(assigned[index].grammar);
      expect(document.sections).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "hero" }),
        expect.objectContaining({ kind: "story" }),
        expect.objectContaining({ kind: "catalog" }),
      ]));
      expect(document.sections[1].kind).toBe("catalog");
      expect(document.sections[0].motion).not.toBe("none");
    });
  });

  it("ships an editorial-maker topology with an animated campaign opening and semantic maker imagery", () => {
    const context = { brandFingerprint: "editorial-maker", generation: 0, seed: 0 };
    const plan = storefrontTopologyPlan(context, 0);
    const document = documentFixture(0);
    const result = applyStorefrontTopology(document, context, 0, 0, [], [
      { url: "/campaign-one.webp", roles: ["campaign-image"], priority: 0 },
      { url: "/campaign-two.webp", roles: ["campaign-image"], priority: 1 },
      { url: "/process-one.webp", roles: ["process-image"], priority: 2 },
      { url: "/process-two.webp", roles: ["process-image"], priority: 3 },
      { url: "/texture.webp", roles: ["ambient-detail", "brand-texture"], priority: 4 },
      { url: "/maker.webp", roles: ["founder-or-story"], priority: 5 },
    ]);

    expect(plan.id).toBe("editorial-maker");
    expect(result.designGenome.composition).toBe("editorial-maker");
    expect(result.sections.slice(0, 4).map((section) => section.kind)).toEqual(["hero", "catalog", "gallery", "story"]);
    expect(result.sections[0]).toEqual(expect.objectContaining({ motion: "clip", mediaUrls: ["/campaign-one.webp", "/campaign-two.webp"] }));
    expect(result.sections.find((section) => section.kind === "gallery")?.mediaUrls).toEqual(expect.arrayContaining(["/process-one.webp", "/process-two.webp", "/texture.webp"]));
    expect(result.sections.find((section) => section.kind === "story")?.mediaUrls).toContain("/maker.webp");
  });

  it("evaluates generated batches with explicit topology and pairwise-similarity metrics", () => {
    const context = beginStorefrontGeneration("diversity-evaluation");
    const documents = [0, 1, 2].map((index) => applyStorefrontTopology(documentFixture(index), context, index));
    const report = evaluateStorefrontDiversity(documents);

    expect(report).toEqual(expect.objectContaining({
      accepted: true,
      documentCount: 3,
      uniqueOrders: 3,
      uniqueGrammars: 3,
    }));
    expect(report.uniqueOpenings).toBeGreaterThanOrEqual(2);
    expect(report.maximumPairSimilarity).toBeLessThan(0.66);
  });

  it("saves only a weighted creative recipe with semantic media roles", () => {
    const document = documentFixture(0);
    document.sections[0].title = "Copy privado del comercio";
    document.sections[0].mediaUrls = ["/v1/uploads/private-product.webp"];
    document.merchandising.featuredProductIds = ["product_private"];

    const recipe = storefrontCreativeRecipe(document, "Editorial reutilizable");
    const serialized = JSON.stringify(recipe);

    expect(recipe.sectionOrder).toEqual(["hero", "story", "catalog", "gallery", "contact"]);
    expect(recipe.genome.composition.find((option) => option.value === document.designGenome.composition)?.weight).toBe(8);
    expect(recipe.sections[0].mediaBindings).toEqual([{ slot: "primary-media", role: "featured-product", cardinality: 1 }]);
    expect(serialized).not.toContain("Copy privado");
    expect(serialized).not.toContain("private-product");
    expect(serialized).not.toContain("product_private");
  });

  it("preserves locked sections exactly while varying unlocked weighted axes", () => {
    const current = documentFixture(0);
    current.sections[1].title = "Esta historia queda";
    const generated = documentFixture(1);
    generated.sections[1].id = "ai-renamed-story";
    const context = beginStorefrontGeneration("brand-lock-test");
    const varied = varyStorefrontStructure(generated, context, 0, 3, ["story"]);
    const merged = preserveLockedStorefrontSections(varied, current, ["story"]);

    expect(merged.sections.find((section) => section.id === "story")).toEqual(current.sections[1]);
    expect(merged.sections.findIndex((section) => section.id === "story")).toBe(1);
    expect(storefrontWeightedChoice([{ value: "a", weight: 1 }, { value: "b", weight: 8 }], 0xffff_ffff)).toBe("b");
  });

  it("preserves only the locked occurrence when sections share a kind", () => {
    const current = documentFixture(0);
    const secondStory = structuredClone(current.sections[1]);
    secondStory.id = "second-story";
    secondStory.title = "Este segundo relato queda exacto";
    current.sections.splice(2, 0, secondStory);

    const generated = structuredClone(current);
    generated.sections[1].title = "Primer relato regenerado";
    generated.sections[2] = {
      ...generated.sections[2],
      id: "renamed-second-story",
      title: "Reemplazo del segundo relato",
    };

    const merged = preserveLockedStorefrontSections(generated, current, ["second-story"]);
    const stories = merged.sections.filter((section) => section.kind === "story");

    expect(stories).toHaveLength(2);
    expect(stories[0]).toEqual(expect.objectContaining({ id: "story", title: "Primer relato regenerado" }));
    expect(merged.sections[2]).toEqual(secondStory);
    expect(merged.sections.find((section) => section.id === "renamed-second-story")).toBeUndefined();
  });

  it("rejects structurally repeated sites without comparing copy, products, or images", () => {
    const original = documentFixture(0);
    const reskinned = structuredClone(original);
    reskinned.direction = "Otro nombre";
    reskinned.sections[0].title = "Otro texto";
    reskinned.sections[0].mediaUrls = ["/other.webp"];
    reskinned.merchandising.featuredProductIds = ["other-product"];

    expect(storefrontStructuralSimilarity(original, reskinned)).toBe(1);
    expect(storefrontOriginalityGate(reskinned, [original])).toEqual({ accepted: false, closestSimilarity: 1 });
    expect(storefrontOriginalityGate(documentFixture(2), [original]).accepted).toBe(true);
    expect(storefrontOriginalityGate(reskinned, [original], [], 0.66).accepted).toBe(false);
  });

  it("rejects near-template reskins that the former 0.82 threshold accepted", () => {
    const original = documentFixture(0);
    const nearCopy = structuredClone(original);
    nearCopy.theme.headingFont = "geometric";
    nearCopy.theme.bodyFont = "classic";
    nearCopy.theme.density = "airy";
    const similarity = storefrontStructuralSimilarity(original, nearCopy);

    expect(similarity).toBeGreaterThan(0.66);
    expect(similarity).toBeLessThan(0.82);
    expect(storefrontOriginalityGate(nearCopy, [original]).accepted).toBe(false);
    expect(storefrontOriginalityGate(nearCopy, [original], [], 0.82).accepted).toBe(true);
  });

  it("materializes a saved recipe against destination content without copying source content", () => {
    const source = documentFixture(0);
    const destination = documentFixture(2);
    destination.sections[0].title = "Contenido de destino";
    const recipe = storefrontCreativeRecipe(source, "Receta");
    recipe.genome.composition = recipe.genome.composition.map((option) => ({ ...option, weight: option.value === source.designGenome.composition ? 1 : 0 }));
    recipe.sections[0].family = recipe.sections[0].family.map((option) => ({ ...option, weight: option.value === "editorial" ? 1 : 0 }));
    const result = applyStorefrontCreativeRecipe(destination, recipe, beginStorefrontGeneration("recipe-destination"), 0);

    expect(result.designGenome.composition).toBe(source.designGenome.composition);
    expect(result.sections[0]).toEqual(expect.objectContaining({ kind: "hero", family: "editorial", title: "Contenido de destino" }));
  });

  it("resolves recipe media by semantic role and carries weighted type, density, and section order", () => {
    const source = documentFixture(0);
    source.sections[0].mediaUrls = ["/source-product.webp"];
    source.sections[1].mediaUrls = ["/source-process.webp"];
    const recipe = storefrontCreativeRecipe(source, "Recipe without content");
    recipe.sectionOrders = [{ value: ["story", "catalog", "hero", "gallery", "contact"], weight: 1 }];
    recipe.theme!.headingFont = recipe.theme!.headingFont.map((option) => ({ ...option, weight: option.value === "classic" ? 1 : 0 }));
    recipe.theme!.density = recipe.theme!.density.map((option) => ({ ...option, weight: option.value === "dense" ? 1 : 0 }));
    const destination = documentFixture(2);
    destination.sections[0].title = "Destination product copy";
    destination.sections[1].title = "Destination story copy";

    const result = applyStorefrontCreativeRecipe(
      destination,
      recipe,
      beginStorefrontGeneration("semantic-destination"),
      0,
      [
        { url: "/destination-story.webp", roles: ["founder-or-story"], priority: 0 },
        { url: "/destination-product.webp", roles: ["featured-product", "collection-cover"], priority: 1 },
      ],
    );

    expect(result.sections.map((section) => section.kind)).toEqual(["story", "catalog", "hero", "gallery", "contact"]);
    expect(result.sections.find((section) => section.kind === "hero")?.mediaUrls).toEqual(["/destination-product.webp"]);
    expect(result.sections.find((section) => section.kind === "story")?.mediaUrls).toEqual(["/destination-story.webp"]);
    expect(JSON.stringify(result)).not.toContain("/source-");
    expect(result.theme).toEqual(expect.objectContaining({ headingFont: "classic", density: "dense" }));
  });

  it("spreads reusable recipe media across destination assets before repeating one", () => {
    const source = documentFixture(0);
    const recipe = storefrontCreativeRecipe(source, "Distributed media");
    const mediaSections = recipe.sections.filter((section) => ["hero", "story", "gallery"].includes(section.kind));
    mediaSections.forEach((section, index) => {
      section.mediaBindings = [{ slot: `media-${index}`, role: "editorial", cardinality: 1 }];
    });

    const result = applyStorefrontCreativeRecipe(
      documentFixture(1),
      recipe,
      beginStorefrontGeneration("distributed-destination-media"),
      0,
      [
        { url: "/destination-one.webp", roles: ["editorial"], priority: 0 },
        { url: "/destination-two.webp", roles: ["editorial"], priority: 1 },
        { url: "/destination-three.webp", roles: ["editorial"], priority: 2 },
      ],
    );

    const assigned = result.sections
      .filter((section) => ["hero", "story", "gallery"].includes(section.kind))
      .flatMap((section) => section.mediaUrls);
    expect(assigned).toHaveLength(3);
    expect(new Set(assigned).size).toBe(3);
  });

  it("compares candidates with persisted content-free structural signatures", () => {
    const original = documentFixture(0);
    const signature = storefrontStructuralSignature(original);
    const reskinned = structuredClone(original);
    reskinned.sections[0].title = "Different merchant copy";
    reskinned.sections[0].mediaUrls = ["/different.webp"];

    expect(signature.features.some((feature) => feature.includes("Different merchant copy"))).toBe(false);
    expect(storefrontOriginalityGate(reskinned, [], [], 0.66, [signature])).toEqual({ accepted: false, closestSimilarity: 1 });
  });
});
