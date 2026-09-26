import { escapeHtml as esc } from "./html.mjs";

/** Ajustes → Conecta tu IA (spec 2026-09-26 templates/settings/MCP §3.3): MCP keys and client setup. */

/** @param {string} apiBase */
export function mcpEndpoint(apiBase) {
  return `${String(apiBase).replace(/\/+$/, "")}/mcp`;
}

/** Paste-ready setup for each client. @param {string} endpoint @param {string} key */
export function mcpClientSnippets(endpoint, key) {
  return {
    claude: `claude mcp add --transport http pagosya ${endpoint} --header "Authorization: Bearer ${key}"`,
    codex: `# ~/.codex/config.toml\n[mcp_servers.pagosya]\nurl = "${endpoint}"\nhttp_headers = { Authorization = "Bearer ${key}" }`,
    cursor: JSON.stringify({ mcpServers: { pagosya: { url: endpoint, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
  };
}

const CLIENTS = [["claude", "Claude Code"], ["codex", "Codex"], ["cursor", "Cursor (.cursor/mcp.json)"]];

/**
 * @param {HTMLElement} root
 * @param {{ api: (path: string, options?: RequestInit) => Promise<any>, apiBase: () => string }} deps
 */
export function mountMcpConnect(root, deps) {
  /** @type {Array<{ id: string, label: string | null, maskedKey: string, createdAt: string, revokedAt: string | null }>} */
  let keys = [];
  let created = null; let confirming = ""; let busy = false; let message = "";
  function render() {
    const active = keys.filter((key) => !key.revokedAt);
    const endpoint = mcpEndpoint(deps.apiBase());
    const snippets = created ? mcpClientSnippets(endpoint, created.fullKey) : null;
    root.innerHTML = `<div class="editor-section-head"><h3 id="mcpConnectTitle">Conecta tu IA</h3><p>Usa Claude, Codex o Cursor con tu tienda. Tu IA puede diseñar y cargar productos; publicar y cobrar siguen siendo tuyos.</p></div>
      ${message ? `<p class="mcp-message" role="status">${esc(message)}</p>` : ""}
      ${created ? `<div class="mcp-created"><p><strong>Tu clave nueva.</strong> Cópiala ahora: no la volverás a ver.</p>
        <div class="mcp-copy"><code>${esc(created.fullKey)}</code><button type="button" data-mcp-copy="${esc(created.fullKey)}">Copiar</button></div>
        ${CLIENTS.map(([id, name]) => `<details class="mcp-client"><summary>${esc(name)}</summary><pre><code>${esc(snippets[id])}</code></pre><button type="button" data-mcp-copy="${esc(snippets[id])}">Copiar</button></details>`).join("")}
        <button type="button" class="mcp-done" data-mcp-done>Listo</button></div>` : ""}
      <form class="mcp-create" data-mcp-create><label>Nombre de la clave <input name="label" maxlength="60" placeholder="Claude en mi computadora" ${busy ? "disabled" : ""}></label><button type="submit" ${busy ? "disabled" : ""}>Crear clave</button></form>
      <ul class="mcp-keys">${active.length ? active.map((key) => `<li><div><strong>${esc(key.label || "Sin nombre")}</strong><span>${esc(key.maskedKey)} · creada ${esc(new Date(key.createdAt).toLocaleDateString("es-BO"))}</span></div>
        ${confirming === key.id ? `<span class="mcp-confirm">¿Revocar? Tu IA dejará de tener acceso. <button type="button" data-mcp-revoke="${esc(key.id)}" ${busy ? "disabled" : ""}>Sí, revocar</button><button type="button" data-mcp-cancel>No</button></span>`
          : `<button type="button" data-mcp-ask="${esc(key.id)}" ${busy ? "disabled" : ""}>Revocar</button>`}</li>`).join("") : '<li class="mcp-empty">Todavía no conectaste ninguna IA.</li>'}</ul>
      <p class="mcp-endpoint">Dirección del servidor: <code>${esc(endpoint)}</code></p>`;
    root.querySelector("[data-mcp-create]")?.addEventListener("submit", (event) => { event.preventDefault(); void create(new FormData(/** @type {HTMLFormElement} */ (event.currentTarget)).get("label")); });
    root.querySelectorAll("[data-mcp-copy]").forEach((button) => button.addEventListener("click", () => { void navigator.clipboard?.writeText(button.getAttribute("data-mcp-copy") || ""); button.textContent = "Copiado"; }));
    root.querySelector("[data-mcp-done]")?.addEventListener("click", () => { created = null; render(); });
    root.querySelectorAll("[data-mcp-ask]").forEach((button) => button.addEventListener("click", () => { confirming = button.getAttribute("data-mcp-ask") || ""; render(); }));
    root.querySelector("[data-mcp-cancel]")?.addEventListener("click", () => { confirming = ""; render(); });
    root.querySelector("[data-mcp-revoke]")?.addEventListener("click", (event) => void revoke(/** @type {HTMLElement} */ (event.currentTarget).getAttribute("data-mcp-revoke") || ""));
  }
  async function run(task) {
    busy = true; message = ""; render();
    try { await task(); } catch (error) { message = error instanceof Error ? error.message : "No se pudo completar."; }
    busy = false; render();
  }
  const load = () => run(async () => { keys = await deps.api("/mcp/keys"); });
  const create = (label) => run(async () => {
    created = await deps.api("/mcp/keys", { method: "POST", body: JSON.stringify({ label: String(label || "").trim() || undefined }) });
    keys = await deps.api("/mcp/keys");
  });
  const revoke = (id) => run(async () => { await deps.api(`/mcp/keys/${encodeURIComponent(id)}`, { method: "DELETE" }); confirming = ""; message = "Clave revocada."; keys = await deps.api("/mcp/keys"); });
  render();
  // Loaded when Ajustes opens, after sign-in.
  return { reload: load };
}
