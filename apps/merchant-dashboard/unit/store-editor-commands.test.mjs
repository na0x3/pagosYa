import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnimationCommand,
  applyStoreDocumentCommand,
  reorderStoreEditorList,
  replaceStoreCreativeCanvas,
} from "../src/store-editor/commands.js";

function animationsFixture() {
  return [{
    id: "opening",
    name: "Apertura",
    type: "scroll-expansion",
    title: "Título",
    subtitle: "Subtítulo",
    textBlocks: [{ id: "text-1", role: "title", text: "Texto extra", textPositionX: 20, textPositionY: 30 }],
    media: [
      { imageUrl: "/uploads/one.webp", title: "Uno", caption: "Primero", body: "" },
      { imageUrl: "/uploads/two.webp", title: "Dos", caption: "Segundo", body: "" },
    ],
  }];
}

function documentFixture() {
  return {
    version: 1,
    navigation: { items: [{ id: "home", label: "Inicio" }] },
    footer: { brandDescription: "Original", columns: [{ title: "Ayuda", items: [{ label: "Contacto" }] }] },
    sections: [{
      id: "story",
      kind: "story",
      title: "Historia",
      body: "Texto",
      items: [{ title: "Capítulo", body: "Cuerpo" }],
      blocks: [{ id: "group", kind: "group", children: [
        { id: "heading", kind: "heading", text: "Historia", style: {} },
        { id: "chapter-1-body", kind: "text", text: "Cuerpo", style: {} },
      ] }],
    }],
  };
}

test("inline block text updates the canonical block and compatibility projection immutably", () => {
  const original = documentFixture();
  const result = applyStoreDocumentCommand(original, {
    type: "set-inline-text",
    selection: { section: "site-story", field: "siteBlockText", itemId: "heading" },
    value: "Nueva historia",
  });

  assert.equal(result.changed, true);
  assert.equal(result.document.sections[0].title, "Nueva historia");
  assert.equal(result.document.sections[0].blocks[0].children[0].text, "Nueva historia");
  assert.equal(original.sections[0].title, "Historia");
});

test("dragged site text layout is clamped and does not mutate the source document", () => {
  const original = documentFixture();
  const result = applyStoreDocumentCommand(original, {
    type: "set-text-layout",
    selection: { section: "site-story", field: "siteBlockText", itemId: "heading" },
    textOffsetX: 1800,
    textOffsetY: -125,
    textOffsetBasis: "section",
    textWidthPercent: 48,
  });

  assert.deepEqual(result.document.sections[0].blocks[0].children[0].style, {
    textOffsetX: 1000,
    textOffsetY: -125,
    textOffsetBasis: "section",
    textWidthPercent: 48,
  });
  assert.deepEqual(original.sections[0].blocks[0].children[0].style, {});
});

test("section heights are clamped per viewport and can return to automatic", () => {
  const original = documentFixture();
  const desktop = applyStoreDocumentCommand(original, {
    type: "set-section-height",
    selection: { section: "site-story", field: "section" },
    viewport: "desktop",
    heightPx: 90,
  });
  const mobile = applyStoreDocumentCommand(desktop.document, {
    type: "set-section-height",
    selection: { section: "site-story", field: "section" },
    viewport: "mobile",
    heightPx: 460,
  });
  const resetDesktop = applyStoreDocumentCommand(mobile.document, {
    type: "set-section-height",
    selection: { section: "site-story", field: "section" },
    viewport: "desktop",
    heightPx: null,
  });

  assert.equal(desktop.document.sections[0].heightPx, 180);
  assert.equal(mobile.document.sections[0].mobileHeightPx, 460);
  assert.equal(resetDesktop.document.sections[0].heightPx, undefined);
  assert.equal(resetDesktop.document.sections[0].mobileHeightPx, 460);
  assert.equal(original.sections[0].heightPx, undefined);
});

test("dragged header copy keeps independent persisted positions", () => {
  const original = documentFixture();
  original.navigation.items = [{ id: "home", label: "Inicio", target: "home" }];
  const movedBrand = applyStoreDocumentCommand(original, {
    type: "set-text-layout",
    selection: { section: "brand", field: "storeName" },
    textOffsetX: -36,
    textOffsetY: 12,
  });
  const movedLink = applyStoreDocumentCommand(movedBrand.document, {
    type: "set-text-layout",
    selection: { section: "navigation", field: "navigationLabel", itemIndex: 0 },
    textOffsetX: 18,
    textOffsetY: -8,
  });

  assert.deepEqual(movedLink.document.navigation.brandStyle, { textOffsetX: -36, textOffsetY: 12, textOffsetBasis: "element" });
  assert.deepEqual(movedLink.document.navigation.items[0].style, { textOffsetX: 18, textOffsetY: -8, textOffsetBasis: "element" });
  assert.equal(original.navigation.brandStyle, undefined);
  assert.equal(original.navigation.items[0].style, undefined);
});

