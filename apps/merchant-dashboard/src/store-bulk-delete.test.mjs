import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkDeleteSummary, confirmationReady, deleteStores } from "./store-bulk-delete.mjs";

test("one store needs no typed word; several need ELIMINAR", () => {
  assert.equal(confirmationReady("", 1), true);
  assert.equal(confirmationReady("", 2), false);
  assert.equal(confirmationReady("eliminar", 2), false);
  assert.equal(confirmationReady(" ELIMINAR ", 3), true);
  assert.equal(confirmationReady("ELIMINAR", 0), false);
});

test("deletes one store at a time and skips the ones the server refuses, with its reason", async () => {
  const calls = [];
  let running = 0;
  const remove = async id => {
    running += 1; assert.equal(running, 1); calls.push(id);
    await Promise.resolve();
    running -= 1;
    if (id === "b") throw new Error("Archiva esta tienda para conservar el registro y los pagos de sus dominios.");
  };
  const result = await deleteStores(["a", "b", "c"], remove);
  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.deepEqual(result, { deleted: ["a", "c"], skipped: [{ id: "b", reason: "Archiva esta tienda para conservar el registro y los pagos de sus dominios." }] });
});

test("reports progress after each store", async () => {
  const seen = [];
  await deleteStores(["a", "b"], async () => {}, (done, total) => seen.push([done, total]));
  assert.deepEqual(seen, [[1, 2], [2, 2]]);
});

test("the summary names every skipped store and its reason", () => {
  const names = new Map([["a", "Uno"], ["b", "Dos"], ["c", "Tres"]]);
  assert.deepEqual(bulkDeleteSummary({ deleted: ["a", "c"], skipped: [{ id: "b", reason: "Tiene un dominio." }] }, names), {
    title: "Se eliminaron 2 · 1 no se eliminó",
    skipped: [{ id: "b", name: "Dos", reason: "Tiene un dominio." }],
  });
  assert.equal(bulkDeleteSummary({ deleted: ["a"], skipped: [] }, names).title, "Se eliminó 1 tienda");
  assert.equal(bulkDeleteSummary({ deleted: [], skipped: [{ id: "a", reason: "x" }, { id: "b", reason: "y" }] }, names).title, "2 no se eliminaron");
});
