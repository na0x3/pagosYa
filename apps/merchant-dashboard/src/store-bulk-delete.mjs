import { escapeHtml as esc } from "./html.mjs";

/** One store is confirmed by the button alone; several need the typed word, a bulk mistake costs more. */
export function confirmationReady(text, count) {
  if (count < 1) return false;
  return count === 1 || String(text ?? "").trim() === "ELIMINAR";
}

/**
 * Deletes through the single-store endpoint, one at a time, so every server check still applies.
 * A store the server refuses (domains, store credit, digital goods) is skipped with its reason.
 */
export async function deleteStores(ids, remove, onProgress = () => {}) {
  const deleted = [], skipped = [];
  for (const [index, id] of ids.entries()) {
    try { await remove(id); deleted.push(id); }
    catch (error) { skipped.push({ id, reason: error instanceof Error ? error.message : String(error) }); }
    onProgress(index + 1, ids.length);
  }
  return { deleted, skipped };
}

export function bulkDeleteSummary({ deleted, skipped }, names) {
  const done = deleted.length ? (deleted.length === 1 ? (skipped.length ? "Se eliminó 1" : "Se eliminó 1 tienda") : `Se eliminaron ${deleted.length}`) : "";
  const left = skipped.length ? `${skipped.length} no se ${skipped.length === 1 ? "eliminó" : "eliminaron"}` : "";
  return { title: [done, left].filter(Boolean).join(" · "), skipped: skipped.map(item => ({ ...item, name: names.get(item.id) ?? item.id })) };
}

/**
 * Opens the confirmation dialog for the selected stores and runs the deletion.
 * `onFinished()` runs when the dialog closes after a run, so the list refreshes once, archives included.
 */
export function openStoreBulkDelete({ ids, names, remove, archive, onFinished }) {
  const dialog = document.getElementById("storeBulkDeleteDialog");
  const form = document.getElementById("storeBulkDeleteForm");
  const warning = document.getElementById("storeBulkDeleteWarning");
  const word = document.getElementById("storeBulkDeleteWord");
  const input = document.getElementById("storeBulkDeleteConfirmation");
  const confirm = document.getElementById("storeBulkDeleteConfirm");
  const status = document.getElementById("storeBulkDeleteStatus");
  const result = document.getElementById("storeBulkDeleteResult");
  const label = ids.length === 1 ? "Eliminar tienda" : `Eliminar ${ids.length} tiendas`;
  let running = false, finished = false;
  document.getElementById("storeBulkDeleteTitle").textContent = label;
  document.getElementById("storeBulkDeleteNames").innerHTML = ids.map(id => `<li>${esc(names.get(id) ?? id)}</li>`).join("");
  warning.hidden = false; word.hidden = ids.length === 1; confirm.hidden = false; confirm.textContent = label;
  input.value = ""; status.textContent = ""; result.hidden = true; result.innerHTML = "";
  const sync = () => { confirm.disabled = running || !confirmationReady(input.value, ids.length); };
  sync();
  input.oninput = sync;
  const close = () => { if (!running && dialog.open) dialog.close(); };
  form.querySelectorAll("[data-bulk-close]").forEach(button => { button.onclick = close; });
  dialog.oncancel = event => { if (running) event.preventDefault(); };
  dialog.onclose = () => { if (finished) onFinished(); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (running || !confirmationReady(input.value, ids.length)) return;
    running = true; sync();
    const outcome = await deleteStores(ids, remove, (done, total) => { status.textContent = `Eliminando ${done} de ${total}…`; });
    running = false; finished = true;
    const summary = bulkDeleteSummary(outcome, names);
    status.textContent = summary.title;
    warning.hidden = true; word.hidden = true; confirm.hidden = true;
    if (!summary.skipped.length) { close(); return; }
    result.hidden = false;
    result.innerHTML = `<ul class="store-bulk-skipped">${summary.skipped.map(item => `<li><strong>${esc(item.name)}</strong><span>${esc(item.reason)}</span></li>`).join("")}</ul><button class="ghost" type="button" id="storeBulkArchive">Archivar estas</button>`;
    document.getElementById("storeBulkArchive").onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      running = true;
      const archived = await deleteStores(summary.skipped.map(item => item.id), archive);
      running = false; button.remove();
      status.textContent = archived.skipped.length ? `${summary.title} · ${archived.skipped.length} tampoco se pudieron archivar` : `${summary.title} · archivadas`;
    };
  };
  dialog.showModal();
  if (ids.length > 1) input.focus();
}
