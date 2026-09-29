import { escapeHtml as esc } from "./html.mjs";

/** Sidebar → Conecta tu IA (spec 2026-09-26 templates/settings/MCP §3.3): MCP keys and client setup. */

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

/** Claude (web) and ChatGPT connectors cannot send headers, so their URL carries the key; it is revocable like any key. */
export function mcpConnectorUrl(endpoint, key) {
  return `${String(endpoint).replace(/\/+$/, "")}/k/${key}`;
}

export const MCP_GUIDE_TABS = [["claude", "Claude"], ["chatgpt", "ChatGPT"], ["claude-code", "Claude Code"], ["cursor", "Cursor"], ["codex", "Codex"]];
const FIRST_PROMPT = "Muéstrame mis tiendas y una vista previa de mi portada.";
const copyBox = (value, label) => `<div class="mcp-copy-box"><code>${esc(value)}</code><button type="button" class="mcp-copy-icon" data-mcp-copy="${esc(value)}" aria-label="Copiar ${esc(label)}" title="Copiar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></div>`;
const step = (body) => `<li><span class="mcp-step-body">${body}</span></li>`;

/**
 * One tab of the Conecta tu IA dialog: numbered steps, the secret URL or command in a copy box, and a first prompt.
 * Without a fresh key (keys are shown once) it offers to create the connection instead of showing any secret.
 * @param {string} client @param {{ endpoint: string, key: string | null }} options
 */
