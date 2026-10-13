import { test } from "node:test";
import assert from "node:assert/strict";
import { REMINDER_LABEL, SOURCE_LABEL, anonymousLine, cartItemsText, cartPerson, followUpMessage, followUpSubject, mailtoFollowUpUrl, showsReminder, timeAgo, whatsAppFollowUpUrl } from "./abandoned-carts.mjs";

const cart = { key: "email:ana@example.com", source: "payment", name: "Ana Rojas", email: "ana@example.com", phone: "70000001", items: [{ name: "Café", variant: null, quantity: 2 }, { name: "Té", variant: "Grande", quantity: 1 }], total: 2500, currency: "BOB", leftAt: "2026-10-13T09:00:00.000Z", reminder: "none", recoverUrl: null, storeUrl: "https://pay.test/s/casa-luz" };

test("a row is named by name, else email, else phone", () => {
  assert.equal(cartPerson(cart), "Ana Rojas");
  assert.equal(cartPerson({ ...cart, name: " " }), "ana@example.com");
  assert.equal(cartPerson({ ...cart, name: null, email: null }), "70000001");
});

test("items read as product ×n with the option", () => {
  assert.equal(cartItemsText(cart.items), "Café ×2, Té (Grande) ×1");
  assert.equal(cartItemsText(undefined), "");
});

test("time reads like «hace 3 h»", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  assert.equal(timeAgo("2026-10-13T11:58:00Z", now), "hace 2 min");
  assert.equal(timeAgo("2026-10-13T09:00:00Z", now), "hace 3 h");
  assert.equal(timeAgo("2026-10-12T10:00:00Z", now), "hace 1 día");
  assert.equal(timeAgo("2026-10-08T12:00:00Z", now), "hace 5 días");
});

test("the follow-up names the shopper, the items and the store, and links the restore link or else the store", () => {
  assert.equal(followUpMessage(cart, "Casa Luz"), "Hola Ana, vimos que dejaste Café ×2, Té (Grande) ×1 en Casa Luz. ¿Te ayudamos a terminar tu compra? https://pay.test/s/casa-luz");
  assert.equal(followUpMessage({ ...cart, name: null, recoverUrl: "https://pay.test/s/casa-luz?recover=abc" }, "Casa Luz"), "Hola, vimos que dejaste Café ×2, Té (Grande) ×1 en Casa Luz. ¿Te ayudamos a terminar tu compra? https://pay.test/s/casa-luz?recover=abc");
  assert.equal(followUpSubject("Casa Luz"), "Tu carrito en Casa Luz");
});

test("WhatsApp gets 591 for a local number and the message; nothing without a phone", () => {
  const url = whatsAppFollowUpUrl(cart, "Casa Luz");
  assert.ok(url.startsWith("https://wa.me/59170000001?text="));
  assert.equal(decodeURIComponent(url.split("?text=")[1]), followUpMessage(cart, "Casa Luz"));
  assert.ok(whatsAppFollowUpUrl({ ...cart, phone: "+54 9 11 5555 5555" }, "Casa Luz").startsWith("https://wa.me/5491155555555?text="));
  assert.equal(whatsAppFollowUpUrl({ ...cart, phone: null }, "Casa Luz"), "");
});

test("the email link carries the same subject and message; nothing without an email", () => {
  const url = mailtoFollowUpUrl(cart, "Casa Luz");
  assert.ok(url.startsWith("mailto:ana@example.com?subject="));
  const params = new URLSearchParams(url.split("?")[1]);
  assert.equal(params.get("subject"), "Tu carrito en Casa Luz");
  assert.equal(params.get("body"), followUpMessage(cart, "Casa Luz"));
  assert.equal(mailtoFollowUpUrl({ ...cart, email: null }, "Casa Luz"), "");
});

test("labels, and the reminder pill only on saved carts and on payments that have one", () => {
  assert.equal(SOURCE_LABEL.payment, "Generó el QR / pulsó Pagar");
  assert.equal(SOURCE_LABEL.saved, "Guardó su carrito");
  assert.deepEqual(REMINDER_LABEL, { scheduled: "Recordatorio programado", sent: "Recordatorio enviado", none: "Sin recordatorio" });
  assert.equal(showsReminder(cart), false);
  assert.equal(showsReminder({ ...cart, recoverUrl: "https://pay.test/s/casa-luz?recover=abc", reminder: "sent" }), true);
  assert.equal(showsReminder({ ...cart, source: "saved", reminder: "none" }), true);
});

test("the anonymous line counts visits in Bolivian Spanish", () => {
  assert.equal(anonymousLine(1), "1 visita dejó su carrito sin dejar contacto");
  assert.equal(anonymousLine(0), "0 visitas dejaron su carrito sin dejar contacto");
  assert.equal(anonymousLine(1240), "1.240 visitas dejaron su carrito sin dejar contacto");
});
