import assert from "node:assert/strict";
import test from "node:test";

// Panels moved out of dashboard.js (2026-10-15) touch the page only from create…()/init(), never when imported: each must
// import under Node, with no DOM at all, and export its factory. One row per panel.
const PANELS = [
  ["inbox-panel.mjs", "createInboxPanel"],
  ["discounts-panel.mjs", "createDiscountsPanel"],
];

for (const [file, factory] of PANELS) {
  test(`${file} imports without a DOM and exports ${factory}`, async () => {
    const module = await import(new URL(`../src/${file}`, import.meta.url));
    assert.equal(typeof module[factory], "function");
  });
}
