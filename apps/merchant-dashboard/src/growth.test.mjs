import { test } from "node:test";
import assert from "node:assert/strict";
import { actionRoute, barWidth, formatCount, formatDelta, formatPercent, linePath, severityLabel, shortDay } from "./growth.mjs";

test("counts and percents read like Bolivian Spanish", () => {
  assert.equal(formatCount(12345), "12.345");
  assert.equal(formatCount(0), "0");
  assert.equal(formatPercent(5.25), "5,3 %");
  assert.equal(formatPercent(null), "—");
});

test("deltas say up, down, equal or new, and conversion moves in points", () => {
  assert.deepEqual(formatDelta({ value: 40, previous: 20, delta: 100, format: "count" }), { text: "+100 %", tone: "up", label: "100 % más que el periodo anterior" });
  assert.deepEqual(formatDelta({ value: 8, previous: 10, delta: -20, format: "count" }), { text: "−20 %", tone: "down", label: "20 % menos que el periodo anterior" });
  assert.deepEqual(formatDelta({ value: 6, previous: 6, delta: 0, format: "count" }), { text: "Igual", tone: "flat", label: "Igual que el periodo anterior" });
  assert.deepEqual(formatDelta({ value: 3, previous: 0, delta: null, format: "count" }), { text: "Nuevo", tone: "new", label: "No hubo en el periodo anterior" });
  assert.deepEqual(formatDelta({ value: 0, previous: 0, delta: null, format: "count" }), { text: "—", tone: "none", label: "Sin datos para comparar" });
  assert.deepEqual(formatDelta({ value: 5.4, previous: 5, delta: 0.4, format: "percent" }), { text: "+0,4 pts", tone: "up", label: "0,4 puntos más que el periodo anterior" });
  assert.deepEqual(formatDelta({ value: null, previous: 5, delta: null, format: "percent" }), { text: "—", tone: "none", label: "Sin datos para comparar" });
});

test("a line path scales to the largest value and stays flat at the baseline for an empty series", () => {
  const line = linePath([0, 5, 10], 200, 100, 10);
  assert.equal(line.max, 10);
  assert.equal(line.d, "M10 90 L100 50 L190 10");
  assert.equal(linePath([0, 0, 0], 200, 100, 10).d, "M10 90 L100 90 L190 90");
  assert.equal(linePath([4], 200, 100, 10).d, "M10 10 L190 10");
  assert.equal(linePath([], 200, 100, 10).d, "");
  // A shared maximum keeps two periods on one scale.
  assert.equal(linePath([0, 5], 200, 100, 10, 10).d, "M10 90 L190 50");
});

test("bars never vanish for a small non-zero value", () => {
  assert.equal(barWidth(0, 10), 0);
  assert.equal(barWidth(1, 1000), 2);
  assert.equal(barWidth(5, 10), 50);
  assert.equal(barWidth(3, 0), 0);
});

test("severity and day labels", () => {
  assert.equal(severityLabel("high"), "Urgente");
  assert.equal(severityLabel("medium"), "Importante");
  assert.equal(severityLabel("low"), "Oportunidad");
  assert.equal(shortDay("2026-09-05"), "5 sep");
});

test("every action kind routes to the screen that does it, prefilled", () => {
  assert.deepEqual(actionRoute({ kind: "yapi", payload: { instruction: "Mejora el carrito" } }), { view: "workspace", compose: "Mejora el carrito" });
  assert.deepEqual(actionRoute({ kind: "product", payload: { productId: "p1", step: "photos" } }), { view: "products", productId: "p1", step: "photos" });
  assert.deepEqual(actionRoute({ kind: "product", payload: { productId: "p1", step: "nope" } }), { view: "products", productId: "p1", step: null });
  assert.deepEqual(actionRoute({ kind: "stock", payload: { productId: "p2" } }), { view: "products", productId: "p2", step: "stock" });
  assert.deepEqual(actionRoute({ kind: "proposal", payload: { prompt: "Propuesta para…" } }), { view: "proposals", brief: "Propuesta para…" });
  assert.deepEqual(actionRoute({ kind: "promo", payload: { code: "INSTAGRAM" } }), { view: "discounts", code: "INSTAGRAM" });
  assert.deepEqual(actionRoute({ kind: "promo", payload: { code: "<b>" } }), { view: "discounts", code: "" });
  assert.deepEqual(actionRoute({ kind: "settings", payload: { view: "store-settings", section: "policies" } }), { view: "store-settings", section: "policies" });
  assert.deepEqual(actionRoute({ kind: "settings", payload: { view: "compliance" } }), { view: "compliance", section: null });
  assert.deepEqual(actionRoute({ kind: "settings", payload: { view: "payouts" } }), null);
  assert.deepEqual(actionRoute({ kind: "inbox", payload: {} }), { view: "inbox" });
  assert.equal(actionRoute({ kind: "yapi", payload: {} }), null);
  assert.equal(actionRoute({ kind: "launch-rockets", payload: {} }), null);
  assert.equal(actionRoute(null), null);
});
