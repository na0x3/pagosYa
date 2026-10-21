import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// Meathouse 2026-10-20: the quick-look chip hangs from the photo's right edge and is pulled left by translate(-100%),
// so its width came from the ~35px to the right of a full-width photo and «Vista rápida» wrapped letter by letter.
const commerce = readFileSync(kitPath("commerce.js"), "utf8");

describe("the quick-look chip", () => {
  it("keeps its label on one line whatever space is left beside the photo", () => {
    const rule = commerce.match(/:root\[data-dna-card=quick-look\] \.menu-item__quick-look\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("white-space:nowrap");
    expect(rule).toContain("width:max-content");
  });
});

// Meathouse 2026-10-20: gallery=stack hid the big photo on every product, but one photo is never stacked, so a
// single-photo product showed an empty frame.
describe("a stacked or mosaic gallery", () => {
  it("hides the big photo only when the stack was drawn", () => {
    expect(commerce).toContain(":root[data-dna-gallery=stack] ${PC} .product-detail__gallery:has(.product-detail__stack) .product-detail__stage");
    expect(commerce).not.toContain(":root[data-dna-gallery=stack] ${PC} .product-detail__stage,");
  });
});
