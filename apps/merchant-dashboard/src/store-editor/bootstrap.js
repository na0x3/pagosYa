const root = /** @type {any} */ (globalThis);

Promise.all([import("./state.js"), import("./commands.js"), import("./persistence.js"), import("./selection.js")])
  .then(([storeEditorState, storeEditorCommands, storeEditorPersistence, storeEditorSelection]) => root.__resolvePagosYaStoreEditor?.({
    ...storeEditorState,
    ...storeEditorCommands,
    ...storeEditorPersistence,
    ...storeEditorSelection,
  }))
  .catch((error) => root.__rejectPagosYaStoreEditor?.(error))
  .finally(() => {
    delete root.__resolvePagosYaStoreEditor;
    delete root.__rejectPagosYaStoreEditor;
  });
