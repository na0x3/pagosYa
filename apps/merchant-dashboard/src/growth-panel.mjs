import { escapeHtml as esc } from "./html.mjs";
import { actionRoute, barWidth, formatCount, formatDelta, formatPercent, linePath, severityLabel, shortDay } from "./growth.mjs";

/**
 * Crecimiento (G2): what happens in the store (KPIs, funnel, traffic, clicks on the site and in the checkout, products,
 * devices, referrers), a weekly summary, and "Qué hacer ahora" — up to five insights, each with one button that opens
 * the screen that does it, already filled in. Nothing is applied from here: the merchant confirms on that screen.
 * Every value interpolated into markup goes through esc(); referrer hosts are shown as text, never as links.
 *
 * deps:
 *   api(path, options)          authenticated dashboard API call (throws Error with .status)
 *   storeId(), store()          the active store id and row
 *   signedIn()                  whether a merchant session exists
 *   publicUrl(store)            the store's public address, or "" when unknown
 *   openView(view)              switch the dashboard to a view (and the address bar)
 *   composeYapi(text)           open Diseñar sitio with the instruction in YAPI's composer (never sent)
 *   editProduct(id, step)       open the product guide on that product at a step; resolves false when not found
 *   composeProposal(brief)      optional: open Propuestas' composer with the brief
 */
