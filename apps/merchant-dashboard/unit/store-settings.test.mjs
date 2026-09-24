import assert from "node:assert/strict";
import test from "node:test";
import { hasUsableWhatsAppPhone, isSupportedMapUrl, normalizedMapUrl } from "../src/store-settings.mjs";

test("a WhatsApp number needs 7 to 15 digits, ignoring spaces and symbols", () => {
  assert.equal(hasUsableWhatsAppPhone("+591 712-34567"), true);
  assert.equal(hasUsableWhatsAppPhone("123456"), false);
  assert.equal(hasUsableWhatsAppPhone("+1 234 567 890 123 456"), false);
  assert.equal(hasUsableWhatsAppPhone(""), false);
});

test("a pasted Google Maps iframe becomes its embed URL", () => {
  const iframe = '<iframe src="https://www.google.com/maps/embed?pb=!1m18&amp;hl=es" width="600"></iframe>';
  assert.equal(normalizedMapUrl(iframe), "https://www.google.com/maps/embed?pb=!1m18&hl=es");
  assert.equal(normalizedMapUrl("  "), null);
});

test("only https Google Maps and OpenStreetMap embeds are accepted", () => {
  assert.equal(isSupportedMapUrl(""), true);
  assert.equal(isSupportedMapUrl("https://www.google.com/maps/embed?pb=x"), true);
  assert.equal(isSupportedMapUrl("https://www.openstreetmap.org/export/embed.html?bbox=1"), true);
  assert.equal(isSupportedMapUrl("https://maps.google.com/maps?q=la+paz"), false);
  assert.equal(isSupportedMapUrl("http://www.google.com/maps/embed?pb=x"), false);
  assert.equal(isSupportedMapUrl("https://evil.example/maps/embed"), false);
  assert.equal(isSupportedMapUrl("not a url"), false);
});
