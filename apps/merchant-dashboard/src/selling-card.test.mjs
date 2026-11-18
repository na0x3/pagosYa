import assert from "node:assert/strict";
import test from "node:test";
import { renderSellingCard } from "./selling-card.mjs";

const summary = {
  autoImprove: true,
  trying: { id: "t1", kind: "buyWord", summary: "Botón «Lo quiero»", status: "TRYING", daysLeft: 9 },
  kept: [{ id: "k1", kind: "best", summary: "«Ginger» primero como Más vendido — agregados +12%", status: "KEPT" }],
  undone: [{ id: "u1", kind: "stickyBuy", summary: "Barra de compra fija en la página de producto — no vendió más, lo deshicimos", status: "UNDONE" }],
};

test("«Tu tienda esta semana» names what is being tried, kept and undone, each kept or tried change with «Deshacer»", () => {
  const html = renderSellingCard(summary);
  assert.match(html, /Tu tienda esta semana/);
  assert.match(html, /Probando[\s\S]*Botón «Lo quiero»[\s\S]*9 días/);
  assert.match(html, /Ginger[\s\S]*\+12%/);
  assert.match(html, /no vendió más/);
  assert.equal((html.match(/data-selling-undo="/g) || []).length, 2);
  assert.match(html, /data-selling-undo="t1"/);
  assert.match(html, /data-selling-undo="k1"/);
  assert.match(html, /role="switch"[^>]*aria-checked="true"/);
});

test("with auto-improve off the card says so and offers to switch it on", () => {
  const html = renderSellingCard({ ...summary, autoImprove: false, trying: null });
  assert.match(html, /aria-checked="false"/);
  assert.match(html, /apagada/i);
});

test("a store with nothing yet gets one calm line, and escapes what it shows", () => {
  const html = renderSellingCard({ autoImprove: true, trying: null, kept: [], undone: [] });
  assert.match(html, /Empezamos pronto/);
  assert.doesNotMatch(renderSellingCard({ ...summary, kept: [{ id: "x", summary: "<img onerror=1>", status: "KEPT" }] }), /<img onerror/);
  assert.equal(renderSellingCard(null), "");
});
