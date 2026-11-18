import assert from "node:assert/strict";
import test from "node:test";
import { TAREAS, renderTareas, runningLine } from "./tareas.mjs";

test("the catalogue has the eight YAPI jobs with minutes, credits and what «Empezar» does", () => {
  assert.deepEqual(TAREAS.map((t) => t.id), ["design", "review", "product", "cutouts", "emails", "popup", "abtest", "selling"]);
  assert.deepEqual(TAREAS.map((t) => t.credits), ["500 créditos", "250 créditos", "150 créditos", "30 créditos", "80 créditos", "50 créditos", "100 créditos", "Incluida en Pro"]);
  for (const t of TAREAS) {
    assert.ok(t.name && t.promise && t.minutes && t.picture.startsWith("<svg"), t.id);
    assert.ok(["build", "look", "yapi", "view"].includes(t.action), t.id);
    if (t.action === "yapi") assert.ok(t.request.length > 20, t.id);
  }
});

test("each card shows its picture, name, promise, time, credits and «Empezar»", () => {
  const html = renderTareas({});
  assert.equal((html.match(/class="tarea-card/g) || []).length, 8);
  assert.match(html, /Diseño de portada[\s\S]*20–40 min[\s\S]*500 créditos[\s\S]*data-tarea="design"[^>]*>Empezar/);
  assert.match(html, /data-tarea="selling"[^>]*>Ver esta semana/);
});

test("a running build shows on the card that started it, with minutes, and the others wait", () => {
  const now = new Date("2026-11-16T10:12:00Z");
  const run = { status: "RUNNING", startedAt: "2026-11-16T10:00:00Z" };
  assert.equal(runningLine(run, now), "YAPI trabaja · 12 min");
  const html = renderTareas({ run, startedCard: "review", now });
  assert.match(html, /data-card="review"[^]*?YAPI trabaja · 12 min/);
  assert.match(html, /data-tarea="design"[^>]*disabled/);
  const done = renderTareas({ run: { status: "DONE", startedAt: "2026-11-16T10:00:00Z", revision: 12 }, startedCard: "design", now });
  assert.match(done, /data-card="design"[^]*?Listo[^]*?data-tarea-open/);
});
