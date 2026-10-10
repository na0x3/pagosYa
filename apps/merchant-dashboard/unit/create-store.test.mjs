import assert from "node:assert/strict";
import test from "node:test";
import { createStoreBody } from "../src/create-store.mjs";

const file = (size) => ({ size, name: "logo.png" });

test("without a logo the store is created by name only", async () => {
  assert.deepEqual(await createStoreBody("Eje", undefined, async () => { throw new Error("no"); }), { body: { name: "Eje" }, warning: null });
});
test("an uploaded logo is sent with the new store", async () => {
  assert.deepEqual(await createStoreBody("Eje", file(1000), async () => "/v1/uploads/abc.png"), { body: { name: "Eje", logoUrl: "/v1/uploads/abc.png" }, warning: null });
});
test("a failed or oversized upload never blocks creating the store", async () => {
  const failed = await createStoreBody("Eje", file(1000), async () => { throw new Error("red caída"); });
  assert.deepEqual(failed.body, { name: "Eje" });
  assert.match(failed.warning, /sin logo/);
  const big = await createStoreBody("Eje", file(9_000_000), async () => "/v1/uploads/abc.png");
  assert.deepEqual(big.body, { name: "Eje" });
  assert.match(big.warning, /8 MB/);
});

test("the logo warning is shown after the dashboard refreshes, which clears the error line", async () => {
  const { readFileSync } = await import("node:fs");
  const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
  const handler = dashboard.slice(dashboard.indexOf('getElementById("createStoreForm").addEventListener("submit"'));
  const body = handler.slice(0, handler.indexOf("\n  });\n"));
  const shown = body.indexOf("errorEl.textContent = warning");
  assert.ok(shown > 0);
  assert.ok(shown > body.lastIndexOf("await refresh()"), "refresh() clears errorEl, so the warning must be written after it");
});
