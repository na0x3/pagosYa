// Merchant dashboard behavior. The current website editor is mounted in Studio.
import { profileInitials } from "/src/profile-initials.mjs";
import { createStoreBody } from "/src/create-store.mjs";
import { escapeHtml as esc } from "/src/html.mjs";
import { runWalkthrough, showWalkthroughChoice, walkthroughEntry } from "/src/onboarding-walkthrough.mjs";
import { mountCobrosPanel } from "/src/cobros-panel.mjs";
import { mountSubscriptionsPanel } from "/src/subscriptions-panel.mjs";
import { mountGrowthPanel } from "/src/growth-panel.mjs";
import { mountAbandonedCartsPanel } from "/src/abandoned-carts-panel.mjs";
import { mountAssistantPanel } from "/src/assistant-panel.mjs";
import { mountProposalsPanel } from "/src/proposals-panel.mjs";
import { mountContractsPanel } from "/src/contracts-panel.mjs";
import { greetingFor, kycStatusLabel, overviewKpis, renderOverviewKpis, renderSetupSteps, setupSteps } from "/src/overview.mjs";
import { createInboxPanel } from "/src/inbox-panel.mjs";
import { createDiscountsPanel } from "/src/discounts-panel.mjs";
import { createProductsPanel } from "/src/products-panel.mjs";
import { createDebtLinksPanel } from "/src/debt-links-panel.mjs";
import { createQuickPaymentPanel } from "/src/quick-payment-panel.mjs";
import { createFinancesPanel } from "/src/finances-panel.mjs";
import { createOrdersPanel } from "/src/orders-panel.mjs";
import { createStoresPanel } from "/src/stores-panel.mjs";
import { createInventoryImportPanel } from "/src/inventory-import-panel.mjs";
import { createAccountPanel } from "/src/account-panel.mjs";

  (() => {
  // The dashboard ships a single light theme; drop any preference left by the old switcher.
  try { localStorage.removeItem("pagosya_dashboard_theme"); } catch { /* storage unavailable */ }

  // Keep the finance summary current while the merchant leaves the dashboard open.
  window.setInterval(() => {
    if (sessionToken && currentStoreId && !document.hidden) refreshFinancesInBackground();
  }, 60_000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && sessionToken && currentStoreId) refreshFinancesInBackground();
  });

  const apiBaseEl = document.getElementById("apiBase");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const passwordVisibilityToggleEl = document.getElementById("passwordVisibilityToggle");
  const moneyVisibilityToggleEl = document.getElementById("moneyVisibilityToggle");
  const moneyVisibilityLabelEl = document.getElementById("moneyVisibilityLabel");
  const errorEl = document.getElementById("error");
  const infoEl = document.getElementById("info");
  const appEl = document.getElementById("app");
  const loginFormEl = document.getElementById("loginForm");
  const forgotFormEl = document.getElementById("forgotForm");
  const loggedInBarEl = document.getElementById("loggedInBar");
  const loggedInAsEl = document.getElementById("loggedInAs");
  const profileMenuEl = document.getElementById("profileMenu");
  const profileMenuTriggerEl = document.getElementById("profileMenuTrigger");
  const profileTriggerAvatarEl = document.getElementById("profileTriggerAvatar");
  const profileMenuAvatarEl = document.getElementById("profileMenuAvatar");
  const accountAvatarEl = document.getElementById("accountAvatar");
  const profileDisplayNameEl = document.getElementById("profileDisplayName");
  const profileSessionsEl = document.getElementById("profileSessions");
  const profileSessionCountEl = document.getElementById("profileSessionCount");
  const sessionProfileDialogEl = document.getElementById("sessionProfileDialog");
  const sessionProfileFormEl = document.getElementById("sessionProfileForm");
  const sessionProfileExistingEl = document.getElementById("sessionProfileExisting");
  const sessionProfileChoicesEl = document.getElementById("sessionProfileChoices");
  const sessionProfileNameEl = document.getElementById("sessionProfileName");
  const sessionProfileErrorEl = document.getElementById("sessionProfileError");
  const sessionProfileContinueEl = document.getElementById("sessionProfileContinue");

  const savedApiBase = sessionStorage.getItem("pagosya_merchant_api_base");
  apiBaseEl.value = savedApiBase === "http://localhost:3000/v1" ? "http://localhost:3001/v1" : savedApiBase || apiBaseEl.value;
  if (savedApiBase === "http://localhost:3000/v1") sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value);
  emailEl.value = sessionStorage.getItem("pagosya_merchant_email") || emailEl.value;
  let sessionToken = sessionStorage.getItem("pagosya_merchant_session") || "";
  let currentProfileName = "";
  let lastProfileSessionsPayload = null;
  let editingProfileSessionId = null;
  let pendingLoginSessionId = null;
  let pendingLoginAvatarId = 1;
  let resolveProfileSelection = null;

  function profileNameFromEmail(email) {
    const localPart = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
    if (!localPart) return "Mi perfil";
    return localPart.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
  }

  /** A profile's picture is its initials. Where a heading or label already names the person it is decorative. */
  function initialsHtml(name, decorative = true) {
    return `<span class="profile-initials"${decorative ? ' aria-hidden="true"' : ` role="img" aria-label="${esc(name)}"`}>${esc(profileInitials(name))}</span>`;
  }

  // The API still stores an avatar number per session; the dashboard no longer shows it and saves back what it read.
  const storedAvatarId = (session) => Number(session?.profileAvatarId) || 1;

  function renderProfileAvatar() {
    const name = currentProfileName || profileNameFromEmail(emailEl.value);
    profileTriggerAvatarEl.innerHTML = initialsHtml(name);
    profileMenuAvatarEl.innerHTML = initialsHtml(name, false);
    if (accountAvatarEl) accountAvatarEl.innerHTML = initialsHtml(name);
  }

  function applyProfileIdentity() {
    const email = emailEl.value || "tu cuenta del panel";
    profileDisplayNameEl.textContent = currentProfileName || profileNameFromEmail(email);
    loggedInAsEl.textContent = email;
    profileMenuTriggerEl.setAttribute("aria-label", `Abrir perfil de ${email}`);
    renderProfileAvatar();
    document.getElementById("overviewGreeting").textContent = greetingFor(new Date(), currentProfileName);
  }

  function applyCurrentSessionIdentity(session) {
    if (!session) return;
    currentProfileName = session.profileName || profileNameFromEmail(emailEl.value);
    profileDisplayNameEl.textContent = currentProfileName;
    renderProfileAvatar();
  }
  renderProfileAvatar();

  function positionProfileMenu() {
    if (!profileMenuEl.matches(":popover-open")) return;
    const triggerRect = profileMenuTriggerEl.getBoundingClientRect();
    const gutter = 12;
    const width = Math.min(372, window.innerWidth - gutter * 2);
    const height = Math.min(profileMenuEl.scrollHeight, window.innerHeight - gutter * 2);
    profileMenuEl.style.left = `${Math.max(gutter, Math.min(triggerRect.right - width, window.innerWidth - width - gutter))}px`;
    profileMenuEl.style.top = `${Math.max(gutter, Math.min(triggerRect.bottom + 10, window.innerHeight - height - gutter))}px`;
  }

  function formatSessionDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function renderProfileSessions(payload) {
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    const limit = Number(payload?.limit) || 3;
    const active = Number.isFinite(Number(payload?.active)) ? Number(payload.active) : sessions.length;
    lastProfileSessionsPayload = { ...payload, limit, active, sessions };
    profileSessionCountEl.textContent = `${active} / ${limit}`;
    if (!sessions.length) {
      profileSessionsEl.innerHTML = '<p class="profile-session-state">No se encontraron sesiones activas.</p>';
      requestAnimationFrame(positionProfileMenu);
      return;
    }
    applyCurrentSessionIdentity(sessions.find((session) => session.current));
    profileSessionsEl.innerHTML = sessions.map((session) => `<div class="profile-session-row">
      <div class="profile-session-person">
        <span class="profile-session-avatar">${initialsHtml(session.profileName || "Sin nombre")}</span>
        <div class="profile-session-copy"><strong>${esc(session.profileName || "Sin nombre")}</strong><small>Inicio: ${esc(formatSessionDate(session.createdAt))}${session.isPrimary ? " · Principal" : ""}</small></div>
      </div>
      <div class="profile-session-actions">
        ${session.current ? '<span class="profile-session-current">Esta sesión</span>' : ""}
        ${(session.current || payload.canManageSessions) ? `<button class="profile-session-action" type="button" data-edit-session="${esc(session.id)}" aria-label="Cambiar nombre de ${esc(session.profileName || "esta sesión")}" title="Cambiar nombre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>` : ""}
        ${!session.current && payload.canManageSessions ? `<button class="profile-session-action" type="button" data-revoke-session="${esc(session.id)}" aria-label="Cerrar la sesión de ${esc(session.profileName || "este perfil")}" title="Cerrar esta sesión"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
      </div>
      ${editingProfileSessionId === session.id ? `<form class="profile-session-edit-form" data-session-edit-form="${esc(session.id)}" data-avatar-id="${storedAvatarId(session)}">
        <label>Nombre del perfil<input name="profileName" value="${esc(session.profileName || "")}" maxlength="32" autocomplete="off" required></label>
        <div class="profile-session-edit-actions"><button class="ghost" type="button" data-cancel-session-edit>Cancelar</button><button class="primary" type="submit">Guardar</button></div>
      </form>` : ""}
    </div>`).join("");
    requestAnimationFrame(positionProfileMenu);
  }

  async function loadProfileSessions(showLoading = true) {
    if (showLoading) {
      profileSessionCountEl.textContent = "— / 3";
      profileSessionsEl.innerHTML = '<p class="profile-session-state">Revisando sesiones…</p>';
    }
    try {
      const payload = await api("/dashboard/sessions");
      renderProfileSessions(payload);
      return payload;
    } catch (error) {
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos cargar las sesiones. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
      requestAnimationFrame(positionProfileMenu);
      throw error;
    }
  }

  function updateProfileSession(sessionId, profileName, profileAvatarId) {
    return api(`/dashboard/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ profileName, profileAvatarId }),
    });
  }

  function renderSessionProfileChoices(payload, currentSession) {
    const seen = new Set();
    const choices = (payload?.profiles?.length ? payload.profiles : payload?.sessions || []).filter((session) => {
      const name = String(session.profileName || "").trim();
      if (!name || name === "Seleccionar perfil") return false;
      const key = name.toLocaleLowerCase("es");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    sessionProfileExistingEl.hidden = choices.length === 0;
    sessionProfileChoicesEl.innerHTML = choices.map((session) => `<button class="session-profile-choice" type="button" data-profile-choice-name="${esc(session.profileName)}" aria-pressed="false">
      <span class="session-profile-choice-avatar">${initialsHtml(session.profileName)}</span><span>${esc(session.profileName)}</span>
    </button>`).join("");

    const isUnassigned = !currentSession?.profileName || currentSession.profileName === "Seleccionar perfil";
    sessionProfileNameEl.value = isUnassigned ? "" : currentSession.isPrimary ? profileNameFromEmail(emailEl.value) : currentSession.profileName;
    pendingLoginAvatarId = storedAvatarId(currentSession);
  }

  async function chooseProfileForNewLogin(loginResult) {
    let payload;
    try {
      payload = await api("/dashboard/sessions");
    } catch {
      payload = { sessions: loginResult.session ? [{ ...loginResult.session, current: true }] : [] };
    }
    const currentSession = payload.sessions?.find((session) => session.current) || loginResult.session;
    if (!currentSession?.id) return;
    pendingLoginSessionId = currentSession.id;
    renderSessionProfileChoices(payload, currentSession);
    sessionProfileErrorEl.hidden = true;
    sessionProfileErrorEl.textContent = "";
    sessionProfileDialogEl.showModal();
    window.setTimeout(() => sessionProfileNameEl.focus(), 0);
    await new Promise((resolve) => { resolveProfileSelection = resolve; });
  }

  sessionProfileChoicesEl.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-profile-choice-name]");
    if (!choice) return;
    sessionProfileChoicesEl.querySelectorAll("[data-profile-choice-name]").forEach((button) => button.setAttribute("aria-pressed", String(button === choice)));
    sessionProfileNameEl.value = choice.dataset.profileChoiceName;
  });
  sessionProfileNameEl.addEventListener("input", () => {
    sessionProfileChoicesEl.querySelectorAll("[data-profile-choice-name]").forEach((button) => button.setAttribute("aria-pressed", "false"));
  });
  sessionProfileDialogEl.addEventListener("cancel", (event) => event.preventDefault());
  sessionProfileFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const profileName = sessionProfileNameEl.value.trim().replace(/\s+/g, " ");
    if (!profileName || !pendingLoginSessionId) {
      sessionProfileErrorEl.textContent = "Escribe o elige un nombre para identificar esta sesión.";
      sessionProfileErrorEl.hidden = false;
      sessionProfileNameEl.focus();
      return;
    }
    setButtonBusy(sessionProfileContinueEl, true, "Guardando perfil…");
    sessionProfileErrorEl.hidden = true;
    try {
      await updateProfileSession(pendingLoginSessionId, profileName, pendingLoginAvatarId);
      currentProfileName = profileName;
      profileDisplayNameEl.textContent = currentProfileName;
      renderProfileAvatar();
      sessionProfileDialogEl.close();
      const resolve = resolveProfileSelection;
      resolveProfileSelection = null;
      pendingLoginSessionId = null;
      resolve?.();
    } catch (error) {
      sessionProfileErrorEl.textContent = `No pudimos guardar el perfil. ${error.message}`;
      sessionProfileErrorEl.hidden = false;
    } finally {
      setButtonBusy(sessionProfileContinueEl, false, "Entrar al panel");
    }
  });

  profileMenuEl.addEventListener("toggle", () => {
    const open = profileMenuEl.matches(":popover-open");
    profileMenuTriggerEl.setAttribute("aria-expanded", String(open));
    if (!open) return;
    positionProfileMenu();
    loadProfileSessions().catch(() => undefined);
  });
  window.addEventListener("resize", positionProfileMenu);
  window.addEventListener("scroll", positionProfileMenu, true);
  profileSessionsEl.addEventListener("click", async (event) => {
    if (event.target.closest("[data-retry-sessions]")) {
      loadProfileSessions().catch(() => undefined);
      return;
    }
    const editButton = event.target.closest("[data-edit-session]");
    if (editButton) {
      editingProfileSessionId = editButton.dataset.editSession;
      renderProfileSessions(lastProfileSessionsPayload);
      profileSessionsEl.querySelector(`[data-session-edit-form="${CSS.escape(editingProfileSessionId)}"] input`)?.focus();
      return;
    }
    if (event.target.closest("[data-cancel-session-edit]")) {
      editingProfileSessionId = null;
      renderProfileSessions(lastProfileSessionsPayload);
      return;
    }
    const button = event.target.closest("[data-revoke-session]");
    if (!button) return;
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      await api(`/dashboard/sessions/${encodeURIComponent(button.dataset.revokeSession)}`, { method: "DELETE" });
      await loadProfileSessions();
    } catch (error) {
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos cerrar esa sesión. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
    }
  });
  profileSessionsEl.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-session-edit-form]");
    if (!form) return;
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    setButtonBusy(submitButton, true, "Guardando…");
    try {
      await updateProfileSession(form.dataset.sessionEditForm, form.elements.profileName.value, Number(form.dataset.avatarId));
      editingProfileSessionId = null;
      await loadProfileSessions(false);
    } catch (error) {
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos cambiar ese perfil. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
    }
  });

  const checkoutOriginEl = document.getElementById("checkoutOrigin");
  const savedCheckoutOrigin = sessionStorage.getItem("pagosya_checkout_origin");
  checkoutOriginEl.value = savedCheckoutOrigin === "http://localhost:5174" ? "http://localhost:5175" : savedCheckoutOrigin || checkoutOriginEl.value;
  if (savedCheckoutOrigin === "http://localhost:5174") sessionStorage.setItem("pagosya_checkout_origin", checkoutOriginEl.value);
  let lastPaymentLinks = [];
  // Descuentos: promo codes and the bulk discount studio (src/discounts-panel.mjs).
  const discountsPanel = createDiscountsPanel({
    api, errorEl, infoEl, setButtonBusy, money,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    paymentLinks: () => lastPaymentLinks,
    renderPaymentLinkRows: (...args) => renderPaymentLinkRows(...args),
    normalizeProductSearch: (...args) => normalizeProductSearch(...args),
  });
  const { bulkDiscountStudioEl, bulkDiscountClearAllEl, renderPromoCodes, renderBulkDiscountProducts } = discountsPanel;
  discountsPanel.init();
  // Productos: payment links list, search and the edit guide (src/products-panel.mjs).
  const productsPanel = createProductsPanel({
    api, errorEl, infoEl, money, syncStoreResourceViews, dashboardAssetUrl, bulkDiscountStudioEl, bulkDiscountClearAllEl,
    storeId: () => currentStoreId,
    categories: () => lastCategories,
    paymentLinks: () => lastPaymentLinks,
    setPaymentLinks: (links) => { lastPaymentLinks = links; },
    renderBulkDiscountProducts: (...args) => renderBulkDiscountProducts(...args),
    refreshFinancesInBackground: (...args) => refreshFinancesInBackground(...args),
  });
  const { beginPaymentLinkEdit, renderPaymentLinkRows, normalizeProductSearch, resetPaymentLinkBrowseState } = productsPanel;
  productsPanel.init();
  let lastDebtCollectionLinks = [];
  // Cobrar deudas: debt collection links (src/debt-links-panel.mjs).
  const debtLinksPanel = createDebtLinksPanel({
    api, apiBaseEl, emailEl, errorEl, infoEl, checkoutOriginEl, money,
    storeId: () => currentStoreId,
    sessionToken: () => sessionToken,
    debtLinks: () => lastDebtCollectionLinks,
    setDebtLinks: (links) => { lastDebtCollectionLinks = links; },
  });
  const { resetDebtCollectionEntry, renderDebtCollectionLinks } = debtLinksPanel;
  debtLinksPanel.init();
  // Cobro rápido (src/quick-payment-panel.mjs).
  const quickPaymentPanel = createQuickPaymentPanel({
    api,
    storeId: () => currentStoreId,
    refreshFinancesInBackground: (...args) => refreshFinancesInBackground(...args),
  });
  const { stopQuickPaymentPolling } = quickPaymentPanel;
  quickPaymentPanel.init();
  let lastPayments = [];
  let lastPayouts = [];
  let lastFinances = null;
  // Documentos → Cobros (D1); the module owns its view, this is only the glue.
  const cobros = mountCobrosPanel({
    api,
    storeId: () => currentStoreId,
    store: () => lastStores.find((candidate) => candidate.id === currentStoreId) || null,
    signedIn: () => !!sessionToken,
    invoicingReady: () => Boolean(lastInvoicingProfile?.cuis),
    apiBase: () => apiBaseEl.value,
  });
  // Suscripciones: subscribers and per-product frequencies; the module owns its view.
  const subscriptionsPanel = mountSubscriptionsPanel({
    api,
    storeId: () => currentStoreId,
    signedIn: () => !!sessionToken,
    products: () => lastPaymentLinks,
  });
  // Documentos → Propuestas (D2); an accepted proposal hands its new cobro to the Cobros view.
  const proposals = mountProposalsPanel({
    api,
    storeId: () => currentStoreId,
    store: () => lastStores.find((candidate) => candidate.id === currentStoreId) || null,
    signedIn: () => !!sessionToken,
    apiBase: () => apiBaseEl.value,
    openCobro: (id, options) => {
      setDashboardView("cobros");
      cobros.open(id, options);
    },
    // D3: "Crear contrato" on an accepted proposal opens the Contratos composer, prefilled.
    openContract: (proposal) => {
      setDashboardView("contracts");
      contracts.startFromProposal(proposal);
    },
  });
  // Documentos → Contratos (D3).
  const contracts = mountContractsPanel({
    api,
    storeId: () => currentStoreId,
    store: () => lastStores.find((candidate) => candidate.id === currentStoreId) || null,
    signedIn: () => !!sessionToken,
    apiBase: () => apiBaseEl.value,
  });
  // Crecimiento (G2): each insight opens the screen that does the work, already filled in; nothing is applied from there.
  const growth = mountGrowthPanel({
    api,
    storeId: () => currentStoreId,
    store: () => lastStores.find((candidate) => candidate.id === currentStoreId) || null,
    signedIn: () => !!sessionToken,
    publicUrl: (store) => (store?.slug ? publicStoreUrl(store) : ""),
    openView: (view) => {
      history.pushState(null, "", `#dashboard-${view}`);
      setDashboardView(view);
      document.querySelector(".workspace-header")?.scrollIntoView({ block: "start" });
    },
    composeYapi: (text) => {
      pendingStudioAction = { action: "compose", origin: "growth", text, storeId: currentStoreId };
      history.pushState(null, "", "#dashboard-workspace");
      setDashboardView("workspace");
      deliverStudioAction();
    },
    editProduct: async (productId, step) => {
      let link = lastPaymentLinks.find((candidate) => candidate.id === productId);
      if (!link && currentStoreId) {
        try { link = (await api(`/stores/${currentStoreId}/payment_links`)).find((candidate) => candidate.id === productId); } catch { link = null; }
      }
      if (!link) return false;
      history.pushState(null, "", "#dashboard-products");
      setDashboardView("products");
      beginPaymentLinkEdit(link, step);
      return true;
    },
  });
  // Crecer › Carritos abandonados: who left without paying and how to reach them; read-only.
  const abandonedCarts = mountAbandonedCartsPanel({
    api,
    storeId: () => currentStoreId,
    store: () => lastStores.find((candidate) => candidate.id === currentStoreId) || null,
    signedIn: () => !!sessionToken,
  });
  // Crecer › Asistente: settings, test chat, conversations and unanswered questions.
  const assistantPanel = mountAssistantPanel({
    api,
    storeId: () => currentStoreId,
    store: () => lastStores.find((candidate) => candidate.id === currentStoreId) || null,
    signedIn: () => !!sessionToken,
    uploadFile,
    assetUrl: (path) => `${apiRoot()}${path}`,
  });
  let lastTotalFinances = null;
  let lastBalances = null;
  let lastSettlement = null;
  const MONEY_VISIBILITY_KEY = "pagosya_dashboard_hide_money";
  let monetaryValuesHidden = false;
  try {
    monetaryValuesHidden = localStorage.getItem(MONEY_VISIBILITY_KEY) === "true";
  } catch {
    // Keep the control usable for this visit if browser storage is unavailable.
  }
  // Pedidos: orders table, filters and CSV/PDF downloads (src/orders-panel.mjs).
  const ordersPanel = createOrdersPanel({
    api, apiBaseEl, errorEl, infoEl, money, refresh,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    payments: () => lastPayments,
    finances: () => lastFinances,
    sessionToken: () => sessionToken,
  });
  const { renderPaymentRows, resetPaymentPage } = ordersPanel;
  ordersPanel.init();
  let lastStores = [];
  // Mi tienda: the stores list, thumbnails, Shopify import, selection and the current store's links (src/stores-panel.mjs).
  // Created here, before setDashboardView first runs at load: it calls watchStoreThumbnails/unloadStoreThumbnails.
  const storesPanel = createStoresPanel({
    api, emailEl, errorEl, canLeaveMerchantStudio, syncMerchantStoreWorkspace, setDashboardView, dashboardAssetUrl,
    openWalkthrough, openCreateStore, selectStore, currentStoreUrl, publicStoreUrl, setButtonBusy, storePublicationState, refresh,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    setStores: (stores) => { lastStores = stores; },
    onboardingEnabled: () => onboardingEnabled,
  });
  const { watchStoreThumbnails, unloadStoreThumbnails, openShopifyImport, renderCurrentStoreBanner, renderStoreRows } = storesPanel;
  storesPanel.init();
  let storeSettings = null;
  let emailStudio = null;
  let settingsTabs = null;
  let lastInvoicingProfile = null;
  let lastKyc = null;
  let lastCategories = [];
  let dashboardRefreshVersion = 0;
  let currentStoreId = sessionStorage.getItem("pagosya_current_store_id") || null;
  const dashboardSections = new Map();

  function setDashboardSectionExpanded(sectionId, expanded, remember = true) {
    const entry = dashboardSections.get(sectionId);
    if (!entry) return;
    entry.body.hidden = !expanded;
    entry.panel.classList.toggle("is-collapsed", !expanded);
    entry.toggle.setAttribute("aria-expanded", String(expanded));
    entry.toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} ${entry.title}`);
    entry.toggle.title = `${expanded ? "Ocultar" : "Mostrar"} ${entry.title}`;
    entry.toggle.querySelector("span").textContent = expanded ? "Ocultar" : "Mostrar";
    if (remember) localStorage.setItem(`pagosya_dashboard_section_${sectionId}`, String(expanded));
  }

  // A page whose only block starts collapsed reads as a broken page: the
  // merchant gets the heading and toolbar with nothing under them and no sign
  // the content is one click away. Pages that stack several blocks (compliance)
  // still start collapsed — there the overview of what needs attention is the point.
  function initDashboardSections() {
    const blocksPerPage = new Map();
    document.querySelectorAll("section.block[id][data-dashboard-page]").forEach((section) => {
      const page = section.dataset.dashboardPage;
      blocksPerPage.set(page, (blocksPerPage.get(page) ?? 0) + 1);
    });
    document.querySelectorAll("section.block[id] > .panel").forEach((panel) => {
      const section = panel.parentElement;
      const head = panel.querySelector(":scope > .section-head");
      const title = head?.querySelector("h2")?.textContent?.trim();
      if (!head || !title) return;

      const body = document.createElement("div");
      body.className = "section-body";
      body.id = `${section.id}Body`;
      while (head.nextSibling) body.appendChild(head.nextSibling);
      panel.appendChild(body);
      panel.classList.add("collapsible-panel");

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "section-toggle";
      toggle.setAttribute("aria-controls", body.id);
      toggle.innerHTML = `<span>Ocultar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
      head.appendChild(toggle);
      dashboardSections.set(section.id, { body, panel, toggle, title });

      const saved = localStorage.getItem(`pagosya_dashboard_section_${section.id}`);
      const expanded = saved === null ? blocksPerPage.get(section.dataset.dashboardPage) === 1 : saved === "true";
      setDashboardSectionExpanded(section.id, expanded, false);
      toggle.addEventListener("click", () => setDashboardSectionExpanded(section.id, toggle.getAttribute("aria-expanded") !== "true"));
    });
  }

  const COLLAPSE_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function savedExpandedState(key, fallback) {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === "true";
  }

  function initInlineCollapsible(sectionId, headSelector, toggleId, storageKey, label, defaultExpanded) {
    const section = document.getElementById(sectionId);
    const head = section?.querySelector(headSelector);
    const toggle = document.getElementById(toggleId);
    if (!section || !head || !toggle) return;

    const body = document.createElement("div");
    body.className = "nested-section-body";
    body.id = `${sectionId}Body`;
    while (head.nextSibling) body.appendChild(head.nextSibling);
    section.appendChild(body);
    toggle.classList.add("inline-section-toggle");
    toggle.setAttribute("aria-controls", body.id);

    const setExpanded = (expanded, remember = true) => {
      body.hidden = !expanded;
      section.classList.toggle("is-collapsed", !expanded);
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} ${label}`);
      toggle.innerHTML = `<span>${expanded ? "Ocultar" : "Mostrar"}</span>${COLLAPSE_CHEVRON}`;
      if (remember) localStorage.setItem(storageKey, String(expanded));
    };

    setExpanded(savedExpandedState(storageKey, defaultExpanded), false);
    toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
  }

  // The store settings form is injected by a dynamic import long after this
  // first runs, so it runs again over that form once it exists. Sections that
  // already carry their body are left alone, and the remembered key is the
  // section's own heading id so the choice survives a reordering.
  function initDashboardSidebarToggle() {
    const shell = document.querySelector(".dashboard-shell");
    const toggle = document.getElementById("dashboardSidebarToggle");
    if (!shell || !toggle) return;
    const storageKey = "pagosya_dashboard_sidebar_collapsed";
    document.querySelectorAll(".dashboard-nav-button").forEach((link) => {
      link.title = link.textContent.trim();
      link.setAttribute("aria-label", link.title);
    });
    const setCollapsed = (collapsed, remember = true) => {
      shell.classList.toggle("is-sidebar-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute("aria-label", (collapsed ? "Expandir" : "Contraer") + " Gestión del comercio");
      toggle.title = collapsed ? "Expandir menú" : "Contraer menú";
      if (remember) localStorage.setItem(storageKey, String(collapsed));
    };
    setCollapsed(savedExpandedState(storageKey, false), false);
    toggle.addEventListener("click", () => setCollapsed(!shell.classList.contains("is-sidebar-collapsed")));
  }

  /* Solo un grupo abierto: el que contiene la vista actual. */
  function syncNavGroups(view) {
    for (const group of document.querySelectorAll(".dashboard-nav-group")) {
      group.open = !!group.querySelector(`[data-dashboard-view="${view}"]`);
    }
  }
  for (const group of document.querySelectorAll(".dashboard-nav-group")) {
    group.querySelector("summary")?.addEventListener("click", (event) => {
      const shell = document.querySelector(".dashboard-shell");
      // En modo iconos la lista del grupo está oculta: abrirla no serviría de nada.
      if (shell?.classList.contains("is-sidebar-collapsed")) {
        event.preventDefault();
        document.getElementById("dashboardSidebarToggle")?.click();
        group.open = true;
        return;
      }
      if (!group.open) for (const other of document.querySelectorAll(".dashboard-nav-group")) if (other !== group) other.open = false;
    });
  }

  initDashboardSections();
  const DASHBOARD_VIEW_KEY = "pagosya_dashboard_view";
  // Conecta tu IA; mounted by a dynamic import further down, so it may still be null here.
  let mcpConnect = null;
  const DASHBOARD_VIEW_COPY = {
    overview: ["Resumen", "Tu operación, ventas y estado general en un solo lugar."],
    growth: ["Crecimiento", "Qué pasa en tu tienda y qué hacer ahora para vender más."],
    "abandoned-carts": ["Carritos abandonados", "Quién dejó productos sin pagar y cómo escribirle."],
    "assistant": ["Asistente", "Un chat en tu tienda que responde con tus productos y te pasa a los clientes cuando no sabe."],
    stores: ["Mi tienda", "Tus tiendas, sus diseños y sus catálogos. Todo desde un mismo perfil."],
    discounts: ["Correos y marketing", "Cuida a tus clientes y haz que vuelvan."],
    marketing: ["Correos y marketing", "Mensajes, Comeback y promociones para la tienda seleccionada."],
    experiments: ["Pruebas A/B", "Compara dos diseños y descubre cuál convierte más visitas en compras."],
    integrations: ["Integraciones", "Conecta las herramientas que tu tienda necesita."],
    products: ["Productos", "Tu catálogo y YAPI: añade productos paso a paso."],
    media: ["Medios", "Las imágenes, videos e iconos de la tienda seleccionada."],
    templates: ["Plantillas", "Elige una tienda completa y mírala con tus productos antes de usarla."],
    workspace: ["Mi tienda", "Diseña con YAPI y administra tu negocio desde aquí."],
    "charge-links": ["Link de cobro", "Genera un QR inmediato o un portal por carnet para la tienda seleccionada."],
    cobros: ["Cobros", "Crea un cobro, compártelo por WhatsApp o correo y recibe el pago con QR o tarjeta."],
    subscriptions: ["Suscripciones", "Clientes que compran tus productos de forma recurrente."],
    proposals: ["Propuestas", "Describe el trabajo, YAPI arma la propuesta y tu cliente la acepta en línea."],
    contracts: ["Contratos", "Elige el tipo, YAPI redacta las cláusulas y los dos firman en línea con código por correo."],
    inbox: ["Inbox", "Responde a tus compradores y a quien escribió por el formulario de tu tienda."],
    "connect-ai": ["Conecta tu IA", "Usa Claude, ChatGPT, Claude Code, Cursor o Codex con tu tienda. Tu IA diseña y carga productos; publicar y cobrar siguen siendo tuyos."],
    "store-settings": ["Ajustes de la tienda", "Cobro, contacto, ubicaciones y políticas de la tienda seleccionada."],
    payments: ["Pagos", "Consulta el estado y el detalle de tus cobros recientes."],
    payouts: ["Desembolsos", "Revisa las transferencias programadas y completadas."],
    account: ["Cuenta", "Tu perfil, tus accesos y el estado de tu negocio en pagosYa."],
    compliance: ["Cumplimiento y credenciales", "Completa KYC, facturación electrónica y credenciales de producción."],
  };

  let pendingStudioAction = null;
  function deliverStudioAction() {
    const frame = document.getElementById("merchantStudioFrame");
    if (pendingStudioAction?.storeId === currentStoreId && frame.dataset.ready === "true") frame.contentWindow?.postMessage({ type: "pagosya:studio-action", storeId: currentStoreId, ...pendingStudioAction }, location.origin);
  }
  document.getElementById("workspaceYapiForm").addEventListener("submit", event => {
    event.preventDefault();
    const field = document.getElementById("workspaceYapiDraft");
    if (!field.value.trim()) return;
    if (!currentStoreId) { document.getElementById("workspaceYapiStatus").textContent = "Selecciona o crea una tienda para conversar con YAPI."; return; }
    pendingStudioAction = { action: "compose", text: field.value.trim(), storeId: currentStoreId };
    history.pushState(null, "", "#dashboard-workspace"); setDashboardView("workspace"); deliverStudioAction();
  });
  function canLeaveMerchantStudio() {
    try { return ["merchantStudioFrame", "productGuideFrame", "storeMarketingFrame", "storeExperimentsFrame", "storeIntegrationsFrame"].every(id => document.getElementById(id).contentWindow?.pagosyaStudioCanLeave?.() ?? true); } catch { return false; }
  }
  /* Deja Correos y marketing en una pestaña concreta. Correos y Códigos promocionales los dibuja el panel; las demás
     son el Studio en el iframe, que se recarga con ese tab. Plantillas y Flujos eran las pestañas de correos del
     Studio hasta 2026-10-13: quien todavía las pida (un Studio sin recompilar, un enlace guardado) llega a Correos. */
  function selectMarketingTab(tab) {
    if (tab === "templates" || tab === "flows") tab = "emails";
    document.getElementById("marketingTabs").dataset.tab = tab;
    document.querySelectorAll("[data-marketing-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.marketingTab === tab)));
    document.getElementById("marketingPromotions").hidden = tab !== "promotions";
    document.getElementById("marketingEmails").hidden = tab !== "emails";
    document.getElementById("storeMarketingFrame").removeAttribute("src");
  }
  document.getElementById("marketingTabs").addEventListener("click", event => {
    const button = event.target.closest("[data-marketing-tab]"); if (!button) return;
    const frame = document.getElementById("storeMarketingFrame");
    if (frame.contentWindow?.pagosyaStudioCanLeave && !frame.contentWindow.pagosyaStudioCanLeave()) return;
    selectMarketingTab(button.dataset.marketingTab); syncStoreResourceViews("marketing");
  });
  function syncStoreResourceViews(view) {
    for (const [kind, id] of [["media", "storeMediaFrame"], ["templates", "storeTemplatesFrame"], ["products", "productGuideFrame"], ["marketing", "storeMarketingFrame"], ["integrations", "storeIntegrationsFrame"], ["experiments", "storeExperimentsFrame"]]) {
      const frame = document.getElementById(id);
      if (frame.dataset.storeId && frame.dataset.storeId !== currentStoreId) { frame.removeAttribute("src"); delete frame.dataset.storeId; delete frame.dataset.ready; delete frame.dataset.pendingProduct; delete frame.dataset.pendingStep; }
      if (view !== kind) continue;
      frame.hidden = !currentStoreId || !sessionToken || kind === "marketing" && ["emails", "promotions"].includes(document.getElementById("marketingTabs").dataset.tab);
      const empty = document.querySelector(`[data-resource-empty="${kind}"]`); if (empty) empty.hidden = Boolean(currentStoreId && sessionToken);
      if (!frame.hidden && !frame.getAttribute("src")) {
        sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, ""));
        frame.dataset.storeId = currentStoreId;
        frame.src = `/studio/?embedded=1&${kind === "products" ? "productGuide=1" : `library=${kind}${kind === "marketing" ? `&tab=${document.getElementById("marketingTabs").dataset.tab}` : ""}`}&store=${encodeURIComponent(currentStoreId)}`;
      }
    }
    // Correos is drawn here, not in the frame: shown for the selected store (loaded once per store).
    if (view === "marketing" && sessionToken && document.getElementById("marketingTabs").dataset.tab === "emails") emailStudio?.show();
  }
  document.getElementById("startProductGuide").addEventListener("click", () => {
    syncStoreResourceViews("products");
    document.getElementById("productGuideFrame").scrollIntoView({ block: "center", behavior: "smooth" });
    document.getElementById("productGuideFrame").contentWindow?.postMessage({type:"pagosya:product-guide-new"}, location.origin);
  });
  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    const frame = ["storeMediaFrame", "storeTemplatesFrame", "productGuideFrame", "storeMarketingFrame", "storeExperimentsFrame", "storeIntegrationsFrame"].map(id => document.getElementById(id)).find(frame => frame.contentWindow === event.source);
    if (!frame || frame.dataset.storeId !== currentStoreId || event.data?.storeId !== currentStoreId) return;
    if (event.data.type === "pagosya:workspace" && ["marketing", "integrations", "experiments", "workspace"].includes(event.data.view)) {
      if (!canLeaveMerchantStudio()) return;
      if (event.data.view === "marketing" && ["program", "emails", "templates", "flows"].includes(event.data.tab)) selectMarketingTab(event.data.tab);
      history.pushState(null, "", `#dashboard-${event.data.view}`); setDashboardView(event.data.view); return;
    }
    if (event.data.type === "pagosya:template-applied") {
      // The design editor reloads on the new revision; the gallery reloads next time the tab opens.
      const studio = document.getElementById("merchantStudioFrame"); studio.removeAttribute("src"); delete studio.dataset.storeId; delete studio.dataset.ready;
      frame.removeAttribute("src"); delete frame.dataset.storeId;
      history.pushState(null, "", "#dashboard-workspace"); setDashboardView("workspace"); return;
    }
    if (event.data.type === "pagosya:source-publication-changed") { void refresh(); return; }
    // A previewed template takes the whole screen beside the sidebar (dashboard.css, body.template-focus).
    if (event.data.type === "pagosya:template-focus" && frame.id === "storeTemplatesFrame") { document.body.classList.toggle("template-focus", Boolean(event.data.open)); return; }
    // The template gallery is one long page of cards; other resource pages stay capped.
    if (event.data.type === "pagosya:resource-height" && Number.isFinite(event.data.height)) frame.style.height = `${Math.min(frame.id === "storeTemplatesFrame" ? 30000 : 4000, Math.max(340, event.data.height))}px`;
    if (event.data.type === "pagosya:product-guide-ready") {
      frame.dataset.ready = "true";
      if (frame.dataset.pendingProduct) { frame.contentWindow?.postMessage({type:"pagosya:product-guide-edit", storeId:currentStoreId, product:JSON.parse(frame.dataset.pendingProduct), ...(frame.dataset.pendingStep ? { step: frame.dataset.pendingStep } : {})}, location.origin); delete frame.dataset.pendingProduct; delete frame.dataset.pendingStep; }
    }
    if (event.data.type === "pagosya:product-saved") {
      for (const id of ["storeMediaFrame"]) document.getElementById(id).removeAttribute("src");
      void refresh();
    }
  });
  function syncMerchantStoreWorkspace(view = document.body.dataset.dashboardView) {
    // Plantillas reads the store's current revision, which the design editor may have changed: reload it on entry.
    if (view === "templates") { const templatesFrame = document.getElementById("storeTemplatesFrame"); templatesFrame.removeAttribute("src"); delete templatesFrame.dataset.storeId; }
    document.body.classList.remove("template-focus");
    syncStoreResourceViews(view);
    const store = lastStores.find(candidate => candidate.id === currentStoreId);
    const views = ["workspace", "products", "charge-links", "payments", "compliance"];
    document.getElementById("merchantStoreTabs").hidden = !store || !views.includes(view);
    document.getElementById("merchantWorkspaceStoreName").textContent = store?.name || "Mi tienda";
    const frame = document.getElementById("merchantStudioFrame");
    if (!sessionToken || !store || frame.dataset.storeId && frame.dataset.storeId !== store.id) {
      frame.removeAttribute("src"); delete frame.dataset.storeId; delete frame.dataset.ready;
    }
    frame.hidden = !store;
    document.getElementById("merchantStudioEmpty").hidden = Boolean(store);
    if (view === "workspace" && sessionToken && store && !frame.getAttribute("src")) {
      sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, ""));
      frame.dataset.storeId = store.id;
      frame.src = `/studio/?source=1&embedded=1&store=${encodeURIComponent(store.id)}`;
    }
    if (view === "workspace" && frame.getAttribute("src")) frame.contentWindow?.postMessage({ type: "pagosya:catalog-refresh" }, location.origin);
  }
  window.addEventListener("message", event => {
    const frame = document.getElementById("merchantStudioFrame");
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === "pagosya:source-publication-changed" && event.data.storeId === currentStoreId) {
      const store = lastStores.find(s => s.id === currentStoreId);
      if (store) {
        store.publishedSourceRevision = event.data.revision;
        if (typeof event.data.active === 'boolean') store.sourcePublicationPaused = !event.data.active;
        if (typeof event.data.contactFormEnabled === 'boolean') store.contactFormEnabled = event.data.contactFormEnabled;
      }
      return;
    }
    if (event.data?.type === "pagosya:studio-ready" && event.data.storeId === currentStoreId) { frame.dataset.ready = "true"; deliverStudioAction(); return; }
    if (event.data?.type === "pagosya:studio-action-received" && event.data.storeId === currentStoreId) {
      // The dashboard's own YAPI box is emptied once its text is handed over; a Crecimiento suggestion leaves it alone.
      if (pendingStudioAction?.action === "compose" && pendingStudioAction.origin !== "growth") document.getElementById("workspaceYapiDraft").value = "";
      pendingStudioAction = null; return;
    }
    if (event.data?.type === "pagosya:session-expired") { sessionToken = ""; showLoggedOut(); return; }
    if (event.data?.type === "pagosya:workspace" && ["stores", "products", "charge-links", "marketing", "integrations", "experiments", "store-settings"].includes(event.data.view)) {
      if (event.data.view === "marketing" && ["program", "emails", "templates", "flows"].includes(event.data.tab)) selectMarketingTab(event.data.tab);
      history.pushState(null, "", `#dashboard-${event.data.view}`);
      setDashboardView(event.data.view);
      document.getElementById("dashboardWorkspace").scrollIntoView({ block: "start" });
      if (event.data.view === "store-settings" && event.data.section) openSettingsSection(event.data.section);
    }
  });

  function setDashboardView(view, { remember = true } = {}) {
    if (view === "content") view = "workspace";
    if (view === "discounts") { view = "marketing"; selectMarketingTab("promotions"); }
    const nextView = DASHBOARD_VIEW_COPY[view] ? view : "overview";
    const viewChanged = document.body.dataset.dashboardView !== nextView;
    if (viewChanged) {
      document.body.dataset.dashboardView = nextView;
      if (nextView === "stores") watchStoreThumbnails(); else unloadStoreThumbnails();
      document.querySelectorAll("[data-dashboard-page]").forEach((element) => {
        element.hidden = element.dataset.dashboardPage !== nextView;
        element.classList.remove("page-entering");
        if (!element.hidden) {
          requestAnimationFrame(() => element.classList.add("page-entering"));
        }
      });
    }
    document.querySelectorAll("[data-dashboard-view]").forEach((button) => {
      if (button.dataset.dashboardView === nextView && !button.dataset.studioTool) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    syncNavGroups(nextView);
    const [title, description] = DASHBOARD_VIEW_COPY[nextView];
    document.getElementById("workspaceTitle").textContent = title;
    document.getElementById("workspaceDescription").textContent = description;
    if (nextView === "workspace") window.scrollTo({ top: 0, behavior: "instant" });
    syncMerchantStoreWorkspace(nextView);
    if (nextView === "cobros") cobros.show();
    if (nextView === "subscriptions") subscriptionsPanel.show();
    if (nextView === "growth") growth.show();
    if (nextView === "abandoned-carts") abandonedCarts.show();
    if (nextView === "assistant") assistantPanel.show();
    if (nextView === "proposals") proposals.show();
    if (nextView === "contracts") contracts.show();
    if (nextView === "connect-ai" && sessionToken) void mcpConnect?.reload();
    if (remember) {
      try { localStorage.setItem(DASHBOARD_VIEW_KEY, nextView); } catch { /* storage unavailable: the view still opens */ }
    }
  }

  document.querySelectorAll("[data-dashboard-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      history.pushState(null, "", button.href);
      pendingStudioAction = button.dataset.studioTool ? { action: button.dataset.studioTool, storeId: currentStoreId } : pendingStudioAction;
      setDashboardView(button.dataset.dashboardView);
      if (button.dataset.studioTool) {
        document.querySelectorAll('#dashboardNav [data-dashboard-view="workspace"]').forEach(link => link.removeAttribute("aria-current"));
        button.setAttribute("aria-current", "page"); deliverStudioAction();
      }
      document.querySelector(".dashboard-sidebar")?.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
      const menuHandle = document.getElementById("storeFullscreenNavHandle");
      menuHandle?.setAttribute("aria-expanded", "false");
      requestAnimationFrame(() => {
        document.querySelector(".dashboard-sidebar")?.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
        menuHandle?.focus({ preventScroll: true });
      });
      button.scrollIntoView({ block: "nearest", inline: "center" });
      document.querySelector(".workspace-header")?.scrollIntoView({ block: "start" });
    });
  });
  let initialDashboardView = "overview";
  const viewFromHash = location.hash.startsWith("#dashboard-") ? location.hash.slice(11) : "";
  try { initialDashboardView = viewFromHash || localStorage.getItem(DASHBOARD_VIEW_KEY) || "overview"; } catch { initialDashboardView = viewFromHash || "overview"; }
  setDashboardView(initialDashboardView, { remember: false });
  window.addEventListener("popstate", () => setDashboardView(location.hash.slice(11), { remember: false }));
  // Below the desktop breakpoint the sidebar is off-canvas: the menu handle
  // pins it open, hovering peeks, and the backdrop or Escape closes it.
  function initSidebarMenuHandle() {
    const sidebar = document.querySelector(".dashboard-sidebar");
    const navHandle = document.getElementById("storeFullscreenNavHandle");
    const navBackdrop = document.getElementById("storeFullscreenNavBackdrop");
    if (!sidebar || !navHandle || !navBackdrop) return;
    let closePeekTimer = 0;
    const revealNavigation = () => {
      window.clearTimeout(closePeekTimer);
      sidebar.classList.add("is-store-nav-peeking");
    };
    const scheduleNavigationClose = () => {
      window.clearTimeout(closePeekTimer);
      closePeekTimer = window.setTimeout(() => {
        if (!sidebar.matches(":hover") && !sidebar.contains(document.activeElement) && !sidebar.classList.contains("is-store-nav-pinned")) {
          sidebar.classList.remove("is-store-nav-peeking");
        }
      }, 100);
    };
    const closeNavigation = () => {
      sidebar.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
      navHandle.setAttribute("aria-expanded", "false");
      navHandle.focus({ preventScroll: true });
    };
    navHandle.addEventListener("pointerenter", revealNavigation);
    navHandle.addEventListener("pointerleave", scheduleNavigationClose);
    sidebar.addEventListener("pointerenter", revealNavigation);
    sidebar.addEventListener("pointerleave", scheduleNavigationClose);
    navHandle.addEventListener("click", () => {
      const pinned = !sidebar.classList.contains("is-store-nav-pinned");
      sidebar.classList.toggle("is-store-nav-pinned", pinned);
      navHandle.setAttribute("aria-expanded", String(pinned));
      if (pinned) sidebar.querySelector(".dashboard-nav-button[aria-current='page']")?.focus({ preventScroll: true });
    });
    navBackdrop.addEventListener("click", closeNavigation);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !sidebar.classList.contains("is-store-nav-pinned")) return;
      event.preventDefault();
      closeNavigation();
    });
  }

  initDashboardSidebarToggle();
  initSidebarMenuHandle();
  // Importar inventario (src/inventory-import-panel.mjs).
  const inventoryPanel = createInventoryImportPanel({
    api, errorEl, infoEl, checkoutOriginEl, money, initInlineCollapsible, uploadFile,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    paymentLinks: () => lastPaymentLinks,
    categories: () => lastCategories,
    setCategories: (categories) => { lastCategories = categories; },
    renderCurrentStoreBanner: (...args) => renderCurrentStoreBanner(...args),
    renderStoreRows: (...args) => renderStoreRows(...args),
    refreshFinancesInBackground: (...args) => refreshFinancesInBackground(...args),
    renderPaymentLinkRows: (...args) => renderPaymentLinkRows(...args),
    resetPaymentLinkBrowseState: (...args) => resetPaymentLinkBrowseState(...args),
  });
  const { renderInventoryReview, resetInventoryImportState, preparedRowCount } = inventoryPanel;
  inventoryPanel.init();




  document.getElementById("aiSetupLaunch").addEventListener("click", () => {
    history.pushState(null, "", "#dashboard-workspace");
    setDashboardView("workspace");
  });

  function dashboardAssetUrl(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^(?:data:|blob:|https?:\/\/)/i.test(source)) return source;
    return apiRoot() + (source.startsWith("/") ? source : `/${source}`);
  }


  // Cuenta: account card, KYC, terms and the affiliation level (src/account-panel.mjs).
  const accountPanel = createAccountPanel({
    api, emailEl, errorEl, infoEl, profileMenuEl, setDashboardView, setButtonBusy, refresh,
    stores: () => lastStores,
    profileSessionsPayload: () => lastProfileSessionsPayload,
    loadProfileSessions: (...args) => loadProfileSessions(...args),
  });
  const { renderAccount, renderLevel, renderTermsPrompt } = accountPanel;
  accountPanel.init();

  let onboardingEnabled = false;
  let onboardingChecked = false;
  let onboardingResumable = null;
  // resume: the unfinished store to continue, or null for a fresh run that creates a new store at step 1.
  function openWalkthrough(resume = null) {
    const root = document.getElementById("onboardingWalkthrough");
    root.hidden = false;
    void runWalkthrough(root, { api, uploadFile, resume, onExit: () => { root.hidden = true; root.innerHTML = ""; void refresh(); }, onDone: async storeId => {
      root.hidden = true; root.innerHTML = "";
      selectStore(storeId); await refresh();
      history.pushState(null, "", "#dashboard-workspace"); setDashboardView("workspace");
    } });
  }
  // "Crear otra tienda" with a half-built walkthrough store: offer to continue it before starting a new one.
  async function offerUnfinishedOrFresh() {
    const unfinished = (await api("/stores/onboarding").catch(() => ({ store: null }))).store || null;
    if (!unfinished) return openWalkthrough(null);
    const root = document.getElementById("onboardingWalkthrough");
    root.hidden = false;
    showWalkthroughChoice(root, { store: unfinished, onContinue: store => openWalkthrough(store), onFresh: () => openWalkthrough(null), onExit: () => { root.hidden = true; root.innerHTML = ""; } });
  }
  // The walkthrough's Shopify links hide it first, then open the usual import dialog.
  document.getElementById("onboardingWalkthrough").addEventListener("click", event => {
    if (!event.target.closest("[data-open-shopify-import]")) return;
    document.getElementById("onboardingWalkthrough").hidden = true;
    void openShopifyImport();
  });
  async function checkOnboardingOnce() {
    if (onboardingChecked) return;
    onboardingChecked = true;
    const onboarding = await api("/stores/onboarding").catch(() => ({ enabled: false, store: null }));
    onboardingEnabled = Boolean(onboarding.enabled);
    onboardingResumable = onboarding.store || null;
    const entry = walkthroughEntry({ enabled: onboardingEnabled, storeCount: lastStores.length, resumable: Boolean(onboardingResumable), intent: "boot" });
    if (entry === "resume") openWalkthrough(onboardingResumable);
    else if (entry === "fresh") openWalkthrough(null);
  }

  function openCreateStore() {
    if (walkthroughEntry({ enabled: onboardingEnabled, storeCount: lastStores.length, intent: "create" }) === "fresh") return void offerUnfinishedOrFresh();
    document.getElementById("createStoreTitle").textContent = lastStores.length ? "Crea otra tienda" : "Crea tu primera tienda";
    document.getElementById("createStoreError").hidden = true;
    document.getElementById("createStoreDialog").showModal();
    document.getElementById("createStoreName").focus();
  }
  document.getElementById("cancelCreateStore").addEventListener("click", () => document.getElementById("createStoreDialog").close());

  document.getElementById("createStoreForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    if (!canLeaveMerchantStudio()) return;
    setButtonBusy(submit, true, "Creando…");
    try {
      const { body, warning } = await createStoreBody(data.name, form.querySelector("#createStoreLogo")?.files?.[0], uploadFile);
      const store = await api("/stores", { method: "POST", body: JSON.stringify(body) });
      form.reset();
      lastStores = [store, ...lastStores.filter(existing => existing.id !== store.id)];
      document.getElementById("createStoreDialog").close();
      selectStore(store.id);
      await refresh();
      history.pushState(null, "", "#dashboard-workspace");
      setDashboardView("workspace");
      // refresh() clears the error line, so a logo that did not upload is reported once the new store is showing.
      if (warning) errorEl.textContent = warning;
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
      const createError = document.getElementById("createStoreError");
      createError.textContent = err.message; createError.hidden = false;
      // Refresh after a concurrent change while keeping the creation dialog usable.
      if (err.status === 409) {
        try { renderStoreRows(await api("/stores")); } catch { /* Keep the original error visible. */ }
      }
    } finally {
      setButtonBusy(submit, false, "Crear tienda");
    }
  });



  function selectStore(storeId) {
    const storeChanged = storeId !== currentStoreId;
    currentStoreId = storeId;
    if (storeId) sessionStorage.setItem("pagosya_current_store_id", storeId);
    else sessionStorage.removeItem("pagosya_current_store_id");
    if (storeChanged) {
      stopQuickPaymentPolling();
      resetPaymentLinkBrowseState();
      resetDebtCollectionEntry();
      document.getElementById("quickPaymentResult").hidden = true;
      lastPaymentLinks = [];
      lastDebtCollectionLinks = [];
      renderDebtCollectionLinks([]);
      resetInventoryImportState();
      cobros.reset();
      subscriptionsPanel.reset();
      growth.reset();
      abandonedCarts.reset();
      assistantPanel.reset();
      proposals.reset();
      contracts.reset();
      emailStudio?.reset();
    }
  }

  function updateSelectedStoreDomains(domains) {
    const store = lastStores.find((candidate) => candidate.id === currentStoreId);
    if (store) {
      store.customDomains = domains.map((domain) => ({
        id: domain.id,
        hostname: domain.hostname,
        status: domain.status,
        verifiedAt: domain.verifiedAt,
      }));
    }
    renderCurrentStoreBanner();
    const openLink = document.querySelector(`.store-row[data-id="${CSS.escape(currentStoreId || "")}"] .store-row-open`);
    if (store && openLink) openLink.href = merchantStoreViewUrl(store);
  }

  function currentStoreUrl() {
    const store = lastStores.find((s) => s.id === currentStoreId);
    if (!store) return "";
    return publicStoreUrl(store);
  }

  function publicStoreUrl(store) {
    const activeDomain = (store.customDomains || []).find((domain) => domain.status === "ACTIVE");
    if (activeDomain) return `https://${activeDomain.hostname}`;
    return checkoutOriginEl.value.replace(/\/$/, "") + "/s/" + encodeURIComponent(store.slug);
  }

  function merchantStoreViewUrl(store) {
    return publicStoreUrl(store);
  }



  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
    button.setAttribute("aria-busy", String(busy));
    button.textContent = label;
  }

  function money(cents, currency = "BOB") {
    if (monetaryValuesHidden) return `•••••• ${currency}`;
    return (cents / 100).toFixed(2) + " " + currency;
  }

  function moneyNumber(cents) {
    return monetaryValuesHidden ? "••••••" : (cents / 100).toFixed(2);
  }

  // Finanzas: balances, settlement, international payments, payouts and the finance charts (src/finances-panel.mjs).
  const financesPanel = createFinancesPanel({
    api, money, moneyNumber, renderOverview,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    setSettlement: (schedule) => { lastSettlement = schedule; },
    setPayouts: (payouts) => { lastPayouts = payouts; },
    setTotalFinances: (finances) => { lastTotalFinances = finances; },
    setFinances: (finances) => { lastFinances = finances; },
  });
  const { renderBalanceCards, renderSettlementPanel, renderInternationalCard, renderPayoutRows, renderTotalFinances, renderFinances, refreshFinancesInBackground } = financesPanel;
  financesPanel.init();

  function storePublicationState(store) {
    if (store.status === "ARCHIVED") return "archived";
    return (store.publishedSourceRevision ? !store.sourcePublicationPaused : store.websitePublishedRevision > 0) ? "published" : "draft";
  }

  // Greeting, key figures and the setup checklist; re-run whenever the finances or the money visibility change.
  function renderOverview() {
    if (!lastFinances) return;
    document.getElementById("overviewGreeting").textContent = greetingFor(new Date(), currentProfileName);
    document.getElementById("overviewKpis").innerHTML = renderOverviewKpis(overviewKpis({ finances: lastFinances, money }));
    const store = lastStores.find((entry) => entry.id === currentStoreId);
    const setup = document.getElementById("overviewSetup");
    setup.innerHTML = renderSetupSteps(setupSteps({
      kycStatus: lastKyc?.status,
      invoicingConfigured: Boolean(lastInvoicingProfile?.cuis),
      storePublished: store ? storePublicationState(store) === "published" : false,
      paymentCount: lastTotalFinances?.paymentCount ?? lastFinances.paymentCount,
      paymentStore: (store?.checkoutMode || "payment") === "payment",
    }));
    setup.hidden = !setup.innerHTML;
  }


  function setPasswordVisible(visible) {
    passwordEl.type = visible ? "text" : "password";
    passwordVisibilityToggleEl.setAttribute("aria-pressed", String(visible));
    const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";
    passwordVisibilityToggleEl.setAttribute("aria-label", label);
    passwordVisibilityToggleEl.title = label;
  }

  passwordVisibilityToggleEl.addEventListener("click", () => {
    setPasswordVisible(passwordEl.type === "password");
    passwordEl.focus({ preventScroll: true });
  });


  function setMonetaryValuesHidden(hidden, remember = true) {
    monetaryValuesHidden = hidden;
    moneyVisibilityToggleEl.setAttribute("aria-pressed", String(hidden));
    moneyVisibilityToggleEl.setAttribute("aria-label", hidden ? "Mostrar valores monetarios" : "Ocultar valores monetarios");
    moneyVisibilityToggleEl.title = hidden ? "Mostrar valores monetarios" : "Ocultar valores monetarios";
    moneyVisibilityLabelEl.textContent = hidden ? "Mostrar montos" : "Ocultar montos";
    if (remember) {
      try {
        localStorage.setItem(MONEY_VISIBILITY_KEY, String(hidden));
      } catch {
        // The privacy choice still applies for this visit when storage is unavailable.
      }
    }
    if (lastBalances) renderBalanceCards(lastBalances);
    if (lastSettlement) renderSettlementPanel(lastSettlement);
    if (lastTotalFinances) renderTotalFinances(lastTotalFinances);
    if (lastFinances) renderFinances(lastFinances);
    if (lastPayments.length) renderPaymentRows();
    if (lastPayouts.length) renderPayoutRows(lastPayouts);
    if (lastPaymentLinks.length) renderPaymentLinkRows(lastPaymentLinks);
    if (preparedRowCount()) renderInventoryReview();
  }

  moneyVisibilityToggleEl.addEventListener("click", () => setMonetaryValuesHidden(!monetaryValuesHidden));
  setMonetaryValuesHidden(monetaryValuesHidden, false);



  // Bandeja (src/inbox-panel.mjs).
  const inboxPanel = createInboxPanel({
    api, canLeaveMerchantStudio, selectMarketingTab, setDashboardView,
    storeId: () => currentStoreId,
    stores: () => lastStores,
  });
  const { refreshInbox } = inboxPanel;
  inboxPanel.init();



  async function api(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    let res;
    try {
      res = await fetch(apiBaseEl.value.replace(/\/$/, "") + path, {
        ...options,
        headers: {
          // The browser supplies the multipart boundary for uploaded files.
          ...(isFormData ? {} : { "content-type": "application/json" }),
          authorization: "Bearer " + sessionToken,
          ...(options.headers || {}),
        },
      });
    } catch (cause) {
      if (cause?.name === "AbortError") throw cause;
      const error = new Error("No se pudo conectar con el servidor de pagosYa. Comprueba tu conexión y vuelve a intentarlo.");
      error.networkFailure = true;
      error.retryable = true;
      throw error;
    }
    if (options.raw && res.ok) return res.blob();
    const body = await res.json().catch(() => null);
    if (res.status === 429) {
      const error = new Error("El panel recibió demasiadas solicitudes seguidas. Espera unos segundos y vuelve a intentarlo.");
      // Keep the server's own words (e.g. the daily document email cap) for views that can show them.
      error.status = 429;
      error.serverMessage = typeof body?.message === "string" ? body.message : "";
      throw error;
    }
    if (!res.ok) {
      const responseMessage = Array.isArray(body?.message)
        ? body.message.filter((entry) => typeof entry === "string").join(". ")
        : typeof body?.message === "string" ? body.message : "";
      const genericServerFailure = res.status >= 500 && (!responseMessage || /^internal server error$/i.test(responseMessage));
      const error = new Error(genericServerFailure
        ? "El servidor no pudo completar esta operación. Tus cambios siguen aquí; vuelve a intentarlo en unos segundos."
        : responseMessage || res.statusText || "No pudimos completar la solicitud.");
      error.status = res.status;
      // A machine-readable reason some routes add (e.g. the Shopify import's "protected").
      if (typeof body?.code === "string") error.code = body.code;
      error.retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
      throw error;
    }
    return body;
  }

  // apiBase is ".../v1" — strip that to resolve uploaded-image paths.
  function apiRoot() {
    return apiBaseEl.value.replace(/\/v1\/?$/, "");
  }

  // Turning on integrated payments is pointless until KYC and the NIT exist, so
  // land the merchant on the first field they actually have to fill.
  function openComplianceForPayments() {
    history.pushState(null, "", "#dashboard-compliance");
    setDashboardView("compliance");
    setDashboardSectionExpanded("kycSection", true, false);
    setDashboardSectionExpanded("invoicingSection", true, false);
    infoEl.textContent = "Pagos activados. Completa KYC y registra tu NIT para empezar a cobrar.";
    const firstRequiredField = lastKyc?.status === "APPROVED"
      ? document.querySelector('#invoicingForm input[name="nit"]')
      : document.querySelector('#kycForm input[name="legalName"]');
    firstRequiredField?.scrollIntoView({ block: "center" });
    firstRequiredField?.focus({ preventScroll: true });
  }

  // The settings page lives under "Tu tienda" rather than a top-level entry of
  // its own: everything it edits is scoped to the selected store. Its tabs show
  // Marca, Envíos y retiro and Dominio web as the Studio's own panels, inline.
  // Its emails moved to Correos y marketing › Correos on 2026-10-13.
  import("/src/settings-tabs.mjs").then(({ mountSettingsTabs }) => {
    settingsTabs = mountSettingsTabs(document.getElementById("storeSettingsSection"), {
      storeId: () => currentStoreId,
      // The Studio frame reads the API base from the shared session before it loads.
      beforeLoad: () => sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, "")),
    });
  });
  /** Opens Ajustes on one of its tabs, for example when the Studio asks for Dominio. A request for
   *  Ajustes › Correos (an older Studio, a saved link) lands on Correos y marketing › Correos. */
  function openSettingsSection(section) {
    if (section === "emails") { openMarketingEmails(); return; }
    settingsTabs?.select(section);
  }
  function openMarketingEmails() {
    if (!canLeaveMerchantStudio()) return;
    selectMarketingTab("emails");
    history.pushState(null, "", "#dashboard-marketing");
    setDashboardView("marketing");
  }
  document.querySelector("[data-open-marketing-emails]").addEventListener("click", (event) => { event.preventDefault(); openMarketingEmails(); });
  import("/src/mcp-connect.mjs").then(({ mountMcpConnect, mountMcpConnectDialog }) => {
    mcpConnect = mountMcpConnect(document.getElementById("mcpConnectRoot"), { api, apiBase: () => apiBaseEl.value });
    const connectDialog = mountMcpConnectDialog({ api, apiBase: () => apiBaseEl.value, onCreated: () => { void mcpConnect?.reload(); } });
    document.querySelectorAll("[data-connect-ai-open]").forEach(button => button.addEventListener("click", () => connectDialog.open()));
    if (document.body.dataset.dashboardView === "connect-ai" && sessionToken) void mcpConnect.reload();
  });
  import("/src/store-settings.mjs").then(({ mountStoreSettings }) => {
    storeSettings = mountStoreSettings(document.getElementById("storeSettingsRoot"), {
      api,
      uploadFile,
      assetUrl: dashboardAssetUrl,
      hasInvoicing: () => Boolean(lastInvoicingProfile?.cuis),
      onSaved: async (_store, { enabledPayments }) => {
        await refresh();
        // Turning on integrated payments is pointless until invoicing exists,
        // so send them straight there instead of leaving a silent dead end.
        if (enabledPayments && !lastInvoicingProfile?.cuis) openComplianceForPayments();
        else infoEl.textContent = "Datos de la tienda guardados.";
      },
    });
    storeSettings.setStore(lastStores.find((store) => store.id === currentStoreId) || null, lastPaymentLinks);
  }).catch(() => {
    document.getElementById("storeSettingsRoot").textContent = "No pudimos cargar los ajustes de la tienda. Recarga la página para volver a intentar.";
  });
  // Correos y marketing › Correos: the list of every store email, which mounts the designed editor
  // (email-studio-panel.mjs) itself. It keeps the `emailStudio` name so selectStore's reset needs no edit.
  import("/src/email-list-panel.mjs").then(({ mountEmailList }) => {
    emailStudio = mountEmailList(document.getElementById("marketingEmailsRoot"), { api, storeId: () => currentStoreId, assetUrl: (path) => `${apiRoot()}${path}`, confirm: (message) => window.confirm(message) });
    if (document.body.dataset.dashboardView === "marketing" && sessionToken && document.getElementById("marketingTabs").dataset.tab === "emails") emailStudio.show();
  }).catch(() => {
    document.getElementById("marketingEmailsRoot").textContent = "No pudimos cargar tus correos. Recarga la página para volver a intentar.";
  });

  async function uploadFile(file) {
    const form = new FormData();
    form.append("file", file);
    const { url } = await api("/uploads", { method: "POST", body: form });
    if (typeof url !== "string" || !/^\/v1\/uploads\/[A-Za-z0-9._-]+$/i.test(url)) {
      throw new Error("El servidor no devolvió una ruta válida para la foto.");
    }
    return url;
  }

  // The login's mesh gradient runs only while the login is on screen.
  let disposeLoginShader = null;
  function startLoginShader() {
    if (disposeLoginShader) return;
    disposeLoginShader = () => {};
    const host = document.querySelector("[data-login-shader]");
    if (!host) return;
    import("/src/login-shader.mjs").then(async ({ mountLoginShader }) => {
      const dispose = await mountLoginShader(host);
      if (document.body.classList.contains("is-logged-out")) disposeLoginShader = dispose; else dispose();
    });
  }
  function stopLoginShader() { disposeLoginShader?.(); disposeLoginShader = null; }

  function showLoggedOut() {
    const studioFrame = document.getElementById("merchantStudioFrame");
    studioFrame.removeAttribute("src"); delete studioFrame.dataset.storeId;
    dashboardRefreshVersion += 1;
    document.body.classList.add("is-logged-out");
    document.body.classList.remove("is-logged-in");
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
    currentProfileName = "";
    if (profileMenuEl.matches(":popover-open")) profileMenuEl.hidePopover();
    loginFormEl.style.display = "grid";
    loggedInBarEl.style.display = "none";
    appEl.style.display = "none";
    startLoginShader();
  }

  function showLoggedIn() {
    document.body.classList.remove("is-logged-out");
    document.body.classList.add("is-logged-in");
    loginFormEl.style.display = "none";
    stopLoginShader();
    loggedInBarEl.style.display = "flex";
    applyProfileIdentity();
    // The profile name comes from the sessions list; fetch it now, not only when the menu opens.
    loadProfileSessions(false).catch(() => undefined);
    if (document.body.dataset.dashboardView === "connect-ai") void mcpConnect?.reload();
  }

  function loadGoogleIdentity() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-google-identity]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("No se pudo cargar Google"));
      document.head.appendChild(script);
    });
  }

  async function completeMerchantLogin(result) {
    sessionToken = result.token;
    const sessionEmail = result.user?.email || emailEl.value.trim();
    if (sessionEmail) emailEl.value = sessionEmail;
    sessionStorage.setItem("pagosya_merchant_session", sessionToken);
    if (sessionEmail) sessionStorage.setItem("pagosya_merchant_email", sessionEmail);
    await chooseProfileForNewLogin(result);
    showLoggedIn();
    appEl.style.display = "block";
    infoEl.textContent = "Sesión iniciada. Cargando tu panel…";
    await refresh();
    if (sessionToken) infoEl.textContent = "";
  }

  async function setupMerchantGoogleSignIn() {
    try {
      const googleConfig = await api("/auth/google");
      if (!googleConfig?.enabled || !googleConfig.clientId) return;
      await loadGoogleIdentity();
      window.google.accounts.id.initialize({
        client_id: googleConfig.clientId,
        callback: async ({ credential }) => {
          if (!credential) return;
          errorEl.textContent = "";
          infoEl.textContent = "Validando tu cuenta Google…";
          try {
            const result = await api("/dashboard/google", { method: "POST", body: JSON.stringify({ credential }) });
            await completeMerchantLogin(result);
          } catch (err) {
            errorEl.textContent = "Error: " + err.message;
            infoEl.textContent = "";
          }
        },
      });
      window.google.accounts.id.renderButton(document.getElementById("merchantGoogleButton"), {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        locale: "es",
        logo_alignment: "left",
        width: 320,
      });
      document.getElementById("merchantGoogleAuth").hidden = false;
    } catch {
      // El acceso por contraseña sigue disponible si Google está sin configurar o bloqueado.
    }
  }

  async function refresh() {
    const refreshVersion = ++dashboardRefreshVersion;
    errorEl.textContent = "";
    sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value);
    appEl.setAttribute("aria-busy", "true");

    try {
      // Start secondary dashboard data immediately, but let the store list
      // resolve independently so its catalog requests do not wait behind it.
      const overviewPromise = Promise.all([
        api("/merchants/balance"),
        api("/merchants/kyc"),
        api("/merchants/invoicing_profile"),
        api("/merchants/payouts"),
        api("/merchants/finances"),
        api("/merchants/international_payments").catch(() => null),
        api("/dashboard/terms").catch(() => null),
        api("/dashboard/limits").catch(() => null),
        api("/merchants/settlement/schedule").catch(() => null),
      ]);
      const stores = await api("/stores");
      if (refreshVersion !== dashboardRefreshVersion) {
        await overviewPromise.catch(() => undefined);
        return;
      }

      showLoggedIn();
      appEl.style.display = "block";
      renderStoreRows(stores);
      void checkOnboardingOnce();

      const selectedStoreId = currentStoreId;
      const storeQuery = selectedStoreId ? `?storeId=${encodeURIComponent(selectedStoreId)}` : "";
      const [[balance, kyc, invoicing, payouts, totalFinances, international, terms, limits, settlementSchedule], payments, finances, categories, paymentLinks, promoCodes, debtCollectionLinks, customDomains] = await Promise.all([
        overviewPromise,
        api(`/merchants/orders${storeQuery}`),
        selectedStoreId ? api(`/merchants/finances${storeQuery}`) : api("/merchants/finances"),
        selectedStoreId ? api(`/stores/${selectedStoreId}/categories`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/payment_links`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/promo-codes`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/debt-collection-links`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/domains`) : Promise.resolve([]),
      ]);
      if (refreshVersion !== dashboardRefreshVersion || selectedStoreId !== currentStoreId) return;

      lastBalances = balance.balances?.length
        ? balance.balances
        : [{ currency: balance.currency || "BOB", payableBalance: balance.payableBalance || 0 }];
      renderBalanceCards(lastBalances);
      document.getElementById("payoutHoldBanner").hidden = !balance.payoutsHeld;
      renderSettlementPanel(settlementSchedule);
      document.getElementById("internationalPaymentsCard").innerHTML = renderInternationalCard(international);
      const selectedStore = lastStores.find((store) => store.id === currentStoreId) || null;
      const paymentStore = (selectedStore?.checkoutMode || "payment") === "payment";

      const kycBadge = document.getElementById("kycBadge");
      kycBadge.textContent = paymentStore ? kycStatusLabel(kyc.status) : "No requerido para esta tienda";
      kycBadge.className = "badge " + (paymentStore ? kyc.status : "");
      // The level card (usage, 80%/100% banners, upgrade actions) must stay
      // visible whenever we have limits data, even once KYC is APPROVED — an
      // approved level 1 merchant still needs it to reach level 2, and a
      // level 2 merchant still needs the level 3 request button.
      document.getElementById("kycSection").style.display = "block";
      document.getElementById("kycModeNotice").hidden = paymentStore;
      const canApplyForNextKycLevel = paymentStore && kyc.status !== "PENDING_REVIEW" && (!limits || limits.level < 2);
      document.getElementById("kycForm").hidden = !canApplyForNextKycLevel;
      document.getElementById("liveKeysSection").style.display = paymentStore ? "block" : "none";
      renderTermsPrompt(terms);
      renderLevel(limits);

      const invBadge = document.getElementById("invoicingBadge");
      const invStatus = invoicing.status || (invoicing.cuis ? "CONFIGURED" : "NOT_CONFIGURED");
      invBadge.textContent = paymentStore ? kycStatusLabel(invStatus) : "No requerido para esta tienda";
      invBadge.className = "badge " + (paymentStore ? invoicing.cuis ? "APPROVED" : "NOT_CONFIGURED" : "");
      document.getElementById("invoicingSection").style.display = !paymentStore || !invoicing.cuis ? "block" : "none";
      document.getElementById("invoicingModeNotice").hidden = paymentStore;
      document.getElementById("invoicingForm").hidden = !paymentStore;

      renderAccount({ kyc, invoicing });
      lastInvoicingProfile = invoicing;
      lastKyc = kyc;
      storeSettings?.setStore(selectedStore, paymentLinks);
      settingsTabs?.refresh();

      renderTotalFinances(totalFinances);
      renderFinances(finances);

      lastCategories = categories;
      renderPaymentLinkRows(paymentLinks);
      renderPromoCodes(promoCodes);
      renderDebtCollectionLinks(debtCollectionLinks);
      updateSelectedStoreDomains(customDomains);

      lastPayments = payments;
      resetPaymentPage();
      renderPaymentRows();
      void refreshInbox();

      renderPayoutRows(payouts);
    } catch (err) {
      if (refreshVersion !== dashboardRefreshVersion) return;
      errorEl.textContent = "Error: " + err.message;
      // Una sesión vencida o inválida debe volver al formulario de acceso, no
      // solo mostrar un error sobre un panel vacío.
      if (err.status === 401 || err.message.match(/session|credentials/i)) {
        sessionToken = "";
        sessionStorage.removeItem("pagosya_merchant_session");
        showLoggedOut();
      } else {
        // Preserve any sections that already loaded; one secondary endpoint
        // should not blank the entire dashboard.
        appEl.style.display = "block";
      }
    } finally {
      if (refreshVersion === dashboardRefreshVersion) appEl.removeAttribute("aria-busy");
    }
  }

  loginFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const loginButton = document.getElementById("login");
    if (loginButton.disabled) return;
    errorEl.textContent = "";
    infoEl.textContent = "";
    sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value);
    setButtonBusy(loginButton, true, "Ingresando…");
    try {
      const result = await api("/dashboard/login", {
        method: "POST",
        body: JSON.stringify({ email: emailEl.value, password: passwordEl.value }),
      });
      await completeMerchantLogin(result);
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    } finally {
      setButtonBusy(loginButton, false, "Iniciar sesión");
    }
  });

  document.getElementById("showForgot").addEventListener("click", () => {
    errorEl.textContent = "";
    infoEl.textContent = "";
    forgotFormEl.style.display = forgotFormEl.style.display === "none" ? "block" : "none";
  });

  document.getElementById("requestReset").addEventListener("click", async () => {
    errorEl.textContent = "";
    infoEl.textContent = "";
    try {
      const result = await api("/dashboard/forgot_password", {
        method: "POST",
        body: JSON.stringify({ email: document.getElementById("forgotEmail").value }),
      });
      infoEl.textContent = result.message;
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("submitReset").addEventListener("click", async () => {
    errorEl.textContent = "";
    infoEl.textContent = "";
    try {
      await api("/dashboard/reset_password", {
        method: "POST",
        body: JSON.stringify({
          token: document.getElementById("resetToken").value,
          newPassword: document.getElementById("newPassword").value,
        }),
      });
      infoEl.textContent = "Contraseña actualizada — inicia sesión con tu nueva contraseña.";
      forgotFormEl.style.display = "none";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("logout").addEventListener("click", async () => {
    if (!canLeaveMerchantStudio()) return;
    if (profileMenuEl.matches(":popover-open")) profileMenuEl.hidePopover();
    try {
      await api("/dashboard/logout", { method: "POST" });
    } catch {
      // mejor esfuerzo — igual limpiamos el estado local
    }
    sessionToken = "";
    sessionStorage.removeItem("pagosya_merchant_session");
    showLoggedOut();
  });

  const merchantDeleteDialogEl = document.getElementById("merchantDeleteDialog");
  const merchantDeleteFormEl = document.getElementById("merchantDeleteForm");
  const merchantDeleteConfirmationEl = document.getElementById("merchantDeleteConfirmation");
  const merchantDeleteConfirmEl = document.getElementById("merchantDeleteConfirm");
  const merchantDeleteErrorEl = document.getElementById("merchantDeleteError");
  function closeMerchantDeleteDialog() {
    if (merchantDeleteDialogEl.open) merchantDeleteDialogEl.close();
    merchantDeleteFormEl.reset();
    merchantDeleteConfirmEl.disabled = true;
    merchantDeleteErrorEl.hidden = true;
    merchantDeleteErrorEl.textContent = "";
  }
  document.getElementById("deleteMerchantAccount").addEventListener("click", () => {
    if (profileMenuEl.matches(":popover-open")) profileMenuEl.hidePopover();
    closeMerchantDeleteDialog();
    merchantDeleteDialogEl.showModal();
    merchantDeleteConfirmationEl.focus();
  });
  document.getElementById("merchantDeleteClose").addEventListener("click", closeMerchantDeleteDialog);
  document.getElementById("merchantDeleteCancel").addEventListener("click", closeMerchantDeleteDialog);
  merchantDeleteConfirmationEl.addEventListener("input", () => {
    merchantDeleteConfirmEl.disabled = merchantDeleteConfirmationEl.value !== "ELIMINAR";
  });
  merchantDeleteFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (merchantDeleteConfirmationEl.value !== "ELIMINAR") return;
    setButtonBusy(merchantDeleteConfirmEl, true, "Eliminando acceso…");
    merchantDeleteErrorEl.hidden = true;
    try {
      const result = await api("/dashboard/account", { method: "DELETE", body: JSON.stringify({ confirmation: "ELIMINAR" }) });
      sessionToken = "";
      sessionStorage.removeItem("pagosya_merchant_session");
      sessionStorage.removeItem("pagosya_current_store_id");
      closeMerchantDeleteDialog();
      showLoggedOut();
      infoEl.textContent = result.merchantSuspended
        ? "Acceso eliminado. Tus tiendas fueron archivadas y las credenciales quedaron revocadas."
        : "Tu acceso fue eliminado y todas tus sesiones quedaron cerradas.";
    } catch (err) {
      merchantDeleteErrorEl.textContent = err.message;
      merchantDeleteErrorEl.hidden = false;
    } finally {
      setButtonBusy(merchantDeleteConfirmEl, false, "Eliminar definitivamente mi acceso");
      merchantDeleteConfirmEl.disabled = merchantDeleteConfirmationEl.value !== "ELIMINAR";
    }
  });

  if (sessionToken) {
    showLoggedIn();
    appEl.style.display = "block";
    infoEl.textContent = "Actualizando tu panel…";
    refresh().finally(() => {
      if (sessionToken) infoEl.textContent = "";
    });
  } else {
    showLoggedOut();
  }
  setupMerchantGoogleSignIn();
  window.refresh = refresh;
  window.setDashboardView = setDashboardView;
  })();
