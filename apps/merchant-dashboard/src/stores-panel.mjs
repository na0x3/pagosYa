import { escapeHtml as esc } from "./html.mjs";
import { isUnfinishedStore } from "./onboarding-walkthrough.mjs";
import { assumedFactsBadge } from "./assumed-facts-badge.mjs";
import { countsLine, designStepItems, importStep, parseExchangeRate, progressLabel, summaryLines } from "./store-import.mjs";
import { openStoreBulkDelete } from "./store-bulk-delete.mjs";

/**
 * Mi tienda: the stores list, store thumbnails, the Shopify import, bulk selection and the current store's banner and
 * links (moved from dashboard.js 2026-10-15, no behaviour change). create…() only looks things up; init() attaches the
 * listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   emailEl, errorEl               the login email input and the dashboard's error banner
 *   canLeaveMerchantStudio, syncMerchantStoreWorkspace, setDashboardView, dashboardAssetUrl, openWalkthrough,
 *   openCreateStore, selectStore, currentStoreUrl, publicStoreUrl, setButtonBusy, storePublicationState, refresh
 *                                  dashboard.js functions this screen calls
 *   storeId()                      the active store id, read at use time
 *   stores(), setStores(stores)    the merchant's stores, read and written at use time
 *   onboardingEnabled()            whether the onboarding walkthrough is on, read at use time
 */