test("the storefront heading appearance persists on the header brand", () => {
  const original = documentFixture();
  original.navigation.brandStyle = { textScale: 90 };
  const scaled = applyStoreDocumentCommand(original, {
    type: "set-text-style",
    selection: { section: "brand", field: "storeName" },
    key: "textScale",
    value: 145,
  });
  const typed = applyStoreDocumentCommand(scaled.document, {
    type: "set-text-style",
    selection: { section: "brand", field: "storeName" },
    key: "fontStyle",
    value: "editorial",
  });
  const colored = applyStoreDocumentCommand(typed.document, {
    type: "set-text-style",
    selection: { section: "brand", field: "storeName" },
    key: "textColor",
    value: "#7c2d12",
  });

  assert.equal(scaled.changed, true);
  assert.equal(typed.changed, true);
  assert.equal(colored.changed, true);
  assert.deepEqual(colored.document.navigation.brandStyle, { textScale: 145, fontStyle: "editorial", textColor: "#7c2d12" });
  assert.deepEqual(original.navigation.brandStyle, { textScale: 90 });
});

test("duplicating projected site text creates an independent movable block", () => {
  const original = documentFixture();
  original.sections[0].blocks = [];
  original.sections[0].titleStyle = { textColor: "#663300", textOffsetX: 20, textOffsetY: -40 };
  const result = applyStoreDocumentCommand(original, {
    type: "duplicate-site-text-block",
    selection: { section: "site-story", field: "siteBlockText", itemId: "heading" },
    source: { sourceId: "heading", kind: "heading", role: "primary", text: "Historia", style: original.sections[0].titleStyle },
  });

  assert.equal(result.changed, true);
  assert.equal(result.createdBlockId, "heading-1");
  assert.deepEqual(result.document.sections[0].blocks.map((block) => block.id), ["heading", "heading-1", "body"]);
  assert.deepEqual(result.document.sections[0].blocks[1].style, {
    textColor: "#663300",
    textScale: 100,
    textWidthPercent: 62,
    textOffsetX: 3,
    textOffsetY: 3,
    textOffsetBasis: "section",
  });
  assert.deepEqual(original.sections[0].blocks, []);
});

test("duplicated titles keep independent colors and manually controlled widths", () => {
  const original = documentFixture();
  original.sections[0].blocks = [
    { id: "heading", kind: "heading", text: "Historia", style: { textColor: "#111111" }, children: [] },
    { id: "heading-1", kind: "heading", text: "Invierno", style: { textColor: "#663300", textWidthPercent: 62 }, children: [] },
    { id: "heading-2", kind: "heading", text: "Verano", style: { textColor: "#224466", textWidthPercent: 48 }, children: [] },
  ];
  const colorResult = applyStoreDocumentCommand(original, {
    type: "set-text-style",
    selection: { section: "site-story", field: "siteBlockText", itemId: "heading-2" },
    key: "textColor",
    value: "#cc5500",
  });
  const widthResult = applyStoreDocumentCommand(colorResult.document, {
    type: "set-text-style",
    selection: { section: "site-story", field: "siteBlockText", itemId: "heading-2" },
    key: "textWidthPercent",
    value: 37,
  });

  assert.equal(widthResult.document.sections[0].blocks[1].style.textColor, "#663300");
  assert.equal(widthResult.document.sections[0].blocks[1].style.textWidthPercent, 62);
  assert.deepEqual(widthResult.document.sections[0].blocks[2].style, { textColor: "#cc5500", textWidthPercent: 37 });
  assert.equal(original.sections[0].blocks[2].style.textColor, "#224466");
});

test("a free text block can move to another section without changing its style", () => {
  const original = documentFixture();
  original.sections[0].blocks.push({ id: "heading-2", kind: "heading", slot: "heading", role: "primary", text: "Temporada", style: { textColor: "#bb4400", textWidthPercent: 54 }, children: [] });
  original.sections.push({ id: "catalog", kind: "catalog", title: "Productos", body: "", blocks: [] });
  const result = applyStoreDocumentCommand(original, {
    type: "move-site-text-block",
    selection: { section: "site-story", field: "siteBlockText", itemId: "heading-2" },
    targetSectionId: "catalog",
  });

  assert.equal(result.changed, true);
  assert.equal(result.targetSectionId, "catalog");
  assert.equal(result.document.sections[0].blocks.some((block) => block.id === "heading-2"), false);
  assert.deepEqual(result.document.sections[1].blocks[0].style, { textColor: "#bb4400", textWidthPercent: 54, textOffsetX: 0, textOffsetY: 0, textOffsetBasis: "section" });
  assert.equal(original.sections[0].blocks.some((block) => block.id === "heading-2"), true);
});

