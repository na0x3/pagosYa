// @ts-check

/** @typedef {Record<string, unknown> | null} StoreEditorSnapshot */
/** @typedef {"idle" | "saving" | "failed"} StoreEditorSaveStatus */

/**
 * @typedef {object} StoreEditorSaveOperation
 * @property {number} token
 * @property {string | null} storeId
 * @property {number} revision
 * @property {string} fingerprint
 * @property {StoreEditorSnapshot} snapshot
 */

/**
 * @typedef {object} StoreEditorState
 * @property {string | null} storeId
 * @property {StoreEditorSnapshot} snapshot
 * @property {string} fingerprint
 * @property {string} savedFingerprint
 * @property {number} revision
 * @property {number} savedRevision
 * @property {StoreEditorSaveStatus} saveStatus
 * @property {StoreEditorSaveOperation | null} activeSave
 * @property {string} saveError
 */

/**
 * @typedef {{ type: "hydrate", storeId: string | null, snapshot: StoreEditorSnapshot }
 * | { type: "replace-draft", storeId: string | null, snapshot: StoreEditorSnapshot }
 * | { type: "mark-clean" }
 * | { type: "begin-save", operation: StoreEditorSaveOperation }
 * | { type: "acknowledge-save", operation: StoreEditorSaveOperation }
 * | { type: "finish-save", operation: StoreEditorSaveOperation }
 * | { type: "fail-save", operation: StoreEditorSaveOperation, error: string }} StoreEditorCommand
 */

/** @param {StoreEditorSnapshot} snapshot @returns {StoreEditorSnapshot} */
function cloneSnapshot(snapshot) {
  if (snapshot === null) return null;
  return typeof structuredClone === "function"
    ? structuredClone(snapshot)
    : JSON.parse(JSON.stringify(snapshot));
}

/** @param {unknown} value @returns {unknown} */
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

/** @param {StoreEditorSnapshot} snapshot Return a deterministic semantic identity for a draft snapshot. */
export function storeEditorFingerprint(snapshot) {
  return JSON.stringify(canonicalValue(snapshot));
}

/** @returns {StoreEditorState} */
export function createStoreEditorState() {
  const fingerprint = storeEditorFingerprint(null);
  return {
    storeId: null,
    snapshot: null,
    fingerprint,
    savedFingerprint: fingerprint,
    revision: 0,
    savedRevision: 0,
    saveStatus: "idle",
    activeSave: null,
    saveError: "",
  };
}

/**
 * Pure state transition function. DOM, iframe and HTTP adapters dispatch the
 * same commands so none of them can independently decide whether a draft is
 * saved, dirty or safe to replace.
 * @param {StoreEditorState} state
 * @param {StoreEditorCommand} command
 * @returns {StoreEditorState}
 */
export function reduceStoreEditorState(state, command) {
  if (command.type === "hydrate") {
    const snapshot = cloneSnapshot(command.snapshot);
    const fingerprint = storeEditorFingerprint(snapshot);
    return {
      storeId: command.storeId,
      snapshot,
      fingerprint,
      savedFingerprint: fingerprint,
      revision: 0,
      savedRevision: 0,
      saveStatus: "idle",
      activeSave: null,
      saveError: "",
    };
  }

  if (command.type === "replace-draft") {
    if (command.storeId !== state.storeId) return state;
    const snapshot = cloneSnapshot(command.snapshot);
    const fingerprint = storeEditorFingerprint(snapshot);
    return {
      ...state,
      snapshot,
      fingerprint,
      revision: fingerprint === state.fingerprint ? state.revision : state.revision + 1,
      saveError: "",
    };
  }

  if (command.type === "mark-clean") {
    return {
      ...state,
      savedFingerprint: state.fingerprint,
      savedRevision: state.revision,
      saveStatus: "idle",
      activeSave: null,
      saveError: "",
    };
  }

  if (command.type === "begin-save") {
    if (command.operation.storeId !== state.storeId || state.saveStatus === "saving") return state;
    return { ...state, saveStatus: "saving", activeSave: command.operation, saveError: "" };
  }

  const isActiveOperation = state.activeSave?.token === command.operation.token
    && state.activeSave.storeId === command.operation.storeId;
  if (!isActiveOperation) return state;

  if (command.type === "acknowledge-save") {
    return {
      ...state,
      savedFingerprint: command.operation.fingerprint,
      savedRevision: Math.max(state.savedRevision, Math.min(command.operation.revision, state.revision)),
    };
  }

  if (command.type === "finish-save") {
    return { ...state, saveStatus: "idle", activeSave: null, saveError: "" };
  }

  return {
    ...state,
    saveStatus: "failed",
    activeSave: null,
    saveError: command.error,
  };
}

/** @param {StoreEditorState} state */
export function isStoreEditorDirty(state) {
  return state.fingerprint !== state.savedFingerprint;
}

/** @param {StoreEditorState} state */
export function isStoreEditorSaving(state) {
  return state.saveStatus === "saving";
}

export function createStoreEditorStore() {
  /** @type {StoreEditorState} */
  let state = createStoreEditorState();
  let nextSaveToken = 1;
  /** @type {Set<(state: StoreEditorState) => void>} */
  const listeners = new Set();

  /** @param {StoreEditorCommand} command */
  const dispatch = (command) => {
    const nextState = reduceStoreEditorState(state, command);
    if (nextState === state) return state;
    state = nextState;
    listeners.forEach((listener) => listener(state));
    return state;
  };

  return Object.freeze({
    getState: () => state,
    /** @param {(state: StoreEditorState) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** @param {string | null} storeId @param {StoreEditorSnapshot} snapshot */
    hydrate(storeId, snapshot) {
      return dispatch({ type: "hydrate", storeId, snapshot });
    },
    /** @param {string | null} storeId @param {StoreEditorSnapshot} snapshot */
    replaceDraft(storeId, snapshot) {
      return dispatch({ type: "replace-draft", storeId, snapshot });
    },
    markClean() {
      return dispatch({ type: "mark-clean" });
    },
    beginSave() {
      if (state.saveStatus === "saving" || !state.storeId || !state.snapshot) return null;
      /** @type {StoreEditorSaveOperation} */
      const operation = Object.freeze({
        token: nextSaveToken++,
        storeId: state.storeId,
        revision: state.revision,
        fingerprint: state.fingerprint,
        snapshot: cloneSnapshot(state.snapshot),
      });
      dispatch({ type: "begin-save", operation });
      return operation;
    },
    /** @param {StoreEditorSaveOperation} operation */
    acknowledgeSave(operation) {
      return dispatch({ type: "acknowledge-save", operation });
    },
    /** @param {StoreEditorSaveOperation} operation */
    finishSave(operation) {
      return dispatch({ type: "finish-save", operation });
    },
    /** @param {StoreEditorSaveOperation} operation @param {unknown} error */
    failSave(operation, error) {
      const message = error instanceof Error ? error.message : String(error || "No se pudieron guardar los cambios");
      return dispatch({ type: "fail-save", operation, error: message });
    },
  });
}
