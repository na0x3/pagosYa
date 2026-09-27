import assert from "node:assert/strict";
import test from "node:test";
import { _layout } from "blobatar/internal";
import { EXPRESSION_NAMES, SHAPES, blobCacheSize, blobDataUri, blobSvg } from "../render.mjs";

test("the same seed always renders the same blob, and different seeds differ", () => {
  assert.equal(blobSvg("u1:7"), blobSvg("u1:7"));
  assert.notEqual(blobSvg("u1:7"), blobSvg("u1:8"));
  assert.notEqual(blobSvg("u1:7"), blobSvg("u2:7"));
});

test("all 14 expressions render and change the figure", () => {
  assert.equal(EXPRESSION_NAMES.length, 14);
  const idle = blobSvg("seed", { expression: "idle" });
  for (const name of EXPRESSION_NAMES.filter((name) => name !== "idle")) assert.notEqual(blobSvg("seed", { expression: name }), idle, name);
  assert.throws(() => blobSvg("seed", { expression: "dancing" }), /Unknown blob expression/);
  assert.throws(() => blobSvg("seed", { expression: "toString" }), /Unknown blob expression/);
});

test("a look pins the silhouette whatever the seed", () => {
  for (const [shape, position] of Object.entries(SHAPES)) {
    for (const seed of ["a", "b", "c"]) assert.equal(_layout(seed, { traits: { shape: position } }).shape, shape, `${shape} from ${seed}`);
  }
  assert.throws(() => blobSvg("seed", { look: { shape: "star" } }), /Unknown blob shape/);
});

test("a titled blob is a named image; the title is escaped", () => {
  const svg = blobSvg("seed", { title: ' Ana <b>"Jefa"</b> ' });
  assert.match(svg, /^<svg [^>]*role="img"/);
  assert.match(svg, /<title>Ana &lt;b&gt;&quot;Jefa&quot;&lt;\/b&gt;<\/title>/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test("an untitled or blank-titled blob is decorative", () => {
  for (const title of [undefined, "", "   "]) {
    const svg = blobSvg("seed", { title });
    assert.match(svg, /^<svg [^>]*aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(svg, /<title>|role="img"/);
  }
});

test("a plate puts a circle behind the figure", () => {
  assert.match(blobSvg("seed", { plate: true }), /<path class="blob-plate" d="M100 50C/);
  assert.doesNotMatch(blobSvg("seed"), /blob-plate/);
});

test("static markup has no motion layer; animated markup has it and keeps the figure identical across expressions", () => {
  assert.doesNotMatch(blobSvg("seed"), /mo-root|style=/);
  const idle = blobSvg("seed", { animate: "always" });
  const happy = blobSvg("seed", { animate: "always", expression: "happy" });
  assert.match(idle, /<g class="mo-root mo-always">/);
  assert.match(happy, /<g class="mo-root mo-always mo-expr">/);
  assert.match(happy, / style="--mo-phase:/);
  const figure = (svg) => svg.slice(svg.indexOf("<g class="));
  assert.equal(figure(idle).replace(/^<g class="[^"]*">/, ""), figure(happy).replace(/^<g class="[^"]*">/, ""));
});

test("eyes keep contrast against the body for any seed and any tone", () => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (let index = 1; index <= 300; index++) {
    for (const tone of [undefined, 0, 0.4, 0.75, 0.999]) {
      const { palette } = _layout(`contrast:${index}`, tone === undefined ? {} : { tone });
      assert.ok(ratio(palette.head, palette.eye) >= 4.5, `seed ${index} tone ${tone}: ${palette.head} vs ${palette.eye}`);
    }
  }
});

test("rendering is memoized and the memo stays bounded", () => {
  for (let index = 0; index < 600; index++) blobSvg(`crowd:${index}`);
  assert.ok(blobCacheSize() <= 256);
  const first = blobSvg("crowd:599");
  assert.equal(blobSvg("crowd:599"), first);
});

test("a data URI carries the same static, decorative markup", () => {
  const uri = blobDataUri("seed", { plate: true });
  assert.ok(uri.startsWith("data:image/svg+xml,"));
  const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
  assert.equal(svg, blobSvg("seed", { plate: true }));
  assert.doesNotMatch(uri, /["'<>]/);
});
