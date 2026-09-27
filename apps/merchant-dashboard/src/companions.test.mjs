import assert from "node:assert/strict";
import test from "node:test";
import { _layout } from "blobatar/internal";
import { EXPRESSION_NAMES, SHAPES } from "@pagosya/blob-characters";
import { ADVENTURE_LEVELS, companionBlobHtml, companionBlobUri, companionSeed } from "./companions.mjs";

test("levels climb in id and xp order, starting free, and match the server thresholds", () => {
  assert.equal(ADVENTURE_LEVELS[0].xpRequired, 0);
  ADVENTURE_LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1);
    if (index) assert.ok(level.xpRequired > ADVENTURE_LEVELS[index - 1].xpRequired, `${level.name} needs more xp than the level before`);
  });
  // apps/api/src/dashboard/merchant-session.service.ts PROGRESS_XP_THRESHOLDS
  assert.deepEqual(ADVENTURE_LEVELS.map((level) => level.xpRequired), [0, 100, 250, 450, 700, 1000, 1400, 1900]);
});

test("every companion is a fixed blob with its own silhouette and a signature expression", () => {
  const shapes = new Set();
  for (const level of ADVENTURE_LEVELS) {
    assert.ok(EXPRESSION_NAMES.includes(level.expression), `${level.character} expression`);
    const layout = _layout(companionSeed(level), { hue: level.look.hue, tone: level.look.tone, traits: { shape: SHAPES[level.look.shape] } });
    assert.equal(layout.shape, level.look.shape, level.character);
    shapes.add(layout.shape);
  }
  assert.equal(shapes.size, ADVENTURE_LEVELS.length);
});

test("companion blobs are decorative, stable and distinct", () => {
  const all = ADVENTURE_LEVELS.map((level) => companionBlobHtml(level));
  assert.equal(new Set(all).size, ADVENTURE_LEVELS.length);
  assert.equal(companionBlobHtml(ADVENTURE_LEVELS[0]), all[0]);
  for (const svg of all) assert.match(svg, /^<svg [^>]*aria-hidden="true"/);
  assert.notEqual(companionBlobHtml(ADVENTURE_LEVELS[0], { expression: "sleepy" }), all[0]);
  assert.match(companionBlobHtml(ADVENTURE_LEVELS[0], { animate: "hover" }), /mo-root/);
  assert.ok(companionBlobUri(ADVENTURE_LEVELS[1]).startsWith("data:image/svg+xml,"));
});
