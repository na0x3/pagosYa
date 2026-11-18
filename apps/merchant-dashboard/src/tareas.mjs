import { escapeHtml as esc } from "./html.mjs";

/**
 * Tienda › Tareas (spec 2026-11-16, «Tareas de YAPI», like Amboras's job card): one card per job YAPI can do for the store — a
 * picture, the name, one promise, the minutes and the credits it costs, and «Empezar». A home design and a review run here
 * (v2-prototype and its look); the other jobs open YAPI's chat with the request already written. Credits are the owner-approved
 * draft prices; the real charge is what the job actually spends.
 */
const art = (bg, body) => `<svg viewBox="0 0 96 72" aria-hidden="true" data-bg="${bg}">${body}</svg>`;
const ink = 'fill="none" stroke="#18181b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const PICTURES = {
  design: art("#efe9ff", `<rect x="18" y="14" width="60" height="44" rx="6" ${ink}/><path d="M18 24h60" ${ink}/><rect x="24" y="30" width="22" height="20" rx="3" fill="#c4b5fd"/><path d="M52 33h18M52 39h14M52 45h10" ${ink}/>`),
  review: art("#e6f4ff", `<rect x="16" y="16" width="44" height="34" rx="5" ${ink}/><path d="M22 26h22M22 33h30M22 40h16" ${ink}/><circle cx="64" cy="46" r="11" fill="#bae6fd" ${ink}/><path d="m72 54 8 8" ${ink}/>`),
  product: art("#fff1e6", `<rect x="22" y="12" width="52" height="48" rx="6" ${ink}/><rect x="28" y="18" width="40" height="18" rx="3" fill="#fed7aa"/><path d="M28 43h28M28 50h20" ${ink}/>`),
  cutouts: art("#ecfdf3", `<path d="M30 54c0-12 6-22 18-22s18 10 18 22" fill="#bbf7d0" ${ink}/><circle cx="48" cy="24" r="8" fill="#bbf7d0" ${ink}/><path d="M16 16h8M16 16v8M80 16h-8M80 16v8M16 58h8M16 58v-8M80 58h-8M80 58v-8" ${ink}/>`),
  emails: art("#fdf2f8", `<rect x="18" y="20" width="60" height="36" rx="5" fill="#fbcfe8" ${ink}/><path d="m20 23 28 19 28-19" ${ink}/>`),
  popup: art("#fefce8", `<rect x="14" y="12" width="68" height="48" rx="6" ${ink}/><rect x="28" y="22" width="40" height="28" rx="5" fill="#fde68a" ${ink}/><path d="M40 36h16M48 28v16" ${ink}/>`),
  abtest: art("#eef2ff", `<rect x="14" y="18" width="30" height="38" rx="5" fill="#c7d2fe" ${ink}/><rect x="52" y="18" width="30" height="38" rx="5" ${ink}/><path d="M25 37h8M63 33l4 8 4-8" ${ink}/>`),
  selling: art("#f4f4f5", `<path d="M16 54 34 38l10 8 22-22" ${ink}/><path d="M58 24h8v8" ${ink}/><circle cx="34" cy="38" r="3" fill="#18181b"/><circle cx="44" cy="46" r="3" fill="#18181b"/>`),
};

export const TAREAS = [
  { id: "design", name: "Diseño de portada", promise: "YAPI estudia tiendas reales y diseña tu portada, tu menú y tu página de producto.", minutes: "20–40 min", credits: "500 créditos", action: "build" },
  { id: "review", name: "Revisar y mejorar mi tienda", promise: "YAPI mira tu tienda como un cliente y arregla lo que se ve mal.", minutes: "15–20 min", credits: "250 créditos", action: "look" },
  { id: "product", name: "Página de producto", promise: "Una página larga para tu producto estrella: su historia, lo que trae y las preguntas.", minutes: "10 min", credits: "150 créditos", action: "yapi",
    request: "Escribe una página de producto larga para mi producto principal, con su historia, lo que trae y las preguntas frecuentes." },
  { id: "cutouts", name: "Fotos sin fondo", promise: "Recorta tus productos para portadas que flotan y vitrinas limpias.", minutes: "2 min", credits: "30 créditos", action: "yapi",
    request: "Quita el fondo de las fotos de mis productos para usarlas en la portada." },
  { id: "emails", name: "Correos de la tienda", promise: "Recibos, bienvenida y carritos olvidados con el estilo de tu marca.", minutes: "5 min", credits: "80 créditos", action: "yapi",
    request: "Diseña los correos de mi tienda (recibo, bienvenida y carrito olvidado) con el estilo de mi marca." },
  { id: "popup", name: "Ventana y juego", promise: "Una ventana de bienvenida con su juego «Rasca y elige» para ganar correos.", minutes: "3 min", credits: "50 créditos", action: "yapi",
    request: "Haz una ventana de bienvenida para mi tienda con el juego Rasca y elige." },
  { id: "abtest", name: "Prueba A/B", promise: "Dos versiones a la vez; te quedas con la que vende más.", minutes: "7 min + 14 días", credits: "100 créditos", action: "yapi",
    request: "Quiero hacer una prueba A/B de mi portada para ver cuál versión vende más." },
  { id: "selling", name: "La tienda que vende sola", promise: "Prueba un cambio pequeño a la vez y se queda solo con lo que vende más.", minutes: "Siempre", credits: "Incluida en Pro", action: "view", cta: "Ver esta semana" },
].map((tarea) => ({ ...tarea, picture: PICTURES[tarea.id] }));

