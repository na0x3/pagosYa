import assert from "node:assert/strict";
import test from "node:test";
import { settingsOverlayUrl, SETTINGS_SECTIONS } from "../src/settings-overlay.mjs";

test("each Ajustes section opens the Studio's own panel for the selected store", () => {
  assert.deepEqual(SETTINGS_SECTIONS, ["brand", "shipping", "domain"]);
  assert.equal(settingsOverlayUrl("s 1", "shipping"), "/studio/?embedded=1&library=settings&section=shipping&store=s%201");
  assert.throws(() => settingsOverlayUrl("s1", "payouts"), /sección/);
});