export function createStoresPanel(deps) {
  const { api, emailEl, errorEl, canLeaveMerchantStudio, syncMerchantStoreWorkspace, setDashboardView, dashboardAssetUrl, openWalkthrough, openCreateStore, selectStore, currentStoreUrl, publicStoreUrl, setButtonBusy, storePublicationState, refresh } = deps;
  // The ids picked in the stores list while "Seleccionar" is on; null when it is off.
  let storeSelection = null, visibleStoreIds = [];
  // Spec 2026-10-14 store voice: facts YAPI assumed and still waiting, by store id (GET /assumed-facts/counts).
  let assumedFactCounts = {};
  // Each card's thumbnail runs that store's whole live site (scripts, animations, video) in its own Studio. They load
  // only near the screen, three at a time, and are unloaded when "Mi tienda" is left, so none runs behind other pages.
  const THUMBNAIL_LOADS = 3;
  let thumbnailObserver = null, thumbnailsLoading = 0;
  const thumbnailQueue = [];
  function loadNextThumbnails() {
    while (thumbnailsLoading < THUMBNAIL_LOADS && thumbnailQueue.length) {
      const frame = thumbnailQueue.shift();
      if (!frame.isConnected || frame.getAttribute("src") || document.body.dataset.dashboardView !== "stores") continue;
      thumbnailsLoading++;
      frame.addEventListener("load", () => { thumbnailsLoading = Math.max(0, thumbnailsLoading - 1); loadNextThumbnails(); }, { once: true });
      frame.src = frame.dataset.thumbnailSrc;
    }
  }
  function watchStoreThumbnails() {
    thumbnailObserver?.disconnect(); thumbnailObserver = null; thumbnailQueue.length = 0; thumbnailsLoading = 0;
    if (document.body.dataset.dashboardView !== "stores") return;
    thumbnailObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { thumbnailObserver.unobserve(entry.target); thumbnailQueue.push(entry.target); }
      loadNextThumbnails();
    }, { rootMargin: "240px 0px" });
    document.querySelectorAll("#storeRows iframe[data-thumbnail-src]:not([src])").forEach(frame => thumbnailObserver.observe(frame));
  }
  function unloadStoreThumbnails() {
    thumbnailObserver?.disconnect(); thumbnailObserver = null; thumbnailQueue.length = 0; thumbnailsLoading = 0;
    // Detaching the frame ends its document; a fresh copy without src waits for the next visit.
    document.querySelectorAll("#storeRows iframe[data-thumbnail-src][src]").forEach(frame => { const fresh = frame.cloneNode(false); fresh.removeAttribute("src"); frame.replaceWith(fresh); });
  }
  // Traer mi tienda de Shopify (spec 2026-09-27): paste the address or the CSV, review, import, then pick the look.
  const shopifyImportDialog = document.getElementById("shopifyImportDialog");
  let shopifyImport = null, shopifyImportTimer = null;
  const showShopifyImportMessage = (id, message) => { const box = document.getElementById(id); box.textContent = message || ""; box.hidden = !message; };

  // Previews are limited to 5 per hour (spec 2026-09-27 §4); the throttler's own words are English and technical.
  const shopifyImportError = err => err.status === 429 ? "Ya revisaste varias tiendas seguidas. Espera un rato (hasta una hora) y vuelve a intentarlo." : err.message;

  function showShopifyImportPanel(step) {
    shopifyImportDialog.querySelector(".shopify-import").dataset.step = step;
    shopifyImportDialog.querySelectorAll("[data-panel]").forEach(panel => { panel.hidden = panel.dataset.panel !== step; });
  }

  function renderShopifyImport(view) {
    shopifyImport = view;
    const step = importStep(view);
    showShopifyImportPanel(step);
    if (step === "review") {
      const preview = view.preview;
      document.getElementById("shopifyImportCounts").textContent = countsLine(preview.counts);
      document.getElementById("shopifyImportWarnings").innerHTML = preview.warnings.map(warning => `<li>${esc(warning)}</li>`).join("");
      document.getElementById("shopifyImportRateRow").hidden = !preview.needsExchangeRate;
      document.getElementById("shopifyImportCurrency").textContent = preview.currency;
      document.getElementById("shopifyImportProducts").innerHTML = preview.products.map(product => `<li><label><input type="checkbox" value="${esc(product.externalId)}" ${product.problem ? "disabled" : "checked"}>${product.image ? `<img src="${esc(product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "<span></span>"}<span>${esc(product.name)}</span><span class="faint">${esc(product.price)} ${esc(preview.currency)}</span>${product.problem ? `<em>${esc(product.problem)}</em>` : ""}</label></li>`).join("");
      showShopifyImportMessage("shopifyImportConfirmError", "");
    }
    if (step === "importing") {
      document.getElementById("shopifyImportProgress").textContent = progressLabel(view.progress);
      document.getElementById("shopifyImportBar").value = view.progress?.total ? view.progress.done / view.progress.total : 0;
    }
    if (step === "failed") document.getElementById("shopifyImportError").textContent = view.error || "La importación falló.";
    if (step === "building") document.getElementById("shopifyImportDesignSteps").innerHTML = designStepItems(view.designSteps)
      .map(item => `<li data-state="${esc(item.state)}"><span>${esc(item.label)}</span>${item.detail ? `<small>${esc(item.detail)}</small>` : ""}</li>`).join("");
    shopifyImportDialog.querySelectorAll("[data-import-summary]").forEach(list => { list.innerHTML = summaryLines(view.summary).map(line => `<li>${esc(line)}</li>`).join(""); });
    if (step === "design") {
      shopifyImportDialog.querySelectorAll("[data-free]").forEach(badge => { badge.hidden = !view.freeBuildAvailable; });
      // "Igual que mi Shopify" needs the live store to look at; a CSV alone has no address.
      shopifyImportDialog.querySelectorAll('[data-design="same"], [data-design="redesign"]').forEach(button => {
        button.disabled = !view.freeBuildAvailable || (button.dataset.design === "same" && view.source === "SHOPIFY_CSV");
      });
      showShopifyImportMessage("shopifyImportDesignError", view.designError);
    }
    clearTimeout(shopifyImportTimer);
    if ((step === "importing" || step === "building") && shopifyImportDialog.open) shopifyImportTimer = setTimeout(async () => {
      try { renderShopifyImport(await api(`/store-imports/${view.id}`)); } catch { renderShopifyImport(view); }
    }, 2000);
  }

  function startShopifyImport() {
    clearTimeout(shopifyImportTimer);
    shopifyImport = null;
    showShopifyImportPanel("start");
    showShopifyImportMessage("shopifyImportUrlError", "");
    document.getElementById("shopifyImportUrl").focus();
  }

  async function openShopifyImport() {
    if (!canLeaveMerchantStudio()) return;
    document.getElementById("createStoreDialog").close();
    shopifyImportDialog.showModal();
    // After a reload or on another device, the server knows the last import (final review, Important #7).
    if (!shopifyImport) shopifyImport = await api("/store-imports/latest").catch(() => null);
    // Reopening shows an import already under way (importing, failed, the design choice, YAPI building); a review the
    // merchant cancelled, or a finished import, starts fresh.
    if (shopifyImport && !["review", "done"].includes(importStep(shopifyImport))) renderShopifyImport(shopifyImport);
    else startShopifyImport();
  }
  async function openImportedStore(view = "workspace") {
    shopifyImportDialog.close();
    selectStore(shopifyImport.storeId);
    await refresh();
    history.pushState(null, "", "#dashboard-workspace");
    setDashboardView(view);
  }

  function toggleStoreSelection(id, picked) {
    if (!storeSelection) return;
    if (picked) storeSelection.add(id); else storeSelection.delete(id);
    const row = document.querySelector(`.store-row[data-id="${CSS.escape(id)}"]`);
    row?.classList.toggle("selected", picked);
    const box = row?.querySelector(".store-select");
    if (box) box.checked = picked;
    syncStoreBulkBar();
  }
  function syncStoreBulkBar() {
    const count = storeSelection?.size ?? 0;
    const toggle = document.getElementById("storeSelectToggle");
    toggle.setAttribute("aria-pressed", String(!!storeSelection));
    // The floating YAPI prompt sits where the selection bar does; selecting is a short, focused task.
    document.body.classList.toggle("selecting-stores", !!storeSelection);
    document.getElementById("storeBulkBar").hidden = !storeSelection;
    document.getElementById("storeBulkCount").textContent = `${count} ${count === 1 ? "seleccionada" : "seleccionadas"}`;
    document.getElementById("storeBulkDelete").disabled = !count;
  }
  const setStoreSelection = value => { storeSelection = value; renderStoreRows(deps.stores()); };
  function renderCurrentStoreBanner() {
    const store = deps.stores().find((s) => s.id === deps.storeId());
    document.getElementById("currentStoreLabel").textContent = store ? store.name : "esta tienda";
    document.getElementById("currentStoreLink").value = currentStoreUrl();
    const storeLink = document.getElementById("topbarStoreLink");
    storeLink.hidden = !store;
    if (store) storeLink.href = currentStoreUrl();
  }

  function renderStoreRows(stores) {
    deps.setStores(stores);
    const picker = document.getElementById("sidebarStorePicker");
    picker.innerHTML = stores.length ? stores.map(store => `<option value="${esc(store.id)}">${esc(store.name)}</option>`).join("") : '<option value="">Crea tu primera tienda</option>';
    picker.disabled = !stores.length;

    // If the previously selected store is gone (or nothing was selected yet), fall back
    // to the first store so the store pages always show something usable.
    if (!stores.some((s) => s.id === deps.storeId())) {
      selectStore(stores[0] ? stores[0].id : null);
    }

    picker.value = deps.storeId() || "";
    const search = document.getElementById("storeLibrarySearch").value.trim().toLocaleLowerCase();
    const filter = document.getElementById("storeLibraryStatus").value;
    const statusFor = storePublicationState;
    const visible = stores.filter(store => (!search || store.name.toLocaleLowerCase().includes(search)) && (!filter || statusFor(store) === filter));
    visibleStoreIds = visible.map(store => store.id);
    if (storeSelection) storeSelection = new Set([...storeSelection].filter(id => stores.some(store => store.id === id)));
    document.getElementById("storeLibraryCount").textContent = `${visible.length} de ${stores.length} ${stores.length === 1 ? "tienda" : "tiendas"}`;
    document.getElementById("storeRows").innerHTML = `<button class="store-create-tile" id="openCreateStore" type="button"><span aria-hidden="true">+</span><strong>Crear una tienda</strong><small>Empieza desde cero</small></button><button class="store-create-tile" id="openShopifyImport" type="button"><span aria-hidden="true">↧</span><strong>Traer mi tienda de Shopify</strong><small>Productos, fotos y páginas</small></button>` + visible.map(store => {
      const revision = store.sourceProject?.revision || store.publishedSourceRevision;
      const cover = store.bannerUrl || store.heroSlides?.[0]?.imageUrl || store.publicityImageUrl;
      const preview = revision ? `<iframe data-thumbnail-src="/studio/?thumbnail=1&embedded=1&store=${encodeURIComponent(store.id)}&revision=${Number(revision)}" title="Vista de ${esc(store.name)}" tabindex="-1" aria-hidden="true"></iframe>` : cover ? `<img src="${esc(dashboardAssetUrl(cover))}" alt="" loading="lazy">` : `<div class="store-card-placeholder"><span aria-hidden="true">${esc(store.name.slice(0,1).toUpperCase())}</span><strong>${esc(store.name)}</strong><small>Tu próximo gran comienzo</small></div>`;
      const state = statusFor(store), stateLabel = { published: "Publicada", draft: "Borrador", archived: "Archivada" }[state];
      const picked = !!storeSelection?.has(store.id);
      return `<article class="store-row ${store.id === deps.storeId() ? "active" : ""} ${picked ? "selected" : ""}" data-id="${esc(store.id)}">
        ${storeSelection ? `<input class="store-select" type="checkbox" data-id="${esc(store.id)}" aria-label="Seleccionar ${esc(store.name)}" ${picked ? "checked" : ""}>` : ""}
        <div class="store-card-preview">${preview}</div>
        <div class="store-card-info"><div><h3 class="store-row-name">${esc(store.name)}</h3><p><span class="store-card-status" data-status="${state}">${stateLabel}</span>${store.id === deps.storeId() ? '<span class="store-card-current">Tienda actual</span>' : ''}${isUnfinishedStore(store, deps.onboardingEnabled()) ? '<span class="store-card-status" data-status="draft">Sin terminar</span>' : ''}${assumedFactsBadge(assumedFactCounts[store.id])}</p></div><details class="store-card-menu"><summary aria-label="Opciones de ${esc(store.name)}">•••</summary><div><a class="store-row-open" href="${esc(publicStoreUrl(store))}" target="_blank" rel="noopener noreferrer">Abrir tienda pública</a><button class="ghost delete-store" data-id="${esc(store.id)}" data-name="${esc(store.name)}" type="button">Eliminar tienda</button></div></details></div>
        ${isUnfinishedStore(store, deps.onboardingEnabled()) ? `<button class="primary continue-store store-card-edit" data-id="${esc(store.id)}" type="button">Continuar</button>` : '<span class="store-card-edit">Abrir editor ↗</span>'}
      </article>`;
    }).join("") + (!visible.length ? `<p class="store-library-empty">${stores.length ? "No hay tiendas que coincidan con tu búsqueda." : "Todavía no tienes una tienda. Crea la tuya para comenzar."}</p>` : "");
    document.getElementById("openCreateStore").addEventListener("click", openCreateStore);
    document.getElementById("openShopifyImport").addEventListener("click", openShopifyImport);
    document.querySelectorAll(".store-card-menu").forEach(menu => menu.addEventListener("click", event => event.stopPropagation()));
    watchStoreThumbnails();

    document.getElementById("storeRows").classList.toggle("selecting", !!storeSelection);
    syncStoreBulkBar();
    document.querySelectorAll(".store-select").forEach(box => {
      box.addEventListener("click", event => event.stopPropagation());
      box.addEventListener("change", () => toggleStoreSelection(box.dataset.id, box.checked));
    });
    document.querySelectorAll(".store-row").forEach((row) => {
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `${storeSelection ? "Seleccionar" : "Administrar"} ${stores.find(store => store.id === row.dataset.id)?.name || "tienda"}`);
      row.addEventListener("keydown", event => { if (event.target === row && ["Enter", " "].includes(event.key)) { event.preventDefault(); row.click(); } });
      row.addEventListener("click", async () => {
        if (storeSelection) { toggleStoreSelection(row.dataset.id, !storeSelection.has(row.dataset.id)); return; }
        const changingStore = row.dataset.id !== deps.storeId();
        if (changingStore && !canLeaveMerchantStudio()) return;
        selectStore(row.dataset.id);
        history.pushState(null, "", "#dashboard-workspace");
        setDashboardView("workspace");
        await refresh();
      });
    });
    document.querySelectorAll(".continue-store").forEach(btn => btn.addEventListener("click", async event => {
      event.stopPropagation();
      // The list carries only the progress marker; the full answers come from the lookup.
      const found = (await api(`/stores/onboarding?storeId=${encodeURIComponent(btn.dataset.id)}`).catch(() => ({ store: null }))).store;
      if (found) openWalkthrough(found); else void refresh();
    }));
    document.querySelectorAll(".delete-store").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (deps.storeId() === btn.dataset.id && !canLeaveMerchantStudio()) return;
        if (!confirm(`¿Eliminar la tienda "${btn.dataset.name}" y todos sus productos? Esta acción no se puede deshacer.`)) return;
        try {
          await api(`/stores/${btn.dataset.id}`, { method: "DELETE" });
          if (deps.storeId() === btn.dataset.id) selectStore(null);
          await refresh();
        } catch (err) {
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".store-row-open").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
    });

    syncMerchantStoreWorkspace();
    const hasStore = !!deps.storeId();
    document.getElementById("paymentLinksSection").style.display = hasStore ? "block" : "none";
    document.getElementById("debtCollectionSection").style.display = hasStore ? "block" : "none";
    document.getElementById("quickPaymentSection").style.display = hasStore ? "block" : "none";
    document.getElementById("noStoreMessage").style.display = hasStore ? "none" : "block";
    if (hasStore && !document.getElementById("debtNotificationEmail").value) {
      document.getElementById("debtNotificationEmail").value = emailEl.value;
    }
    renderCurrentStoreBanner();
  }
  /** Loads the counts after the store list and repaints the cards; a failed load shows no count. Never rejects. */
  async function loadAssumedFactCounts() {
    try {
      assumedFactCounts = (await api("/assumed-facts/counts"))?.counts || {};
      renderStoreRows(deps.stores());
    } catch { /* the cards show no count */ }
  }

  function init() {
    shopifyImportDialog.querySelectorAll("[data-import-another]").forEach(button => button.addEventListener("click", startShopifyImport));
    document.querySelector("[data-open-shopify-import]").addEventListener("click", openShopifyImport);
    shopifyImportDialog.addEventListener("close", () => clearTimeout(shopifyImportTimer));
    shopifyImportDialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => shopifyImportDialog.close()));
    document.getElementById("shopifyImportUrlForm").addEventListener("submit", async event => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      showShopifyImportMessage("shopifyImportUrlError", "");
      setButtonBusy(submit, true, "Leyendo tu tienda…");
      try { renderShopifyImport(await api("/store-imports/shopify", { method: "POST", body: JSON.stringify({ url: document.getElementById("shopifyImportUrl").value }) })); }
      catch (err) {
        if (err.code === "protected") document.getElementById("shopifyImportCsv").open = true;
        showShopifyImportMessage("shopifyImportUrlError", shopifyImportError(err));
      } finally { setButtonBusy(submit, false, "Revisar"); }
    });
    document.getElementById("shopifyImportCsvForm").addEventListener("submit", async event => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      const file = document.getElementById("shopifyImportCsvFile").files[0];
      if (!file) return;
      setButtonBusy(submit, true, "Leyendo el archivo…");
      try { renderShopifyImport(await api("/store-imports/shopify-csv", { method: "POST", body: JSON.stringify({ csv: await file.text(), name: document.getElementById("shopifyImportCsvName").value }) })); }
      catch (err) { showShopifyImportMessage("shopifyImportUrlError", shopifyImportError(err)); }
      finally { setButtonBusy(submit, false, "Revisar archivo"); }
    });
    document.getElementById("shopifyImportConfirm").addEventListener("click", async event => {
      const button = event.currentTarget;
      const excluded = [...document.querySelectorAll("#shopifyImportProducts input:not(:checked):not(:disabled)")].map(input => input.value);
      const rate = shopifyImport.preview.needsExchangeRate ? parseExchangeRate(document.getElementById("shopifyImportRate").value) : null;
      if (shopifyImport.preview.needsExchangeRate && !rate) {
        showShopifyImportMessage("shopifyImportConfirmError", `Escribe cuántos bolivianos vale 1 ${shopifyImport.preview.currency}.`);
        document.getElementById("shopifyImportRate").focus();
        return;
      }
      setButtonBusy(button, true, "Importando…");
      try { renderShopifyImport(await api(`/store-imports/${shopifyImport.id}/confirm`, { method: "POST", body: JSON.stringify({ excluded, ...(rate ? { exchangeRate: rate } : {}) }) })); }
      catch (err) { showShopifyImportMessage("shopifyImportConfirmError", err.message); }
      finally { setButtonBusy(button, false, "Importar"); }
    });
    document.getElementById("shopifyImportRetry").addEventListener("click", async () => {
      try { renderShopifyImport(await api(`/store-imports/${shopifyImport.id}/retry`, { method: "POST" })); }
      catch (err) { document.getElementById("shopifyImportError").textContent = err.message; }
    });
    shopifyImportDialog.querySelectorAll("[data-design]").forEach(button => button.addEventListener("click", async () => {
      if (button.dataset.design === "template") return openImportedStore("templates");
      showShopifyImportMessage("shopifyImportDesignError", "");
      try { renderShopifyImport(await api(`/store-imports/${shopifyImport.id}/design`, { method: "POST", body: JSON.stringify({ option: button.dataset.design }) })); }
      catch (err) { showShopifyImportMessage("shopifyImportDesignError", err.message); }
    }));
    document.getElementById("shopifyImportOpen").addEventListener("click", () => openImportedStore());
    document.getElementById("storeSelectToggle").addEventListener("click", () => setStoreSelection(storeSelection ? null : new Set()));
    document.getElementById("storeBulkCancel").addEventListener("click", () => setStoreSelection(null));
    // Only the stores the current search and filter show.
    document.getElementById("storeSelectAll").addEventListener("click", () => setStoreSelection(new Set([...(storeSelection ?? []), ...visibleStoreIds])));
    document.getElementById("storeBulkDelete").addEventListener("click", () => {
      const ids = [...(storeSelection ?? [])];
      if (!ids.length || (ids.includes(deps.storeId()) && !canLeaveMerchantStudio())) return;
      openStoreBulkDelete({
        ids,
        names: new Map(deps.stores().map(store => [store.id, store.name])),
        remove: id => api(`/stores/${encodeURIComponent(id)}`, { method: "DELETE" }),
        archive: id => api(`/stores/${encodeURIComponent(id)}/archive`, { method: "POST" }),
        onFinished: async () => { storeSelection = null; await refresh(); },
      });
    });
    document.getElementById("storeLibrarySearch").addEventListener("input", () => renderStoreRows(deps.stores()));
    document.getElementById("storeLibraryStatus").addEventListener("change", () => renderStoreRows(deps.stores()));
    document.getElementById("sidebarStorePicker").addEventListener("change", async event => {
      const nextId = event.target.value;
      if (nextId === deps.storeId()) return;
      if (!canLeaveMerchantStudio()) { event.target.value = deps.storeId() || ""; return; }
      selectStore(nextId); await refresh();
    });
    document.getElementById("copyCurrentStoreLink").addEventListener("click", async () => {
      const url = currentStoreUrl();
      if (!url) return;
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById("copyCurrentStoreLink");
      const original = btn.textContent;
      btn.textContent = "¡Copiado!";
      setTimeout(() => (btn.textContent = original), 1200);
    });
    document.getElementById("shareCurrentStoreLink").addEventListener("click", async () => {
      const store = deps.stores().find((item) => item.id === deps.storeId());
      const url = store ? publicStoreUrl(store) : "";
      if (!url) return;
      const btn = document.getElementById("shareCurrentStoreLink");
      const original = btn.textContent;
      try {
        if (navigator.share) {
          await navigator.share({ title: store.name, text: `Visita ${store.name} en pagosYa`, url });
          btn.textContent = "¡Compartido!";
        } else {
          await navigator.clipboard.writeText(url);
          btn.textContent = "Link copiado";
        }
      } catch (error) {
        if (error?.name === "AbortError") return;
        await navigator.clipboard.writeText(url).catch(() => undefined);
        btn.textContent = "Link copiado";
      }
      setTimeout(() => (btn.textContent = original), 1400);
    });
  }

  return { init, watchStoreThumbnails, unloadStoreThumbnails, openShopifyImport, renderCurrentStoreBanner, renderStoreRows, loadAssumedFactCounts };
}