/** «YAPI trabaja · 12 min» for a running build or review. */
export function runningLine(run, now = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(run?.startedAt || "")) / 60000)) || 0;
  return `YAPI trabaja · ${minutes} min`;
}

/** `run` is GET v2-prototype (or null); `startedCard` is the card that started it (design by default). */
export function renderTareas({ run = null, startedCard = "design", now = new Date(), notice = "" } = {}) {
  const busy = run?.status === "RUNNING";
  const owner = ["design", "review"].includes(startedCard) ? startedCard : "design";
  const cards = TAREAS.map((tarea) => {
    const mine = run && tarea.id === owner && (tarea.action === "build" || tarea.action === "look");
    const state = mine && busy ? `<p class="tarea-state is-running"><span class="tarea-dot" aria-hidden="true"></span>${esc(runningLine(run, now))}</p>`
      : mine && run.status === "DONE" ? `<p class="tarea-state is-done">Listo${run.revision ? ` · versión ${esc(String(run.revision))}` : ""} <button type="button" class="ui-button is-quiet" data-tarea-open>Ver en Diseño</button></p>`
      : mine && run.status === "FAILED" ? `<p class="tarea-state is-failed">No terminó: ${esc(String(run.error || "inténtalo de nuevo").slice(0, 120))}</p>` : "";
    const blocked = busy && (tarea.action === "build" || tarea.action === "look");
    return `<li class="tarea-card" data-card="${tarea.id}"><div class="tarea-art" style="background:${/data-bg="([^"]+)"/.exec(tarea.picture)?.[1] || "#f4f4f5"}">${tarea.picture}</div><div class="tarea-body"><h3>${esc(tarea.name)}</h3><p class="tarea-promise">${esc(tarea.promise)}</p>`
      + `<p class="tarea-meta"><span>${esc(tarea.minutes)}</span><span>${esc(tarea.credits)}</span></p>${state}</div>`
      + `<button type="button" class="ui-button tarea-start" data-tarea="${tarea.id}"${blocked ? " disabled" : ""}>${esc(tarea.cta || "Empezar")}</button></li>`;
  }).join("");
  return `<header class="tareas-head"><h2>Tareas de YAPI</h2><p class="muted">Elige un trabajo y YAPI lo hace por ti. Los créditos son lo que suele costar; se cobra lo que de verdad gasta.</p></header>`
    + (notice ? `<p class="tareas-notice" role="status">${esc(notice)}</p>` : "")
    + `<ul class="tareas-grid">${cards}</ul>`;
}

/** deps: { api, storeId, composeYapi(text), openView(view) }. */
export function mountTareas(deps) {
  const root = document.getElementById("tareasRoot");
  if (!root) return { show() {}, hide() {} };
  let run = null, startedCard = "design", notice = "", timer = 0, visible = false;
  const base = () => `/stores/${encodeURIComponent(deps.storeId())}/source-project/v2-prototype`;
  const draw = () => { root.innerHTML = renderTareas({ run, startedCard, notice }); };
  async function refresh() {
    clearTimeout(timer);
    if (!deps.storeId()) { run = null; draw(); return; }
    try { run = await deps.api(base()); } catch { run = null; }
    draw();
    if (visible && run?.status === "RUNNING") timer = setTimeout(refresh, 20000);
  }
  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-tarea-open]")) { deps.openView("workspace"); return; }
    const button = event.target.closest("[data-tarea]");
    const tarea = button && TAREAS.find((entry) => entry.id === button.dataset.tarea);
    if (!tarea || !deps.storeId()) return;
    if (tarea.action === "view") { deps.openView("overview"); return; }
    if (tarea.action === "yapi") { deps.composeYapi(tarea.request); return; }
    button.disabled = true; notice = "";
    try {
      await deps.api(tarea.action === "build" ? base() : `${base()}/look`, { method: "POST", body: JSON.stringify({}) });
      startedCard = tarea.id;
    } catch (error) { notice = String(error?.message || "No se pudo empezar. Inténtalo de nuevo."); }
    await refresh();
  });
  return {
    show() { visible = true; draw(); void refresh(); },
    hide() { visible = false; clearTimeout(timer); },
  };
}