export function renderMcpGuide(client, { endpoint, key }) {
  const local = /^http:\/\/(localhost|127\.0\.0\.1)/.test(endpoint);
  const web = client === "claude" || client === "chatgpt";
  const create = `<button type="button" class="mcp-create-connection" data-mcp-create-connection="${esc(client)}">Crear mi conexión</button>`;
  const secret = (value, label) => key ? copyBox(value, label) : create;
  const snippets = key ? mcpClientSnippets(endpoint, key) : null;
  const url = key ? mcpConnectorUrl(endpoint, key) : "";
  const steps = {
    claude: [
      "En <strong>claude.ai</strong>, abre Configuración y luego Conectores.",
      `Elige <strong>Agregar conector personalizado</strong>, llámalo pagosYa y pega esta URL:${secret(url, "la URL")}`,
      "Guárdalo y actívalo en tu chat. Eso es todo.",
      `Empieza con esto y mira cómo responde tu tienda:${copyBox(FIRST_PROMPT, "el mensaje")}`,
    ],
    chatgpt: [
      "En <strong>ChatGPT</strong>, abre Configuración → Aplicaciones y conectores → Avanzado y activa el modo desarrollador.",
      `Crea un conector llamado pagosYa, sin autenticación, con esta URL:${secret(url, "la URL")}`,
      "En un chat nuevo, elige pagosYa en las herramientas.",
      `Empieza con esto y mira cómo responde tu tienda:${copyBox(FIRST_PROMPT, "el mensaje")}`,
    ],
    "claude-code": [
      "Abre la terminal en tu computadora.",
      `Pega este comando:${secret(snippets?.claude || "", "el comando")}`,
      "Abre <strong>claude</strong> y escribe /mcp para ver pagosYa conectado.",
      `Empieza con esto:${copyBox(FIRST_PROMPT, "el mensaje")}`,
    ],
    cursor: [
      "En <strong>Cursor</strong>, abre Settings → MCP → Add new MCP server.",
      `Pega esto en .cursor/mcp.json:${secret(snippets?.cursor || "", "la configuración")}`,
      `Empieza con esto en el chat de Cursor:${copyBox(FIRST_PROMPT, "el mensaje")}`,
    ],
    codex: [
      "Abre ~/.codex/config.toml en tu computadora.",
      `Agrega esto al final:${secret(snippets?.codex || "", "la configuración")}`,
      `Abre Codex y empieza con esto:${copyBox(FIRST_PROMPT, "el mensaje")}`,
    ],
  }[client] || [];
  return `${web && local ? '<p class="mcp-local-note">Claude y ChatGPT necesitan una dirección pública (https). En tu computadora de desarrollo usa Claude Code, Cursor o Codex; en producción esta URL funciona tal cual.</p>' : ""}<ol class="mcp-steps">${steps.map(step).join("")}</ol>`;
}

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
    root.innerHTML = `<div class="editor-section-head"><h3 id="mcpConnectTitle">Claves de acceso</h3><p>Crea una clave para cada IA o computadora. Puedes revocarla cuando quieras.</p></div>
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
  // Loaded when the Conecta tu IA page opens, after sign-in.
  return { reload: load };
}

/**
 * The Conecta tu IA dialog (opened from the sidebar card or the page): a tab per AI, the guide for it, and the
 * connection created on demand. A new key lives only in this page's memory, since the server never shows it again.
 * @param {{ api: (path: string, options?: RequestInit) => Promise<any>, apiBase: () => string, onCreated?: () => void }} deps
 */
export function mountMcpConnectDialog(deps) {
  const dialog = document.createElement("dialog");
  dialog.className = "mcp-dialog";
  dialog.setAttribute("aria-labelledby", "mcpDialogTitle");
  document.body.append(dialog);
  let client = "claude"; let key = null; let busy = false; let error = "";
  function render() {
    const endpoint = mcpEndpoint(deps.apiBase());
    dialog.innerHTML = `<div class="mcp-dialog__head"><h2 id="mcpDialogTitle">Conecta tu IA</h2><button type="button" class="mcp-dialog__close" data-mcp-close aria-label="Cerrar">×</button></div>
      <p class="mcp-dialog__lead">Configúralo una vez y edita tu tienda desde el chat que ya usas. Funciona con la suscripción de tu IA: cero créditos de pagosYa.</p>
      <div class="mcp-tabs" role="tablist">${MCP_GUIDE_TABS.map(([id, name]) => `<button type="button" role="tab" class="mcp-tab" data-mcp-tab="${id}" aria-selected="${id === client}">${esc(name)}</button>`).join("")}</div>
      ${error ? `<p class="mcp-message" role="alert">${esc(error)}</p>` : ""}
      <div class="mcp-guide" role="tabpanel" ${busy ? 'aria-busy="true"' : ""}>${renderMcpGuide(client, { endpoint, key })}</div>
      <p class="mcp-dialog__foot">Tu conexión es una clave personal: quien tenga esa URL o comando puede editar tu tienda. Revócala cuando quieras en <a href="#dashboard-connect-ai" data-mcp-close>Conecta tu IA</a>.</p>`;
    dialog.querySelectorAll("[data-mcp-close]").forEach((el) => el.addEventListener("click", () => dialog.close()));
    dialog.querySelectorAll("[data-mcp-tab]").forEach((tab) => tab.addEventListener("click", () => { client = tab.getAttribute("data-mcp-tab") || "claude"; render(); }));
    dialog.querySelectorAll("[data-mcp-copy]").forEach((button) => button.addEventListener("click", () => { void navigator.clipboard?.writeText(button.getAttribute("data-mcp-copy") || ""); button.classList.add("is-copied"); }));
    dialog.querySelector("[data-mcp-create-connection]")?.addEventListener("click", () => void create());
  }
  async function create() {
    if (busy) return;
    busy = true; error = ""; render();
    try {
      const label = MCP_GUIDE_TABS.find(([id]) => id === client)?.[1] || "Mi IA";
      key = (await deps.api("/mcp/keys", { method: "POST", body: JSON.stringify({ label }) })).fullKey;
      deps.onCreated?.();
    } catch (e) { error = e instanceof Error ? e.message : "No se pudo crear la conexión."; }
    busy = false; render();
  }
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  return { open(next = "claude") { client = next; render(); dialog.showModal(); } };
}