test("a gallery accepts a new independent text object", () => {
  const original = documentFixture();
  original.sections[0].kind = "gallery";
  const result = applyStoreDocumentCommand(original, {
    type: "duplicate-site-text-block",
    selection: { section: "site-story", field: "section" },
    source: { kind: "text", role: "supporting", text: "Texto sobre la galería", style: { fontStyle: "editorial", textScale: 82 } },
  });

  const added = result.document.sections[0].blocks.at(-1);
  assert.equal(result.changed, true);
  assert.equal(added.id, "text-1");
  assert.equal(added.slot, "body");
  assert.equal(added.text, "Texto sobre la galería");
  assert.equal(added.style.fontStyle, "editorial");
});

test("site text can be deleted without mutating the source document", () => {
  const original = documentFixture();
  original.sections[0].blocks.push({ id: "text-2", kind: "text", slot: "body", role: "supporting", text: "Quitarme", children: [] });
  const removed = applyStoreDocumentCommand(original, {
    type: "delete-site-text",
    selection: { section: "site-story", field: "siteBlockText", itemId: "text-2" },
  });
  const cleared = applyStoreDocumentCommand(removed.document, {
    type: "delete-site-text",
    selection: { section: "site-story", field: "siteBlockText", itemId: "heading" },
  });

  assert.equal(removed.changed, true);
  assert.equal(removed.document.sections[0].blocks.some((block) => block.id === "text-2"), false);
  assert.equal(cleared.changed, true);
  assert.equal(cleared.document.sections[0].title, "");
  assert.equal(original.sections[0].blocks.some((block) => block.id === "text-2"), true);
  assert.equal(original.sections[0].title, "Historia");
});

