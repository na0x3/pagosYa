import assert from "node:assert/strict";
import test from "node:test";
import { MAX_VARIATION, normalizeVariation, profileBlobHtml, profileBlobSeed, profileBlobUri, randomVariation, variationChoices } from "./profile-blob.mjs";

test("variations are integers 1–999; stored animal ids 1–4 stay valid; anything else is 1", () => {
  for (const kept of [1, 2, 3, 4, 500, 999]) assert.equal(normalizeVariation(kept), kept);
  assert.equal(normalizeVariation("4"), 4);
  assert.equal(normalizeVariation("777"), 777);
  for (const bad of [0, 1000, -1, 2.5, "x", "", null, undefined, NaN, Infinity, '1" onerror="alert(1)']) assert.equal(normalizeVariation(bad), 1, String(bad));
  assert.equal(MAX_VARIATION, 999);
});

test("a random variation stays in range and skips the excluded ones", () => {
  assert.equal(randomVariation([], () => 0), 1);
  assert.equal(randomVariation([], () => 0.9999999), 999);
  assert.equal(randomVariation([1], () => 0), 2);
  for (let index = 0; index < 200; index++) {
    const value = randomVariation([5, 6]);
    assert.ok(Number.isInteger(value) && value >= 1 && value <= 999 && value !== 5 && value !== 6);
  }
});

test("the editor offers the current variation first plus three different ones", () => {
  for (const current of [1, 3, 999]) {
    const choices = variationChoices(current);
    assert.equal(choices.length, 4);
    assert.equal(choices[0], current);
    assert.equal(new Set(choices).size, 4);
    for (const choice of choices) assert.ok(choice >= 1 && choice <= 999);
  }
  assert.equal(variationChoices("nonsense")[0], 1);
});

test("the seed joins the API seed and the normalized variation", () => {
  assert.equal(profileBlobSeed("Ab_12", 7), "Ab_12:7");
  assert.equal(profileBlobSeed("Ab_12", 5000), "Ab_12:1");
});

test("the profile picture is named by the profile name, and 'Mi perfil' when there is none", () => {
  assert.match(profileBlobHtml({ blobSeed: "s", variation: 2, name: "  Ana  " }), /role="img"[^>]*><title>Ana<\/title>/);
  for (const name of ["", "   ", null, undefined]) assert.match(profileBlobHtml({ blobSeed: "s", variation: 2, name }), /<title>Mi perfil<\/title>/);
  assert.match(profileBlobHtml({ blobSeed: "s", variation: 2, name: "<img src=x onerror=alert(1)>" }), /<title>&lt;img src=x onerror=alert\(1\)&gt;<\/title>/);
});

test("decorative blobs are hidden from assistive tech; every blob has a plate", () => {
  const svg = profileBlobHtml({ blobSeed: "s", variation: 2, name: "Ana", decorative: true });
  assert.match(svg, /aria-hidden="true"/);
  assert.doesNotMatch(svg, /<title>/);
  assert.match(svg, /class="blob-plate"/);
});

test("each variation is a different blob, and the same variation is always the same one", () => {
  const html = (variation) => profileBlobHtml({ blobSeed: "seed-A", variation, decorative: true });
  assert.notEqual(html(1), html(2));
  assert.equal(html(3), html("3"));
  assert.notEqual(profileBlobHtml({ blobSeed: "seed-B", variation: 1, decorative: true }), html(1));
});

test("the seed never appears in the markup", () => {
  const html = profileBlobHtml({ blobSeed: "SECRETSEED123", variation: 9, name: "Ana" });
  assert.doesNotMatch(html, /SECRETSEED123/);
  assert.doesNotMatch(decodeURIComponent(profileBlobUri("SECRETSEED123", 9)), /SECRETSEED123/);
});

test("without a seed yet, a placeholder holds the space and keeps the accessible name", () => {
  assert.equal(profileBlobHtml({ blobSeed: "", variation: 2, name: "Ana" }), '<span class="blob-avatar-pending" role="img" aria-label="Ana"></span>');
  assert.equal(profileBlobHtml({ blobSeed: null, variation: 2, name: "", decorative: true }), '<span class="blob-avatar-pending" aria-hidden="true"></span>');
});
