import { test } from "node:test";
import assert from "node:assert/strict";
import { storeSummary, mascotSvg, renderMascotCards, renderMascotBubbles } from "./store-mascots.mjs";

// Spec 2026-11-16 (owner: «little mascots to give a resume of the store»): YAPI's star family, real numbers, friendly words.
const money = (cents) => (cents / 100).toFixed(2) + " BOB";
const hidden = () => "•••••• BOB";
const finances = (over = {}) => ({ monthlyProjection: { monthToDateRevenue: 0 }, paymentCount: 0, totalStoreViews: 0, ...over });
const byKind = (items) => Object.fromEntries(items.map((item) => [item.kind, item]));

test("nothing until the finances arrive — no made-up zeros", () => {
  assert.deepEqual(storeSummary({ finances: null, money }), []);
});

test("a brand-new store: three sleepy mascots and a happy stock one", () => {
  const items = byKind(storeSummary({ finances: finances(), money, lowStock: [], steps: [] }));
  assert.deepEqual(Object.keys(items), ["sales", "orders", "visits", "stock"]);
  assert.equal(items.sales.mood, "sleepy");
  assert.equal(items.sales.text, "Aún no hay ventas este mes. Comparte tu tienda para recibir la primera.");
  assert.equal(items.orders.text, "Tu primer pago aparecerá aquí.");
  assert.equal(items.visits.text, "Nadie visitó tu tienda todavía.");
  assert.deepEqual([items.stock.mood, items.stock.text], ["happy", "Todo al día: nada por reponer."]);
});

test("sales, payments and visits in real numbers with the right plural", () => {
  const one = byKind(storeSummary({ finances: finances({ monthlyProjection: { monthToDateRevenue: 75030 }, paymentCount: 1, totalStoreViews: 1 }), money }));
  assert.deepEqual([one.sales.mood, one.sales.text, one.sales.view], ["happy", "Este mes vendiste 750.30 BOB.", "payouts"]);
  assert.equal(one.orders.text, "1 pago exitoso desde que empezaste.");
  assert.equal(one.visits.text, "1 visita a tu tienda.");
  const many = byKind(storeSummary({ finances: finances({ paymentCount: 2, totalStoreViews: 12 }), money }));
  assert.equal(many.orders.text, "2 pagos exitosos desde que empezaste.");
  assert.equal(many.visits.text, "12 visitas a tu tienda.");
});

test("hidden amounts stay hidden", () => {
  const items = byKind(storeSummary({ finances: finances({ monthlyProjection: { monthToDateRevenue: 75030 } }), money: hidden }));
  assert.equal(items.sales.text, "Este mes vendiste •••••• BOB.");
});

test("stock: low stock first, else the next setup step, both worried", () => {
  const low = [{ id: "a", name: "Set de Seda", stock: 0 }, { id: "b", name: "Vela", stock: 1 }, { id: "c", name: "Taza", stock: 2 }];
  const steps = [{ id: "kyc", label: "Verifica tu negocio", done: true, view: "compliance" }, { id: "invoicing", label: "Configura la facturación (SIN)", done: false, view: "compliance" }];
  const stock = byKind(storeSummary({ finances: finances(), money, lowStock: low, steps })).stock;
  assert.deepEqual([stock.mood, stock.text, stock.view], ["worried", "3 productos casi agotados: Set de Seda.", "products"]);
  assert.equal(byKind(storeSummary({ finances: finances(), money, lowStock: low.slice(0, 1) })).stock.text, "1 producto casi agotado: Set de Seda.");
  const step = byKind(storeSummary({ finances: finances(), money, lowStock: [], steps })).stock;
  assert.deepEqual([step.mood, step.text, step.view], ["worried", "Te falta: Configura la facturación (SIN).", "compliance"]);
});

test("each mood draws a different face, and names are escaped", () => {
  const faces = ["happy", "sleepy", "worried"].map((mood) => mascotSvg("sales", mood));
  assert.equal(new Set(faces).size, 3);
  assert.match(faces[0], /<svg class="mascot mascot--sales is-happy"[^>]*aria-hidden="true"/);
  const html = renderMascotCards(storeSummary({ finances: finances(), money, lowStock: [{ id: "x", name: "<b>Pan & Té</b>", stock: 1 }] }));
  assert.doesNotMatch(html, /<b>Pan/);
  assert.match(html, /&lt;b&gt;Pan &amp; Té&lt;\/b&gt;/);
  assert.match(html, /<a class="mascot-link" href="#dashboard-products" data-dashboard-view="products">/);
});

test("the welcome shows at most three bubbles, the worried one first", () => {
  const items = storeSummary({ finances: finances({ paymentCount: 2 }), money, lowStock: [{ id: "a", name: "Vela", stock: 1 }] });
  const html = renderMascotBubbles(items);
  assert.equal((html.match(/class="mascot-bubble /g) || []).length, 3);
  assert.ok(html.indexOf("casi agotado") < html.indexOf("pagos exitosos"), "worried before happy");
  assert.equal(renderMascotBubbles([]), "");
});
