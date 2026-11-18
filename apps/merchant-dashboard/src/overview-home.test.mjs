import assert from "node:assert/strict";
import test from "node:test";
import { renderStoreCard, renderSuggestions } from "./overview-home.mjs";

test("the store card shows the store, whether it is live, and the two next steps", () => {
  const live = renderStoreCard({ store: { id: "s1", name: "Oh <Belly>", publishedSourceRevision: 26, sourceProject: { revision: 26 } }, state: "published", url: "https://shop.test/s/ohbelly" });
  assert.match(live, /Oh &lt;Belly&gt;/);
  assert.match(live, /Publicada/);
  assert.match(live, /data-thumbnail-store="s1"[^>]*data-thumbnail-revision="26"/);
  assert.match(live, /href="https:\/\/shop\.test\/s\/ohbelly"[^>]*>Ver tienda/);
  assert.match(live, /data-overview-open="workspace"[^>]*>Editar con YAPI/);
  const draft = renderStoreCard({ store: { id: "s2", name: "Gramiyaa", sourceProject: { revision: 8 } }, state: "draft", url: "" });
  assert.match(draft, /Borrador/);
  assert.doesNotMatch(draft, /Ver tienda/);
  assert.equal(renderStoreCard({ store: null }), "");
});

test("YAPI's suggestions are three jobs from Tareas, each opening that page", () => {
  const html = renderSuggestions();
  assert.equal((html.match(/class="suggest-card/g) || []).length, 3);
  assert.match(html, /Revisar y mejorar mi tienda/);
  assert.match(html, /data-overview-open="tasks"/);
});
