import assert from "node:assert/strict";
import test from "node:test";
import {
  createStoreEditorStore,
  isStoreEditorDirty,
  isStoreEditorSaving,
  storeEditorFingerprint,
} from "../src/store-editor/state.js";

test("hydrates one authoritative store-scoped snapshot", () => {
  const editor = createStoreEditorStore();
  editor.hydrate("store_1", { document: { title: "Original" } });

  const state = editor.getState();
  assert.equal(state.storeId, "store_1");
  assert.equal(state.revision, 0);
  assert.equal(isStoreEditorDirty(state), false);
  assert.deepEqual(state.snapshot, { document: { title: "Original" } });
});

test("cannot start a save before a store snapshot is hydrated", () => {
  const editor = createStoreEditorStore();

  assert.equal(editor.beginSave(), null);
  assert.equal(isStoreEditorSaving(editor.getState()), false);
});

test("semantic no-op messages do not manufacture revisions", () => {
  const editor = createStoreEditorStore();
  editor.hydrate("store_1", { document: { title: "Original", blocks: ["one"] } });
  editor.replaceDraft("store_1", { document: { blocks: ["one"], title: "Original" } });

  assert.equal(editor.getState().revision, 0);
  assert.equal(isStoreEditorDirty(editor.getState()), false);
  assert.equal(
    storeEditorFingerprint({ document: { title: "Original", blocks: ["one"] } }),
    storeEditorFingerprint({ document: { blocks: ["one"], title: "Original" } }),
  );
});

test("an acknowledged save keeps edits made during the request dirty", () => {
  const editor = createStoreEditorStore();
  editor.hydrate("store_1", { document: { title: "Original" } });
  editor.replaceDraft("store_1", { document: { title: "First edit" } });
  const operation = editor.beginSave();
  assert.ok(operation);
  assert.equal(isStoreEditorSaving(editor.getState()), true);

  editor.replaceDraft("store_1", { document: { title: "Newest edit", x: 24 } });
  editor.acknowledgeSave(operation);
  editor.finishSave(operation);

  assert.equal(isStoreEditorDirty(editor.getState()), true);
  assert.equal(editor.getState().savedRevision, operation.revision);
  assert.deepEqual(editor.getState().snapshot, { document: { title: "Newest edit", x: 24 } });
});

test("a completed save becomes clean when no newer edit exists", () => {
  const editor = createStoreEditorStore();
  editor.hydrate("store_1", { document: { title: "Original" } });
  editor.replaceDraft("store_1", { document: { title: "Saved" } });
  const operation = editor.beginSave();
  assert.ok(operation);

  editor.acknowledgeSave(operation);
  editor.finishSave(operation);

  assert.equal(isStoreEditorDirty(editor.getState()), false);
  assert.equal(isStoreEditorSaving(editor.getState()), false);
});

test("late save acknowledgements cannot change another store", () => {
  const editor = createStoreEditorStore();
  editor.hydrate("store_1", { document: { title: "One" } });
  editor.replaceDraft("store_1", { document: { title: "One edited" } });
  const operation = editor.beginSave();
  assert.ok(operation);

  editor.hydrate("store_2", { document: { title: "Two" } });
  editor.acknowledgeSave(operation);
  editor.finishSave(operation);

  assert.equal(editor.getState().storeId, "store_2");
  assert.equal(isStoreEditorDirty(editor.getState()), false);
  assert.deepEqual(editor.getState().snapshot, { document: { title: "Two" } });
});

test("save failures preserve the draft and allow another attempt", () => {
  const editor = createStoreEditorStore();
  editor.hydrate("store_1", { document: { title: "Original" } });
  editor.replaceDraft("store_1", { document: { title: "Unsaved" } });
  const operation = editor.beginSave();
  assert.ok(operation);
  editor.failSave(operation, new Error("temporary failure"));

  assert.equal(editor.getState().saveStatus, "failed");
  assert.equal(editor.getState().saveError, "temporary failure");
  assert.equal(isStoreEditorDirty(editor.getState()), true);
  assert.ok(editor.beginSave());
});