export function mountGrowthPanel(deps) {
  const root = document.getElementById("growthRoot");
  if (!root) return { show() {}, reset() {} };

  const PERIODS = [7, 30, 90];
  const PERIOD_KEY = "pagosya_growth_days";
  let days = 30;
  try { days = PERIODS.includes(Number(localStorage.getItem(PERIOD_KEY))) ? Number(localStorage.getItem(PERIOD_KEY)) : 30; } catch { /* storage may be unavailable */ }
  let data = null;
  let loadedFor = null;
  let loading = false;
  let failure = null;
  let request = 0;
  let status = "";
  let undo = null;

  const storePath = (path) => `/stores/${encodeURIComponent(deps.storeId())}/growth${path}`;
  const icon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
    spark: '<path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  };

  async function load() {
    if (!deps.storeId() || !deps.signedIn()) { data = null; render(); return; }
    const mine = ++request;
    const store = deps.storeId();
    loading = true; failure = null; render();
    try {
      const answer = await deps.api(storePath(`/overview?days=${days}`));
      if (mine !== request) return;
      data = answer; loadedFor = store;
    } catch (error) {
      if (mine !== request) return;
      failure = error?.message || "No pudimos cargar tu crecimiento.";
    } finally {
      if (mine === request) { loading = false; render(); }
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────

  function render() {
    if (!deps.storeId()) {
      root.innerHTML = `<section class="growth-empty"><h3>Elige o crea una tienda</h3><p>Crecimiento muestra las visitas, los clics y las ventas de la tienda seleccionada.</p></section>`;
      return;
    }
    if (!data && loading) { root.innerHTML = `<div class="growth-skeleton" aria-busy="true" aria-label="Cargando crecimiento"><span></span><span></span><span></span></div>`; return; }
    if (!data && failure) {
      root.innerHTML = `<section class="growth-error" role="alert"><p>${esc(failure)}</p><button type="button" class="primary" data-growth-retry>Reintentar</button></section>`;
      return;
    }
    if (!data) { root.innerHTML = ""; return; }
    const whatsapp = data.checkoutMode === "whatsapp";
    root.innerHTML = `
      <div class="growth" data-mode="${esc(data.checkoutMode)}" ${loading ? 'aria-busy="true"' : ""}>
        ${toolbar()}
        ${failure ? `<p class="growth-error" role="alert">${esc(failure)}</p>` : ""}
        ${data.hasData ? `<section class="growth-weekly" aria-labelledby="growthWeeklyTitle">
          <span class="growth-weekly-icon">${icon(ICONS.spark)}</span>
          <div><h3 id="growthWeeklyTitle">Tu semana</h3><p>${esc(data.weekly.text)}</p></div>
        </section>
        ${insightsSection()}
        ${dashboard(whatsapp)}` : `${emptyState(whatsapp)}${insightsSection()}`}
        <p class="sr-only" role="status" aria-live="polite" id="growthStatus">${esc(status)}</p>
      </div>`;
  }

  function toolbar() {
    return `<div class="growth-toolbar">
      <div class="growth-period" role="group" aria-label="Periodo">
        ${PERIODS.map((value) => `<button type="button" data-growth-days="${value}" aria-pressed="${value === days}">${value} días</button>`).join("")}
      </div>
      <p class="growth-freshness">${esc(`${shortDay(data.period.from)} – ${shortDay(data.period.to)} · ${data.freshness}`)}</p>
    </div>`;
  }

  function insightsSection() {
    const cards = data.insights.map((insight, index) => insightCard(insight, index)).join("");
    const extra = [
      data.moreInsights ? `<p>${esc(`Hay ${data.moreInsights} ${data.moreInsights === 1 ? "sugerencia más" : "sugerencias más"}: aparecen cuando resuelvas u ocultes estas.`)}</p>` : "",
      data.hiddenInsights ? `<button type="button" class="growth-link" data-growth-restore>Mostrar ocultas (${esc(data.hiddenInsights)})</button>` : "",
    ].join("");
    return `<section class="growth-actions" aria-labelledby="growthActionsTitle">
      <header class="growth-section-head"><div><h3 id="growthActionsTitle">Qué hacer ahora</h3><p>${data.insights.length ? "Ordenado por lo que más ayuda a vender. Cada botón te lleva al lugar exacto; nada se cambia sin tu confirmación." : "Todo en orden por ahora. Vuelve cuando haya más visitas: aquí aparecerán nuevas ideas."}</p></div></header>
      ${undo ? `<div class="growth-undo" role="status"><span>${esc(undo.text)}</span><button type="button" class="growth-link" data-growth-undo>Deshacer</button></div>` : ""}
      ${cards ? `<ol class="growth-insights">${cards}</ol>` : `<p class="growth-all-clear">${icon(ICONS.trend)}<span>No hay acciones pendientes.</span></p>`}
      ${extra ? `<footer class="growth-actions-foot">${extra}</footer>` : ""}
    </section>`;
  }

  function insightCard(insight, index) {
    const route = actionRoute(insight.action);
    const why = Array.isArray(insight.why) ? insight.why : [];
    return `<li class="growth-insight is-${esc(insight.severity)}" data-insight-id="${esc(insight.id)}">
      <div class="growth-insight-top"><span class="growth-chip is-${esc(insight.severity)}">${esc(severityLabel(insight.severity))}</span><span class="growth-insight-rank" aria-hidden="true">${index + 1}</span></div>
      <h4>${esc(insight.title)}</h4>
      <p class="growth-evidence">${esc(insight.evidence)}</p>
      ${insight.impact ? `<p class="growth-impact">${esc(insight.impact)}</p>` : ""}
      ${route ? `<button type="button" class="primary growth-do" data-growth-act="${index}">${esc(insight.action.label)}${icon(ICONS.arrow)}</button>` : ""}
      <div class="growth-insight-foot">
        ${why.length ? `<details class="growth-why"><summary>¿Por qué?</summary><ul>${why.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></details>` : "<span></span>"}
        <div class="growth-later">
          <button type="button" class="growth-link" data-growth-snooze="${index}" aria-label="${esc(`Recordar en 7 días: ${insight.title}`)}">Recordar en 7 días</button>
          <button type="button" class="growth-link" data-growth-dismiss="${index}" aria-label="${esc(`Ocultar: ${insight.title}`)}">Ocultar</button>
        </div>
      </div>
    </li>`;
  }

  function dashboard(whatsapp) {
    return `
      <dl class="growth-kpis" aria-label="Indicadores del periodo">${data.kpis.map(kpiTile).join("")}</dl>
      <div class="growth-grid">
        ${card("growthFunnelTitle", "Embudo de compra", "Cuántas visitas avanzan en cada paso y dónde se van.", funnel(), "wide")}
        ${card("growthTrafficTitle", "Visitas por día", "Este periodo frente al anterior.", traffic(), "wide")}
        ${card("growthCtaTitle", "Clics en tu sitio", "Los botones principales que tocan tus visitas.", ctas())}
        ${card("growthCheckoutTitle", whatsapp ? "Clics en el pedido" : "Clics en el checkout", whatsapp ? "Del carrito a WhatsApp, paso a paso." : "Del carrito al pago, paso a paso.", checkout())}
        ${card("growthProductsTitle", "Productos", "Los que más miran y los que casi nadie ve.", products(), "wide")}
        ${card("growthDevicesTitle", "Dispositivos", "Desde dónde te visitan y cuántos añaden al carrito.", devices())}
        ${card("growthReferrersTitle", "De dónde llegan", "La página desde la que llegó cada visita.", referrers())}
      </div>`;
  }

  const card = (id, title, lead, body, size = "") => `<section class="growth-card ${size ? `is-${size}` : ""}" aria-labelledby="${id}"><header><h3 id="${id}">${esc(title)}</h3><p>${esc(lead)}</p></header>${body}</section>`;

  function kpiTile(kpi) {
    const delta = formatDelta(kpi);
    const value = kpi.format === "percent" ? formatPercent(kpi.value) : formatCount(kpi.value);
    return `<div class="growth-kpi" data-kpi="${esc(kpi.id)}">
      <dt>${esc(kpi.label)}</dt>
      <dd><strong>${esc(value)}</strong><span class="growth-delta is-${esc(delta.tone)}" title="${esc(delta.label)}"><span aria-hidden="true">${esc(delta.text)}</span><span class="sr-only">${esc(delta.label)}</span></span></dd>
      ${kpi.detail ? `<small>${esc(kpi.detail)}</small>` : ""}${kpi.note ? `<small class="growth-kpi-note">${esc(kpi.note)}</small>` : ""}
    </div>`;
  }

  function funnel() {
    const max = Math.max(1, ...data.funnel.map((step) => step.sessions));
    return `<ol class="growth-funnel">${data.funnel.map((step, index) => `
      <li>
        ${index && step.dropOff !== null ? `<span class="growth-drop ${step.dropOff >= 50 ? "is-bad" : ""}">${esc(`${formatPercent(step.dropOff)} no siguió`)}</span>` : ""}
        <div class="growth-funnel-row">
          <span class="growth-funnel-label">${esc(step.label)}</span>
          <span class="growth-bar" aria-hidden="true"><i style="width:${barWidth(step.sessions, max)}%"></i></span>
          <span class="growth-funnel-value"><strong>${esc(formatCount(step.sessions))}</strong>${index ? `<small>${esc(`${formatPercent(step.share)} de las visitas`)}</small>` : ""}</span>
        </div>
      </li>`).join("")}</ol>`;
  }

  function lineChart({ id, series, labels, summary }) {
    const width = 640, height = 180, pad = 10;
    const max = Math.max(1, ...series.flatMap((line) => line.values));
    const lines = series.map((line) => ({ ...line, path: linePath(line.values, width, height, pad, max) }));
    const first = lines[0].path;
    const area = first.points.length > 1 ? `${first.d} L${first.points[first.points.length - 1].x} ${height - pad} L${first.points[0].x} ${height - pad} Z` : "";
    const ticks = labels.length > 2 ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1] : labels.map((_, index) => index);
    return `<figure class="growth-chart">
      <div class="growth-chart-legend">${lines.map((line) => `<span class="is-${esc(line.tone)}"><i aria-hidden="true"></i>${esc(line.label)}</span>`).join("")}</div>
      <div class="growth-chart-plot">
        <span class="growth-chart-max" aria-hidden="true">${esc(formatCount(max))}</span>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-labelledby="${id}Title ${id}Desc">
          <title id="${id}Title">${esc(series.map((line) => line.label).join(" y "))}</title>
          <desc id="${id}Desc">${esc(summary)}</desc>
          <line x1="${pad}" x2="${width - pad}" y1="${pad}" y2="${pad}" class="growth-grid-line"/>
          <line x1="${pad}" x2="${width - pad}" y1="${height / 2}" y2="${height / 2}" class="growth-grid-line"/>
          <line x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}" class="growth-base-line"/>
          ${area ? `<path d="${area}" class="growth-area"/>` : ""}
          ${lines.slice().reverse().map((line) => `<path d="${line.path.d}" class="growth-line is-${esc(line.tone)}" vector-effect="non-scaling-stroke"/>`).join("")}
        </svg>
      </div>
      <div class="growth-chart-axis" aria-hidden="true">${ticks.map((index) => `<span>${esc(labels[index] || "")}</span>`).join("")}</div>
      <details class="growth-table"><summary>Ver como tabla</summary>
        <table><caption class="sr-only">${esc(summary)}</caption><thead><tr><th scope="col">Día</th>${series.map((line) => `<th scope="col">${esc(line.label)}</th>`).join("")}</tr></thead>
        <tbody>${labels.map((label, index) => `<tr><th scope="row">${esc(label)}</th>${series.map((line) => `<td>${esc(formatCount(line.values[index] || 0))}</td>`).join("")}</tr>`).join("")}</tbody></table>
      </details>
    </figure>`;
  }

  function traffic() {
    const { days: list, current, previous } = data.traffic;
    const total = current.reduce((sum, value) => sum + value, 0);
    const before = previous.reduce((sum, value) => sum + value, 0);
    const peak = Math.max(0, ...current);
    const peakDay = peak ? shortDay(list[current.indexOf(peak)]) : null;
    const summary = `Visitas por día del ${shortDay(list[0])} al ${shortDay(list[list.length - 1])}: ${formatCount(total)} en total frente a ${formatCount(before)} en el periodo anterior.${peakDay ? ` El día con más visitas fue el ${peakDay} (${formatCount(peak)}).` : ""}`;
    return lineChart({ id: "growthTrafficChart", labels: list.map(shortDay), summary, series: [
      { label: "Este periodo", tone: "current", values: current },
      { label: "Periodo anterior", tone: "previous", values: previous },
    ] });
  }

  function barList(rows, empty) {
    if (!rows.length) return `<p class="growth-none">${esc(empty)}</p>`;
    const max = Math.max(1, ...rows.map((row) => row.value));
    return `<ul class="growth-bars">${rows.map((row) => `<li>
      <div class="growth-bars-text"><span class="growth-bars-label">${esc(row.label)}</span><strong>${esc(row.valueText)}</strong></div>
      <span class="growth-bar" aria-hidden="true"><i style="width:${barWidth(row.value, max)}%"></i></span>
      ${row.hint ? `<small>${esc(row.hint)}</small>` : ""}
    </li>`).join("")}</ul>`;
  }

  function ctas() {
    return barList(data.ctas.slice(0, 8).map((cta) => ({ label: cta.label, value: cta.clicks, valueText: `${formatCount(cta.clicks)} clics`, hint: `${formatCount(cta.sessions)} ${cta.sessions === 1 ? "sesión" : "sesiones"}` })),
      "Todavía no hay clics en los botones principales. YAPI los marca al diseñar tu sitio; los verás aquí cuando lleguen visitas.");
  }

  function checkout() {
    const steps = data.checkout.steps;
    const max = Math.max(1, ...steps.map((step) => step.sessions));
    const list = steps.length ? `<ol class="growth-steps-list">${steps.map((step) => `<li>
      <div class="growth-bars-text"><span class="growth-bars-label">${esc(step.label)}${step.optional ? ' <em>opcional</em>' : ""}</span><strong>${esc(formatCount(step.sessions))}</strong></div>
      <span class="growth-bar" aria-hidden="true"><i style="width:${barWidth(step.sessions, max)}%"></i></span>
      ${step.dropOff !== null && step.dropOff !== undefined && !step.optional ? `<small class="${step.dropOff >= 50 ? "is-bad" : ""}">${esc(`${formatPercent(step.dropOff)} se fue en este paso`)}</small>` : ""}
    </li>`).join("")}</ol>` : "";
    const series = data.checkout.series;
    const chart = series.some((line) => line.values.some(Boolean)) ? lineChart({
      id: "growthCheckoutChart", labels: data.traffic.days.map(shortDay),
      summary: series.map((line) => `${line.label}: ${formatCount(line.values.reduce((sum, value) => sum + value, 0))} sesiones en el periodo`).join(". ") + ".",
      series: series.map((line, index) => ({ label: line.label, tone: index ? "final" : "current", values: line.values })),
    }) : "";
    return list + chart;
  }

  function products() {
    const row = (product) => `<li>
      <div class="growth-product-main"><strong>${esc(product.name)}</strong>
        <small>${esc(`${formatCount(product.views)} vieron · ${formatCount(product.adds)} añadieron${product.addRate !== null && product.addRate !== undefined ? ` (${formatPercent(product.addRate)})` : ""}${product.sold ? ` · ${formatCount(product.sold)} vendidos` : ""}`)}</small>
      </div>
      ${product.stock === 0 ? '<span class="growth-chip is-high">Agotado</span>' : product.stock !== null && product.stock !== undefined && product.stock <= 5 ? `<span class="growth-chip is-medium">${esc(`Quedan ${product.stock}`)}</span>` : ""}
      ${product.active ? `<button type="button" class="growth-link" data-growth-product="${esc(product.productId)}" aria-label="${esc(`Editar ${product.name}`)}">Editar</button>` : ""}
    </li>`;
    const { top, bottom } = data.products;
    return `<div class="growth-products">
      <div><h4>Los más vistos</h4>${top.length ? `<ol class="growth-product-list">${top.map(row).join("")}</ol>` : '<p class="growth-none">Aún nadie abrió un producto en este periodo.</p>'}</div>
      <div><h4>Los menos vistos</h4>${bottom.length ? `<ol class="growth-product-list">${bottom.map(row).join("")}</ol>` : '<p class="growth-none">Todos tus productos recibieron visitas.</p>'}</div>
    </div>`;
  }

  function devices() {
    return barList(data.devices.filter((device) => device.sessions).map((device) => ({
      label: device.label, value: device.sessions, valueText: formatPercent(device.share),
      hint: `${formatCount(device.sessions)} ${device.sessions === 1 ? "visita" : "visitas"}${device.addRate !== null ? ` · ${formatPercent(device.addRate)} añade al carrito` : ""}`,
    })), "Todavía no hay visitas medidas en este periodo.");
  }

  function referrers() {
    // Hosts are plain text (G1 contract) and are escaped like everything else — never links.
    return barList(data.referrers.map((ref) => ({ label: ref.label, value: ref.sessions, valueText: formatPercent(ref.share), hint: `${formatCount(ref.sessions)} ${ref.sessions === 1 ? "visita" : "visitas"}` })),
      "Aún no sabemos de dónde llegan tus visitas.");
  }

  function emptyState(whatsapp) {
    const store = deps.store();
    const url = store ? deps.publicUrl(store) : "";
    const published = data.store.published && !data.store.paused && !data.store.hidden;
    const share = url ? `https://wa.me/?text=${encodeURIComponent(`Mira mi tienda: ${url}`)}` : "";
    return `<section class="growth-empty" aria-labelledby="growthEmptyTitle">
      <div class="growth-empty-icon">${icon(ICONS.trend)}</div>
      <h3 id="growthEmptyTitle">Aquí verás cómo crece tu tienda</h3>
      <p>Cuando lleguen visitas verás cuántas personas entran, qué productos miran, qué botones tocan y en qué paso ${whatsapp ? "del pedido por WhatsApp" : "del pago"} se van. Y te diremos qué hacer para vender más.</p>
      <ol class="growth-onboarding">
        <li class="${published ? "is-done" : ""}"><span class="growth-step-number" aria-hidden="true">1</span><div><strong>Publica tu tienda</strong><p>${published ? "Lista: tu tienda está publicada." : "Mientras no esté publicada, nadie puede visitarla."}</p>${published ? "" : '<button type="button" class="primary" data-growth-open="workspace">Abrir el diseñador</button>'}</div></li>
        <li><span class="growth-step-number" aria-hidden="true">2</span><div><strong>Comparte tu enlace</strong><p>En tu estado de WhatsApp, tu biografía de Instagram o con tus clientes.</p>
          ${url ? `<div class="growth-share"><code>${esc(url)}</code><button type="button" class="ghost" data-growth-copy>${icon(ICONS.copy)}Copiar enlace</button><a class="ghost" href="${esc(share)}" target="_blank" rel="noopener noreferrer">${icon(ICONS.chat)}Compartir por WhatsApp</a></div>` : ""}</div></li>
        <li><span class="growth-step-number" aria-hidden="true">3</span><div><strong>Mira los primeros datos</strong><p>Contamos a quienes aceptan la analítica de tu tienda. Los números aparecen aquí en unos 15 minutos.</p></div></li>
      </ol>
    </section>`;
  }

  // ── actions ───────────────────────────────────────────────────────────

  function announce(text) {
    status = text;
    const live = root.querySelector("#growthStatus");
    if (live) live.textContent = text;
  }

  async function act(insight) {
    const route = actionRoute(insight.action);
    if (!route) return;
    if (route.compose) { deps.composeYapi(route.compose); return; }
    if (route.productId) {
      const found = await deps.editProduct(route.productId, route.step);
      if (!found) announce("Ese producto ya no está en tu catálogo.");
      return;
    }
    if (route.view === "proposals") { openProposal(route.brief); return; }
    deps.openView(route.view);
    if (route.view === "discounts") prefillPromo(route.code);
    if (route.view === "store-settings" && route.section) focusSettings(route.section);
  }

  /** Waits (briefly) for another panel's markup, since views render when shown. */
  function whenPresent(selector, then, tries = 30) {
    const element = document.querySelector(selector);
    if (element) { then(element); return; }
    if (tries > 0) setTimeout(() => whenPresent(selector, then, tries - 1), 100);
  }

  function openProposal(brief) {
    deps.openView("proposals");
    if (typeof deps.composeProposal === "function" && deps.composeProposal(brief)) return;
    // Propuestas (D2) opens its composer from its "new" button; fill the brief the merchant will review and send.
    whenPresent("#proposalsRoot [data-proposal-new]", (button) => {
      button.click();
      whenPresent("#proposalBrief", (field) => {
        if (!brief) return;
        field.value = brief;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.focus();
      });
    });
  }

  function prefillPromo(code) {
    whenPresent("#promoCodeInput", (field) => {
      if (code) field.value = code;
      field.closest("form")?.scrollIntoView({ block: "center", behavior: "smooth" });
      (code ? document.getElementById("promoCodeValue") : field)?.focus({ preventScroll: true });
    });
  }

  function focusSettings(section) {
    // The fields live on Ajustes' General tab, which may not be the one showing.
    document.querySelector('[data-settings-tab="general"]')?.click();
    const id = `storeSettings${section[0].toUpperCase()}${section.slice(1)}Title`;
    whenPresent(`#${id}`, (heading) => {
      heading.scrollIntoView({ block: "start", behavior: "smooth" });
      const field = heading.closest("section")?.querySelector("input:not([type=hidden]), textarea, select");
      field?.focus({ preventScroll: true });
    });
  }

  async function setState(insight, action) {
    const previous = data;
    data = { ...data, insights: data.insights.filter((item) => item.id !== insight.id), hiddenInsights: data.hiddenInsights + 1 };
    undo = { id: insight.id, text: action === "snooze" ? "Te la recordamos en 7 días." : "Sugerencia oculta." };
    render();
    announce(undo.text);
    try {
      await deps.api(storePath(`/insights/${encodeURIComponent(insight.id)}`), { method: "PUT", body: JSON.stringify({ action }) });
      await load();
    } catch (error) {
      data = previous; undo = null; render();
      announce(error?.message || "No pudimos guardar el cambio.");
    }
  }

  async function restore(id) {
    undo = null;
    try {
      if (id) await deps.api(storePath(`/insights/${encodeURIComponent(id)}`), { method: "PUT", body: JSON.stringify({ action: "restore" }) });
      else await deps.api(storePath("/insights"), { method: "DELETE" });
      await load();
      announce(id ? "Sugerencia restaurada." : "Mostramos de nuevo las sugerencias ocultas.");
    } catch (error) {
      announce(error?.message || "No pudimos restaurar las sugerencias.");
    }
  }

  async function copyLink(button) {
    const store = deps.store();
    const url = store ? deps.publicUrl(store) : "";
    try { await navigator.clipboard.writeText(url); button.textContent = "Enlace copiado"; announce("Enlace copiado."); }
    catch { announce("No pudimos copiar. Selecciona el enlace y cópialo."); }
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target || !root.contains(target)) return;
    if (target.dataset.growthDays) {
      const next = Number(target.dataset.growthDays);
      if (next === days) return;
      days = next;
      try { localStorage.setItem(PERIOD_KEY, String(days)); } catch { /* per-viewer convenience only */ }
      void load();
      return;
    }
    if (target.hasAttribute("data-growth-retry")) { void load(); return; }
    if (target.dataset.growthAct !== undefined) { const insight = data?.insights[Number(target.dataset.growthAct)]; if (insight) void act(insight); return; }
    if (target.dataset.growthSnooze !== undefined) { const insight = data?.insights[Number(target.dataset.growthSnooze)]; if (insight) void setState(insight, "snooze"); return; }
    if (target.dataset.growthDismiss !== undefined) { const insight = data?.insights[Number(target.dataset.growthDismiss)]; if (insight) void setState(insight, "dismiss"); return; }
    if (target.hasAttribute("data-growth-undo")) { void restore(undo?.id); return; }
    if (target.hasAttribute("data-growth-restore")) { void restore(null); return; }
    if (target.dataset.growthProduct) { void deps.editProduct(target.dataset.growthProduct, null).then((found) => { if (!found) announce("Ese producto ya no está en tu catálogo."); }); return; }
    if (target.dataset.growthOpen) { deps.openView(target.dataset.growthOpen); return; }
    if (target.hasAttribute("data-growth-copy")) void copyLink(target);
  });

  return {
    /** The view became visible: load the active store's growth for the chosen period. */
    show() {
      if (loadedFor !== deps.storeId()) { data = null; undo = null; }
      void load();
    },
    /** The active store changed. */
    reset() {
      request++;
      data = null; loadedFor = null; failure = null; undo = null; status = "";
      if (document.body.dataset.dashboardView === "growth") void load();
      else root.innerHTML = "";
    },
  };
}
