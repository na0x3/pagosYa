import { test } from "node:test";
import assert from "node:assert/strict";
import { designFocus } from "./design-focus.mjs";

test("only the Studio frame's design-focus message switches full screen", () => {
  assert.equal(designFocus({ data: { type: "pagosya:design-focus", open: true } }, "merchantStudioFrame"), true);
  assert.equal(designFocus({ data: { type: "pagosya:design-focus", open: false } }, "merchantStudioFrame"), false);
  assert.equal(designFocus({ data: { type: "pagosya:design-focus", open: true } }, "storeTemplatesFrame"), null);
  assert.equal(designFocus({ data: { type: "pagosya:workspace" } }, "merchantStudioFrame"), null);
  assert.equal(designFocus({ data: null }, "merchantStudioFrame"), null);
});
