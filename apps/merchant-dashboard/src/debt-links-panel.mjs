import { escapeHtml as esc } from "./html.mjs";
import { parseDebtCollectionRows, parseDebtCsv } from "./debt-csv.mjs";

/**
 * Cobrar deudas: debt collection links (moved from dashboard.js 2026-10-15, no behaviour change). create…() only looks
 * things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)                 authenticated dashboard API call
 *   apiBaseEl, emailEl                 login form inputs (API base, merchant email)
 *   errorEl, infoEl                    the dashboard's error and info banners
 *   checkoutOriginEl                   input holding the checkout origin
 *   money(cents)                       formats an amount, honouring the hide-money toggle
 *   storeId()                          the active store id, read at use time
 *   sessionToken()                     the merchant's session token, read at use time
 *   debtLinks() / setDebtLinks(links)  the active store's debt collection links
 */
export function createDebtLinksPanel(deps) {
  const { api, apiBaseEl, emailEl, errorEl, infoEl, checkoutOriginEl, money } = deps;
  const debtCollectionPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);
  const debtCollectionPageSize = 4;
  const expandedDebtCollectionIds = new Set();
  const debtPayerPageByCollectionId = new Map();
  const debtPayerPageSize = 10;
  let preparedDebtCsvRows = [];
  let debtCsvImportVersion = 0;
  let debtAppendTarget = null;

  let debtLinkStatusTab = "ACTIVE";

  function resetDebtCollectionEntry(statusText = "") {
    const form = document.getElementById("debtCollectionForm");
    form.reset();
    debtAppendTarget = null;
    preparedDebtCsvRows = [];
    debtCsvImportVersion += 1;
    document.getElementById("debtCsvStatus").textContent = "";
    document.getElementById("debtManualPanel").hidden = false;
    document.getElementById("debtCsvPanel").hidden = true;
    document.getElementById("debtAppendContext").hidden = true;
    document.querySelectorAll(".debt-collection-metadata-field").forEach((field) => { field.hidden = false; });
    document.getElementById("debtCollectionName").required = true;
    document.getElementById("debtNotificationEmail").required = true;
    document.getElementById("debtNotificationEmail").value = emailEl.value;
    document.getElementById("debtCollectionSubmit").textContent = "Agregar deudas al portal";
    document.getElementById("debtCollectionStatus").textContent = statusText;
  }

  function enterDebtAppendMode(link) {
    resetDebtCollectionEntry();
    debtAppendTarget = { id: link.id, name: link.name };
    document.querySelectorAll(".debt-collection-metadata-field").forEach((field) => { field.hidden = true; });
    document.getElementById("debtCollectionName").required = false;
    document.getElementById("debtNotificationEmail").required = false;
    document.getElementById("debtAppendTargetName").textContent = `Agregar deudas a “${link.name}”`;
    document.getElementById("debtAppendContext").hidden = false;
    document.getElementById("debtCollectionSubmit").textContent = "Agregar a esta colección";
    document.getElementById("debtAppendContext").scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("debtCollectionRows").focus({ preventScroll: true });
  }

  function debtCollectionUrl(slug) {
    return checkoutOriginEl.value.replace(/\/$/, "") + "/?debt=" + encodeURIComponent(slug);
  }

  function renderDebtCollectionLinks(links) {
    deps.setDebtLinks(links);
    const list = document.getElementById("debtCollectionList");
    if (!deps.storeId()) {
      list.innerHTML = "";
      return;
    }
    if (!links.length) {
      list.innerHTML = `<p class="debt-collection-empty muted">Todavía no hay links de cobro para esta tienda.</p>`;
      return;
    }
    const portalSlug = links.find((link) => link.portalSlug)?.portalSlug || links.find((link) => link.status === "ACTIVE")?.slug;
    const portalSummary = portalSlug ? `<section class="debt-portal-summary" aria-label="Portal único de cobros">
      <div>
        <span class="debt-portal-kicker">UN SOLO LINK · TODAS LAS DEUDAS</span>
        <h4>Portal único de cobros</h4>
        <p>Este link reúne todas las colecciones activas. Si un carnet tiene varias deudas, la persona podrá elegir cuáles pagar.</p>
      </div>
      <div class="debt-portal-actions">
        <a class="primary" href="${esc(debtCollectionUrl(portalSlug))}" target="_blank" rel="noopener noreferrer">Abrir portal</a>
        <button class="ghost copy-debt-portal" type="button" data-slug="${esc(portalSlug)}">Copiar link</button>
      </div>
    </section>` : "";
    const renderCollectionCard = (link) => {
      const debts = Array.isArray(link.debts) ? link.debts : [];
      const pending = debts.filter((debt) => debt.status === "PENDING");
      const paid = debts.length - pending.length;
      const pendingAmount = pending.reduce((total, debt) => total + Number(debt.amount || 0), 0);
      const active = link.status === "ACTIVE";
      const payerListId = `debt-payers-${link.id}`;
      const expanded = expandedDebtCollectionIds.has(link.id);
      return `<article class="debt-collection-row" data-id="${esc(link.id)}">
        <div class="debt-collection-summary">
          <div>
            <h4>${esc(link.name)} ${active ? "" : '<span class="badge ARCHIVED">ARCHIVADO</span>'}</h4>
            <div class="debt-collection-meta">
              <span>${debts.length} ${debts.length === 1 ? "deuda" : "deudas"}</span>
              <span>${paid} pagadas</span>
              <span>${pending.length} pendientes · ${money(pendingAmount)}</span>
              ${link.notificationEmail ? `<span>Alertas: ${esc(link.notificationEmail)}</span>` : ""}
            </div>
          </div>
          <div class="debt-collection-row-actions">
            ${active ? `<button class="ghost add-debts-to-collection" type="button" data-id="${esc(link.id)}">Agregar deudas</button>
              <button class="ghost archive-debt-link" type="button" data-id="${esc(link.id)}">Archivar colección</button>`
              : `<button class="ghost restore-debt-link" type="button" data-id="${esc(link.id)}">Restaurar link</button>`}
          </div>
        </div>
        <button class="debt-payer-toggle" type="button" data-id="${esc(link.id)}" aria-expanded="${expanded}" aria-controls="${esc(payerListId)}">
          <span class="debt-payer-toggle-copy">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>
            <strong>Estado de las personas</strong>
          </span>
          <span class="debt-payer-toggle-count">${paid} de ${debts.length} pagaron</span>
        </button>
        <div class="debt-payer-list" id="${esc(payerListId)}" data-id="${esc(link.id)}" ${expanded ? "" : "hidden"}>
          <div class="debt-payer-tools">
            <label class="debt-payer-search-wrap">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.8"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg>
              <input class="debt-payer-search" type="search" placeholder="Buscar persona, carnet o referencia" aria-label="Buscar en ${esc(link.name)}">
            </label>
            <span class="debt-payer-results" aria-live="polite">${debts.length} ${debts.length === 1 ? "persona" : "personas"}</span>
            <button class="ghost debt-payer-export" type="button" data-id="${esc(link.id)}" data-slug="${esc(link.slug)}">Descargar PDF</button>
          </div>
          ${debts.map((debt) => {
            const isPaid = debt.status === "PAID";
            const supportingLabel = [debt.customerDocument && `CI ${debt.customerDocument}`, debt.customerEmail, debt.customerPhone, debt.reference].filter(Boolean).join(" · ");
            return `<div class="debt-payer-row${isPaid ? " is-paid" : ""}">
              <span class="debt-payer-mark" aria-hidden="true">${isPaid ? '<svg viewBox="0 0 20 20" fill="none"><path d="m4 10 4 4 8-9" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"/></svg>' : ""}</span>
              <span class="debt-payer-identity"><strong>${esc(debt.customerName || "Persona sin nombre")}</strong>${supportingLabel ? `<span>${esc(supportingLabel)}</span>` : ""}</span>
              <span class="debt-payer-state">${isPaid ? "Pagó" : "Pendiente"}<span class="debt-payer-amount">${money(Number(debt.amount || 0))}</span></span>
            </div>`;
          }).join("")}
          <p class="debt-payer-empty" hidden>No hay personas que coincidan con la búsqueda.</p>
          <nav class="debt-payer-pagination" aria-label="Páginas de ${esc(link.name)}" hidden>
            <span class="debt-page-summary"></span>
            <span class="debt-page-controls"></span>
          </nav>
        </div>
      </article>`;
    };
    const collectionGroups = [
      { status: "ACTIVE", title: "En el portal", description: "Colecciones visibles y listas para cobrar", className: "is-active", empty: "No hay colecciones activas en el portal." },
      { status: "ARCHIVED", title: "Archivados", description: "Colecciones ocultas que puedes restaurar", className: "is-archived", empty: "No hay colecciones archivadas." },
    ];
    const compactPageTokens = (currentPage, totalPages) => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
      const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      const tokens = [];
      ordered.forEach((page, index) => {
        if (index && page - ordered[index - 1] > 1) tokens.push("gap");
        tokens.push(page);
      });
      return tokens;
    };
    const previousIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 4-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
    const nextIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 4 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
    const groupedLinks = collectionGroups.map((group) => {
      const matchingLinks = links.filter((link) => link.status === group.status);
      const totalPages = Math.max(1, Math.ceil(matchingLinks.length / debtCollectionPageSize));
      const requestedPage = debtCollectionPageByStatus.get(group.status) || 1;
      const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
      debtCollectionPageByStatus.set(group.status, currentPage);
      const start = (currentPage - 1) * debtCollectionPageSize;
      const visibleLinks = matchingLinks.slice(start, start + debtCollectionPageSize);
      const summary = matchingLinks.length ? `${start + 1}–${Math.min(start + debtCollectionPageSize, matchingLinks.length)} de ${matchingLinks.length}` : "0 links";
      return `<section class="debt-link-group ${group.className}" id="debt-link-${group.status.toLowerCase()}-panel" role="tabpanel" data-debt-link-status="${group.status}" aria-labelledby="debt-link-tab-${group.status.toLowerCase()}" ${debtLinkStatusTab === group.status ? "" : "hidden"}>
        <header class="debt-link-group-head">
          <h4>${group.title}</h4>
          <span class="debt-link-group-count">${matchingLinks.length} ${matchingLinks.length === 1 ? "link" : "links"}</span>
        </header>
        <div class="debt-link-group-body">${visibleLinks.length ? visibleLinks.map(renderCollectionCard).join("") : `<p class="debt-link-group-empty">${group.empty}</p>`}</div>
        <nav class="debt-link-pagination" aria-label="Páginas de ${group.title.toLowerCase()}" ${totalPages <= 1 ? "hidden" : ""}>
          <span class="debt-link-page-summary">${summary}</span>
          <span class="debt-link-page-controls">
            <button class="debt-link-page-button" type="button" data-status="${group.status}" data-page="${currentPage - 1}" aria-label="Página anterior de ${group.title.toLowerCase()}" ${currentPage === 1 ? "disabled" : ""}>${previousIcon}</button>
            ${compactPageTokens(currentPage, totalPages).map((token) => token === "gap"
              ? '<span class="debt-page-gap" aria-hidden="true">…</span>'
              : `<button class="debt-link-page-button" type="button" data-status="${group.status}" data-page="${token}" aria-label="Página ${token} de ${group.title.toLowerCase()}" ${token === currentPage ? 'aria-current="page"' : ""}>${token}</button>`).join("")}
            <button class="debt-link-page-button" type="button" data-status="${group.status}" data-page="${currentPage + 1}" aria-label="Página siguiente de ${group.title.toLowerCase()}" ${currentPage === totalPages ? "disabled" : ""}>${nextIcon}</button>
          </span>
        </nav>
      </section>`;
    }).join("");
    const debtTabs = `<div class="debt-link-tabs" role="tablist" aria-label="Estado de las colecciones">
      ${collectionGroups.map((group) => {
        const count = links.filter((link) => link.status === group.status).length;
        return `<button class="debt-link-tab" id="debt-link-tab-${group.status.toLowerCase()}" type="button" role="tab" data-status="${group.status}" aria-selected="${debtLinkStatusTab === group.status}" aria-controls="debt-link-${group.status.toLowerCase()}-panel">
          <strong>${group.title}</strong><span>${count}</span><small>${group.description}</small>
        </button>`;
      }).join("")}
    </div>`;
    list.innerHTML = portalSummary + debtTabs + `<div class="debt-link-groups">${groupedLinks}</div>`;

    list.querySelectorAll(".debt-link-tab").forEach((button) => button.addEventListener("click", () => {
      debtLinkStatusTab = button.dataset.status;
      renderDebtCollectionLinks(deps.debtLinks());
      document.getElementById(`debt-link-tab-${debtLinkStatusTab.toLowerCase()}`)?.focus();
    }));

    list.querySelectorAll(".debt-link-page-button:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
      debtCollectionPageByStatus.set(button.dataset.status, Number(button.dataset.page));
      renderDebtCollectionLinks(deps.debtLinks());
    }));

    const pageTokens = (currentPage, totalPages) => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
      const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      const tokens = [];
      sorted.forEach((page, index) => {
        if (index > 0 && page - sorted[index - 1] > 1) tokens.push("gap");
        tokens.push(page);
      });
      return tokens;
    };

    const updatePayerPage = (container, requestedPage) => {
      const collectionId = container.dataset.id;
      const rows = [...container.querySelectorAll(".debt-payer-row")];
      const matchingRows = rows.filter((row) => row.dataset.searchMatch !== "false");
      const totalPages = Math.max(1, Math.ceil(matchingRows.length / debtPayerPageSize));
      const storedPage = requestedPage ?? debtPayerPageByCollectionId.get(collectionId) ?? 1;
      const currentPage = Math.min(Math.max(1, storedPage), totalPages);
      debtPayerPageByCollectionId.set(collectionId, currentPage);
      const firstIndex = (currentPage - 1) * debtPayerPageSize;
      const visibleRows = new Set(matchingRows.slice(firstIndex, firstIndex + debtPayerPageSize));
      rows.forEach((row) => { row.hidden = !visibleRows.has(row); });

      const resultCount = container.querySelector(".debt-payer-results");
      resultCount.textContent = `${matchingRows.length} ${matchingRows.length === 1 ? "persona" : "personas"}`;
      container.querySelector(".debt-payer-empty").hidden = matchingRows.length > 0;
      const pagination = container.querySelector(".debt-payer-pagination");
      pagination.hidden = matchingRows.length <= debtPayerPageSize;
      if (pagination.hidden) return;

      const rangeStart = firstIndex + 1;
      const rangeEnd = Math.min(firstIndex + debtPayerPageSize, matchingRows.length);
      pagination.querySelector(".debt-page-summary").textContent = `${rangeStart}–${rangeEnd} de ${matchingRows.length}`;
      const previousIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 4-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
      const nextIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 4 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
      const controls = pagination.querySelector(".debt-page-controls");
      controls.innerHTML = `
        <button class="debt-page-button" type="button" data-page="${currentPage - 1}" aria-label="Página anterior" ${currentPage === 1 ? "disabled" : ""}>${previousIcon}</button>
        ${pageTokens(currentPage, totalPages).map((token) => token === "gap"
          ? '<span class="debt-page-gap" aria-hidden="true">…</span>'
          : `<button class="debt-page-button" type="button" data-page="${token}" aria-label="Página ${token}" ${token === currentPage ? 'aria-current="page"' : ""}>${token}</button>`).join("")}
        <button class="debt-page-button" type="button" data-page="${currentPage + 1}" aria-label="Página siguiente" ${currentPage === totalPages ? "disabled" : ""}>${nextIcon}</button>`;
      controls.querySelectorAll(".debt-page-button:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
        updatePayerPage(container, Number(button.dataset.page));
      }));
    };

    list.querySelectorAll(".debt-payer-list").forEach((container) => updatePayerPage(container));

    list.querySelectorAll(".debt-payer-toggle").forEach((button) => button.addEventListener("click", () => {
      const linkId = button.dataset.id;
      const payerList = document.getElementById(button.getAttribute("aria-controls"));
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      payerList.hidden = expanded;
      if (expanded) expandedDebtCollectionIds.delete(linkId);
      else expandedDebtCollectionIds.add(linkId);
    }));

    list.querySelectorAll(".debt-payer-search").forEach((input) => input.addEventListener("input", () => {
      const container = input.closest(".debt-payer-list");
      const searchKey = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]/g, "");
      const query = searchKey(input.value);
      const rows = [...container.querySelectorAll(".debt-payer-row")];
      rows.forEach((row) => {
        const searchable = searchKey(row.textContent);
        row.dataset.searchMatch = String(!query || searchable.includes(query));
      });
      updatePayerPage(container, 1);
    }));

    list.querySelectorAll(".debt-payer-export").forEach((button) => button.addEventListener("click", async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando PDF…";
      try {
        const response = await fetch(`${apiBaseEl.value.replace(/\/$/, "")}/stores/${deps.storeId()}/debt-collection-links/${button.dataset.id}/status.pdf`, {
          headers: { authorization: "Bearer " + deps.sessionToken() },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || "No se pudo generar el PDF.");
        }
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `estado-pagos-${button.dataset.slug}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
        button.textContent = "PDF descargado";
        window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1600);
      } catch (error) {
        errorEl.textContent = `Error al descargar el PDF: ${error.message}`;
        button.textContent = original;
      } finally {
        button.disabled = false;
      }
    }));

    list.querySelectorAll(".copy-debt-portal").forEach((button) => button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(debtCollectionUrl(button.dataset.slug));
      const original = button.textContent;
      button.textContent = "Copiado";
      window.setTimeout(() => (button.textContent = original), 1400);
    }));
    list.querySelectorAll(".add-debts-to-collection").forEach((button) => button.addEventListener("click", () => {
      const link = links.find((candidate) => candidate.id === button.dataset.id);
      if (link) enterDebtAppendMode(link);
    }));
    list.querySelectorAll(".archive-debt-link").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("¿Archivar esta colección? Sus deudas pendientes dejarán de aparecer en el portal único.")) return;
      try {
        await api(`/stores/${deps.storeId()}/debt-collection-links/${button.dataset.id}/archive`, { method: "POST" });
        renderDebtCollectionLinks(await api(`/stores/${deps.storeId()}/debt-collection-links`));
      } catch (error) {
        errorEl.textContent = "Error: " + error.message;
      }
    }));
    list.querySelectorAll(".restore-debt-link").forEach((button) => button.addEventListener("click", async () => {
      try {
        button.disabled = true;
        button.textContent = "Restaurando…";
        await api(`/stores/${deps.storeId()}/debt-collection-links/${button.dataset.id}/restore`, { method: "POST" });
        renderDebtCollectionLinks(await api(`/stores/${deps.storeId()}/debt-collection-links`));
        infoEl.textContent = "Link de deuda restaurado y agregado nuevamente al portal.";
      } catch (error) {
        button.disabled = false;
        button.textContent = "Restaurar link";
        errorEl.textContent = "Error: " + error.message;
      }
    }));
  }

  function init() {
    document.getElementById("debtAppendCancel").addEventListener("click", () => resetDebtCollectionEntry());

    document.querySelectorAll('input[name="debtInputMode"]').forEach((radio) => radio.addEventListener("change", () => {
      const csvMode = document.querySelector('input[name="debtInputMode"]:checked')?.value === "csv";
      document.getElementById("debtManualPanel").hidden = csvMode;
      document.getElementById("debtCsvPanel").hidden = !csvMode;
      document.getElementById(csvMode ? "debtCsvInput" : "debtCollectionRows").focus();
    }));

    document.getElementById("debtCsvInput").addEventListener("change", async (event) => {
      const input = event.currentTarget;
      const status = document.getElementById("debtCsvStatus");
      preparedDebtCsvRows = [];
      status.textContent = "";
      const file = input.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        status.textContent = "Elige un archivo con extensión .csv.";
        return;
      }
      if (!deps.storeId()) {
        status.textContent = "Selecciona una tienda antes de adaptar el CSV.";
        return;
      }
      const targetStoreId = deps.storeId();
      const importVersion = ++debtCsvImportVersion;
      status.textContent = "La IA está interpretando las columnas y los montos…";
      try {
        const csv = await file.text();
        try {
          const normalized = await api(`/stores/${targetStoreId}/debt-collection-links/import/normalize`, {
            method: "POST",
            body: JSON.stringify({ csv }),
          });
          if (importVersion !== debtCsvImportVersion || targetStoreId !== deps.storeId()) return;
          preparedDebtCsvRows = Array.isArray(normalized?.debts) ? normalized.debts : [];
          if (!preparedDebtCsvRows.length) throw new Error("La IA no encontró deudas válidas en el archivo.");
          const warnings = Array.isArray(normalized?.warnings) ? normalized.warnings : [];
          const warningSummary = warnings.length ? ` · ${warnings.slice(0, 2).join(" ")}${warnings.length > 2 ? ` (+${warnings.length - 2} más)` : ""}` : "";
          const ignoredColumns = Number(normalized?.ignoredColumnCount || 0);
          const ignoredRows = Number(normalized?.ignoredRowCount || 0);
          const cleanupSummary = [
            ignoredColumns ? `${ignoredColumns} ${ignoredColumns === 1 ? "columna innecesaria omitida" : "columnas innecesarias omitidas"}` : "",
            ignoredRows ? `${ignoredRows} ${ignoredRows === 1 ? "fila innecesaria o excedente omitida" : "filas innecesarias o excedentes omitidas"}` : "",
          ].filter(Boolean).map((summary) => ` · ${summary}`).join("");
          status.textContent = `${file.name} · ${preparedDebtCsvRows.length} ${preparedDebtCsvRows.length === 1 ? "deuda adaptada" : "deudas adaptadas"} con IA${cleanupSummary}${warningSummary}`;
        } catch (aiError) {
          if (importVersion !== debtCsvImportVersion || targetStoreId !== deps.storeId()) return;
          preparedDebtCsvRows = parseDebtCsv(csv);
          status.textContent = `${file.name} · ${preparedDebtCsvRows.length} ${preparedDebtCsvRows.length === 1 ? "deuda lista" : "deudas listas"} · adaptación básica (IA no disponible)`;
        }
      } catch (error) {
        if (importVersion !== debtCsvImportVersion || targetStoreId !== deps.storeId()) return;
        status.textContent = error.message;
      }
    });

    document.getElementById("debtCollectionForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!deps.storeId()) return;
      const form = event.currentTarget;
      const submit = document.getElementById("debtCollectionSubmit");
      const status = document.getElementById("debtCollectionStatus");
      const appendTarget = debtAppendTarget ? { ...debtAppendTarget } : null;
      const targetStoreId = deps.storeId();
      errorEl.textContent = "";
      status.textContent = "";
      try {
        const data = new FormData(form);
        const csvMode = data.get("debtInputMode") === "csv";
        const debts = csvMode ? preparedDebtCsvRows : parseDebtCollectionRows(String(data.get("debts") || ""));
        if (csvMode && !debts.length) throw new Error("Selecciona un CSV válido con al menos una deuda.");
        submit.disabled = true;
        submit.textContent = appendTarget ? "Agregando…" : "Creando…";
        if (appendTarget) {
          await api(`/stores/${targetStoreId}/debt-collection-links/${appendTarget.id}/debts`, {
            method: "POST",
            body: JSON.stringify({ debts }),
          });
          resetDebtCollectionEntry(`${debts.length} ${debts.length === 1 ? "deuda agregada" : "deudas agregadas"} a “${appendTarget.name}”.`);
        } else {
          const link = await api(`/stores/${targetStoreId}/debt-collection-links`, {
            method: "POST",
            body: JSON.stringify({
              name: String(data.get("name") || "").trim(),
              notificationEmail: String(data.get("notificationEmail") || "").trim(),
              currency: "BOB",
              debts,
            }),
          });
          resetDebtCollectionEntry(`${debts.length} ${debts.length === 1 ? "deuda agregada" : "deudas agregadas"} al portal único. El link fue copiado.`);
          await navigator.clipboard.writeText(debtCollectionUrl(link.portalSlug || link.slug)).catch(() => undefined);
        }
        if (targetStoreId === deps.storeId()) {
          renderDebtCollectionLinks(await api(`/stores/${targetStoreId}/debt-collection-links`));
        }
      } catch (error) {
        errorEl.textContent = `${appendTarget ? "Error agregando deudas" : "Error creando la colección"}: ${error.message}`;
      } finally {
        submit.disabled = false;
        submit.textContent = debtAppendTarget ? "Agregar a esta colección" : "Agregar deudas al portal";
      }
    });
  }

  return { init, resetDebtCollectionEntry, renderDebtCollectionLinks };
}