test("deleting a site section also removes navigation links to it without mutating the source", () => {
  const original = documentFixture();
  original.navigation.items.push({ id: "story-link", label: "Historia", target: "section", sectionId: "story" });
  const result = applyStoreDocumentCommand(original, {
    type: "delete-section",
    selection: { section: "site-story", field: "section" },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.document.sections, []);
  assert.deepEqual(result.document.deletedSectionIds, ["story"]);
  assert.deepEqual(result.document.navigation.items, [{ id: "home", label: "Inicio" }]);
  assert.equal(original.sections.length, 1);
  assert.equal(original.navigation.items.length, 2);
});

test("section fields and text styles are validated by the command boundary", () => {
  const original = documentFixture();
  const invalid = applyStoreDocumentCommand(original, {
    type: "set-section-field",
    selection: { section: "site-story" },
    key: "layout",
    value: "giant-parallax",
  });
  assert.equal(invalid.changed, false);
  assert.equal(invalid.document, original);

  const styled = applyStoreDocumentCommand(original, {
    type: "set-text-style",
    selection: { section: "site-story", field: "siteBody" },
    key: "textScale",
    value: 260,
  });
  assert.equal(styled.document.sections[0].bodyStyle.textScale, 200);
});

test("reordering returns a new list and rejects invalid moves", () => {
  const original = ["site-hero", "site-catalog", "site-story"];
  const moved = reorderStoreEditorList(original, 2, 0);
  assert.deepEqual(moved.order, ["site-story", "site-hero", "site-catalog"]);
  assert.deepEqual(original, ["site-hero", "site-catalog", "site-story"]);
  assert.equal(reorderStoreEditorList(original, -1, 2).changed, false);
});

test("AI proposals replace stale creative state and preserve commerce identity", () => {
  const current = {
    storeName: "Tienda real",
    links: [{ label: "Instagram", url: "https://instagram.com/real" }],
    locations: [{ id: "central" }],
    bannerUrl: "/old.jpg",
    animations: [{ id: "huge-old-animation" }],
    heroSlides: [{ imageUrl: "/old-slide.jpg" }],
    promotionEnabled: true,
  };
  const next = replaceStoreCreativeCanvas(current, {
    backgroundColor: "#f5efe6",
    siteDocument: { version: 1, sections: [{ id: "new-hero" }] },
    contentOrder: ["site-new-hero"],
  });

  assert.equal(next.storeName, "Tienda real");
  assert.deepEqual(next.links, current.links);
  assert.deepEqual(next.locations, current.locations);
  assert.equal(next.bannerUrl, null);
  assert.deepEqual(next.animations, []);
  assert.deepEqual(next.heroSlides, []);
  assert.equal(next.promotionEnabled, false);
  assert.equal(next.backgroundColor, "#f5efe6");
  assert.deepEqual(next.contentOrder, ["site-new-hero"]);
});

test("animation text layout and style commands target independent text blocks", () => {
  const original = animationsFixture();
  const moved = applyAnimationCommand(original, {
    type: "set-text-layout",
    selection: { section: "animation-opening", animationId: "opening", itemId: "text-1" },
    textPositionX: 140,
    textPositionY: 44,
    textScale: 170,
    textWidthPercent: 74,
    textAlign: "right",
  });
  const styled = applyAnimationCommand(moved.animations, {
    type: "set-text-style",
    selection: { animationId: "opening", itemId: "text-1" },
    key: "textColor",
    value: "#abcdef",
  });

  const expected = {
    textPositionX: 100,
    textPositionY: 44,
    textScale: 170,
    textWidthPercent: 74,
    textAlign: "right",
    textColor: "#abcdef",
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(styled.animations[0].textBlocks[0][key], value);
  assert.equal(original[0].textBlocks[0].textPositionX, 20);
});

test("animation text blocks add, edit, duplicate and delete without mutating their source", () => {
  const original = animationsFixture();
  const added = applyAnimationCommand(original, {
    type: "add-text-block",
    animationId: "opening",
    role: "subtitle",
    defaultFontStyle: "editorial",
  });
  assert.equal(added.createdBlockId, "text-2");
  assert.equal(added.animations[0].textBlocks[1].text, "Escribe aquí tu subtítulo");

  const edited = applyAnimationCommand(added.animations, {
    type: "set-inline-text",
    selection: { animationId: "opening", itemId: "text-2" },
    value: "Texto pegado",
  });
  const duplicated = applyAnimationCommand(edited.animations, {
    type: "add-text-block",
    animationId: "opening",
    source: edited.animations[0].textBlocks[1],
  });
  const removed = applyAnimationCommand(duplicated.animations, {
    type: "delete-text-block",
    animationId: "opening",
    blockId: "text-2",
  });

  assert.equal(removed.animations[0].textBlocks.length, 2);
  assert.equal(removed.animations[0].textBlocks[1].text, "Texto pegado");
  assert.equal(original[0].textBlocks.length, 1);
});

test("animation media replacement preserves scene copy and reordering is immutable", () => {
  const original = animationsFixture();
  const replaced = applyAnimationCommand(original, {
    type: "replace-media",
    animationId: "opening",
    mediaIndex: 0,
    media: { imageUrl: "/uploads/two.webp" },
  });
  assert.equal(replaced.animations[0].media[0].imageUrl, "/uploads/two.webp");
  assert.equal(replaced.animations[0].media[0].title, "Uno");
  assert.equal(replaced.animations[0].media[1].imageUrl, "/uploads/one.webp");
  assert.equal(replaced.animations[0].media[1].title, "Dos");

  const reordered = applyAnimationCommand(replaced.animations, {
    type: "reorder-media",
    animationId: "opening",
    fromIndex: 1,
    toIndex: 0,
  });
  assert.deepEqual(reordered.animations[0].media.map((entry) => entry.imageUrl), ["/uploads/one.webp", "/uploads/two.webp"]);
  assert.deepEqual(original[0].media.map((entry) => entry.imageUrl), ["/uploads/one.webp", "/uploads/two.webp"]);
});

test("animation picture cards accept only explicitly allowed product links", () => {
  const original = animationsFixture();
  const rejected = applyAnimationCommand(original, {
    type: "set-media-field",
    animationId: "opening",
    mediaIndex: 0,
    key: "productId",
    value: "product_coffee",
  });
  assert.equal(rejected.changed, false);
  assert.equal(original[0].media[0].productId, undefined);

  const linked = applyAnimationCommand(original, {
    type: "set-media-field",
    animationId: "opening",
    mediaIndex: 0,
    key: "productId",
    value: "product_coffee",
    allowed: true,
  });
  assert.equal(linked.changed, true);
  assert.equal(linked.animations[0].media[0].productId, "product_coffee");
  assert.equal(original[0].media[0].productId, undefined);

  const cleared = applyAnimationCommand(linked.animations, {
    type: "set-media-field",
    animationId: "opening",
    mediaIndex: 0,
    key: "productId",
    value: "",
    allowed: true,
  });
  assert.equal(cleared.animations[0].media[0].productId, "");
});

test("animation scene fields, buttons and deletion are validated commands", () => {
  const original = animationsFixture();
  const scene = applyAnimationCommand(original, {
    type: "set-field",
    selection: { animationId: "opening", itemIndex: 0 },
    key: "title",
    value: "x".repeat(140),
  });
  const button = applyAnimationCommand(scene.animations, {
    type: "set-button-layout",
    animationId: "opening",
    buttonPositionX: -20,
    buttonPositionY: 120,
  });
  assert.equal(button.animations[0].media[0].title.length, 100);
  assert.equal(button.animations[0].buttonPositionX, 0);
  assert.equal(button.animations[0].buttonPositionY, 100);

  const deleted = applyAnimationCommand(button.animations, { type: "delete-animation", animationId: "opening" });
  assert.deepEqual(deleted.animations, []);
  assert.equal(original.length, 1);
});
