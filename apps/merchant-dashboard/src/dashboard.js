// Merchant dashboard behavior. The current website editor is mounted in Studio.
import { profileInitials } from "/src/profile-initials.mjs";
import { debtAmountInCents, parseDebtCollectionRows, parseDebtCsv } from "/src/debt-csv.mjs";
import { prepareAiInventoryRows } from "/src/inventory-import.mjs";
import { escapeHtml as esc } from "/src/html.mjs";
import { countsLine, designStepItems, importStep, parseExchangeRate, progressLabel, summaryLines } from "/src/store-import.mjs";
import { mountCobrosPanel } from "/src/cobros-panel.mjs";
import { mountGrowthPanel } from "/src/growth-panel.mjs";
import { mountProposalsPanel } from "/src/proposals-panel.mjs";
import { mountContractsPanel } from "/src/contracts-panel.mjs";
import { greetingFor, kycStatusLabel, overviewKpis, renderOverviewKpis, renderSetupSteps, setupSteps } from "/src/overview.mjs";

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
  let lastPromoCodes = [];
  const promoCodeFormEl = document.getElementById("promoCodeForm");
  const promoCodeTypeEl = document.getElementById("promoCodeType");
  const promoCodeValueEl = document.getElementById("promoCodeValue");
  const promoCodeValueLabelEl = document.getElementById("promoCodeValueLabel");
  const promoCodeStatusEl = document.getElementById("promoCodeStatus");
  const promoCodeListEl = document.getElementById("promoCodeList");
  const promoCodeCountEl = document.getElementById("promoCodeCount");
  const paymentLinkPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);
  const paymentLinkPageSize = 10;
  const paymentLinkSearchEl = document.getElementById("paymentLinkSearch");
  const paymentLinkSearchClearEl = document.getElementById("paymentLinkSearchClear");
  const paymentLinkSearchSummaryEl = document.getElementById("paymentLinkSearchSummary");
  const bulkDiscountStudioEl = document.getElementById("bulkDiscountStudio");
  const bulkDiscountClearAllEl = document.getElementById("bulkDiscountClearAll");
  const bulkDiscountProductSearchEl = document.getElementById("bulkDiscountProductSearch");
  const bulkDiscountProductListEl = document.getElementById("bulkDiscountProductList");
  const bulkDiscountSelectionCountEl = document.getElementById("bulkDiscountSelectionCount");
  const bulkDiscountSelectAllEl = document.getElementById("bulkDiscountSelectAll");
  const bulkDiscountPercentEl = document.getElementById("bulkDiscountPercent");
  const bulkDiscountStartDateEl = document.getElementById("bulkDiscountStartDate");
  const bulkDiscountStartTimeEl = document.getElementById("bulkDiscountStartTime");
  const bulkDiscountEndDateEl = document.getElementById("bulkDiscountEndDate");
  const bulkDiscountEndTimeEl = document.getElementById("bulkDiscountEndTime");
  const bulkDiscountPreviewEl = document.getElementById("bulkDiscountPreview");
  const bulkDiscountSubmitEl = document.getElementById("bulkDiscountSubmit");
  const selectedBulkDiscountProductIds = new Set();
  let lastDebtCollectionLinks = [];
  const debtCollectionPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);
  const debtCollectionPageSize = 4;
  const expandedDebtCollectionIds = new Set();
  const debtPayerPageByCollectionId = new Map();
  const debtPayerPageSize = 10;
  let preparedDebtCsvRows = [];
  let debtCsvImportVersion = 0;
  let debtAppendTarget = null;
  let quickPaymentPollTimer = null;
  let quickPaymentPollGeneration = 0;
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
  let lastTotalFinances = null;
  let lastBalances = null;
  const MONEY_VISIBILITY_KEY = "pagosya_dashboard_hide_money";
  let monetaryValuesHidden = false;
  try {
    monetaryValuesHidden = localStorage.getItem(MONEY_VISIBILITY_KEY) === "true";
  } catch {
    // Keep the control usable for this visit if browser storage is unavailable.
  }
  let paymentStatusFilter = "active";
  let orderSearch = "";
  let paymentPage = 1;
  const PAYMENT_PAGE_SIZE = 20;
  let lastStores = [];
  let storeSettings = null;
  let lastInvoicingProfile = null;
  let lastKyc = null;
  let lastCategories = [];
  let dashboardRefreshVersion = 0;
  let renderShipmentPanel = null;
  let currentStoreId = sessionStorage.getItem("pagosya_current_store_id") || null;
  let debtLinkStatusTab = "ACTIVE";
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
  function initStoreEditorSections(scope = document) {
    scope.querySelectorAll(".store-editor-section").forEach((section, index) => {
      if (section.dataset.editorSection === "ready") return;
      const head = section.querySelector(":scope > .editor-section-head");
      const title = head?.querySelector("h3")?.textContent?.trim();
      if (!head || !title) return;
      section.dataset.editorSection = "ready";

      const body = document.createElement("div");
      body.className = "store-editor-section-body";
      body.id = `storeEditorSectionBody${index + 1}`;
      while (head.nextSibling) body.appendChild(head.nextSibling);
      section.appendChild(body);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ghost editor-section-toggle";
      toggle.setAttribute("aria-controls", body.id);
      toggle.innerHTML = `<span>Mostrar</span>${COLLAPSE_CHEVRON}`;
      head.appendChild(toggle);

      const storageKey = `pagosya_store_editor_section_${section.getAttribute("aria-labelledby") || index + 1}`;
      const setExpanded = (expanded, remember = true) => {
        body.hidden = !expanded;
        section.classList.toggle("is-expanded", expanded);
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} ${title}`);
        toggle.title = `${expanded ? "Ocultar" : "Mostrar"} ${title}`;
        toggle.querySelector("span").textContent = expanded ? "Ocultar" : "Mostrar";
        if (remember) localStorage.setItem(storageKey, String(expanded));
      };

      // Settings open: a merchant who came here to change one field should not
      // have to guess which section hides it. Collapsing is theirs to choose.
      setExpanded(savedExpandedState(storageKey, true), false);
      toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
    });
  }

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
  /* Deja Correos y marketing en una pestaña concreta; el iframe se recarga con ese tab. */
  function selectMarketingTab(tab) {
    document.getElementById("marketingTabs").dataset.tab = tab;
    document.querySelectorAll("[data-marketing-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.marketingTab === tab)));
    document.getElementById("marketingPromotions").hidden = tab !== "promotions";
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
      frame.hidden = !currentStoreId || !sessionToken || kind === "marketing" && document.getElementById("marketingTabs").dataset.tab === "promotions";
      const empty = document.querySelector(`[data-resource-empty="${kind}"]`); if (empty) empty.hidden = Boolean(currentStoreId && sessionToken);
      if (!frame.hidden && !frame.getAttribute("src")) {
        sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, ""));
        frame.dataset.storeId = currentStoreId;
        frame.src = `/studio/?embedded=1&${kind === "products" ? "productGuide=1" : `library=${kind}${kind === "marketing" ? `&tab=${document.getElementById("marketingTabs").dataset.tab}` : ""}`}&store=${encodeURIComponent(currentStoreId)}`;
      }
    }
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
      if (event.data.view === "marketing" && ["program", "templates"].includes(event.data.tab)) selectMarketingTab(event.data.tab);
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
      if (event.data.view === "marketing" && event.data.tab === "program") selectMarketingTab("program");
      history.pushState(null, "", `#dashboard-${event.data.view}`);
      setDashboardView(event.data.view);
      document.getElementById("dashboardWorkspace").scrollIntoView({ block: "start" });
      if (event.data.view === "store-settings" && event.data.section && currentStoreId) void openSettingsSection(event.data.section);
    }
  });

  function setDashboardView(view, { remember = true } = {}) {
    if (view === "content") view = "workspace";
    if (view === "discounts") { view = "marketing"; document.getElementById("marketingTabs").dataset.tab = "promotions"; document.getElementById("marketingPromotions").hidden = false; document.querySelectorAll("[data-marketing-tab]").forEach(tab => tab.setAttribute("aria-pressed",String(tab.dataset.marketingTab === "promotions"))); }
    const nextView = DASHBOARD_VIEW_COPY[view] ? view : "overview";
    const viewChanged = document.body.dataset.dashboardView !== nextView;
    if (viewChanged) {
      document.body.dataset.dashboardView = nextView;
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
    if (nextView === "growth") growth.show();
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
  const inventoryToggle = document.createElement("button");
  inventoryToggle.type = "button";
  inventoryToggle.id = "inventoryImporterToggle";
  inventoryToggle.className = "ghost inline-section-toggle";
  document.querySelector(".inventory-import-head")?.appendChild(inventoryToggle);
  initInlineCollapsible("inventoryImporter", ".inventory-import-head", "inventoryImporterToggle", "pagosya_inventory_importer_expanded", "importador de inventario", false);
  initStoreEditorSections();
  checkoutOriginEl.addEventListener("change", () => {
    sessionStorage.setItem("pagosya_checkout_origin", checkoutOriginEl.value);
    renderCurrentStoreBanner();
    if (lastStores) renderStoreRows(lastStores);
  });

  const inventoryCsvInputEl = document.getElementById("inventoryCsvInput");
  const inventoryImagesInputEl = document.getElementById("inventoryImagesInput");
  const inventoryDropzoneEl = document.getElementById("inventoryDropzone");
  const inventoryFileSummaryEl = document.getElementById("inventoryFileSummary");
  const inventoryConnectionEl = document.getElementById("inventoryConnection");
  const inventoryReviewEl = document.getElementById("inventoryReview");
  const inventoryReviewRowsEl = document.getElementById("inventoryReviewRows");
  const inventoryReviewSummaryEl = document.getElementById("inventoryReviewSummary");
  const inventoryImportStatusEl = document.getElementById("inventoryImportStatus");
  const inventoryAiWarningsEl = document.getElementById("inventoryAiWarnings");
  const inventoryCommitEl = document.getElementById("inventoryCommit");
  let preparedInventoryRows = [];
  let preparedInventoryStoreId = null;
  let inventoryImportInProgress = false;
  let inventoryImportVersion = 0;

  function localDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  }

  function localTimeInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function promoCodeDiscountLabel(code) {
    return code.discountType === "PERCENT"
      ? `${code.discountValue}% de descuento`
      : `${money(code.discountValue)} de descuento`;
  }

  function renderPromoCodes(codes) {
    lastPromoCodes = Array.isArray(codes) ? codes : [];
    promoCodeCountEl.textContent = `${lastPromoCodes.length} ${lastPromoCodes.length === 1 ? "código" : "códigos"}`;
    if (!lastPromoCodes.length) {
      promoCodeListEl.innerHTML = '<p class="promo-code-empty">Todavía no creaste códigos. El primero quedará activo apenas lo guardes.</p>';
      return;
    }
    promoCodeListEl.innerHTML = lastPromoCodes.map((code) => `<article class="promo-code-row${code.isActive ? "" : " is-disabled"}" data-promo-code-id="${esc(code.id)}">
      <div class="promo-code-identity"><strong>${esc(code.code)}</strong><span>${code.isActive ? "Activo y listo para compartir" : "Desactivado"}</span></div>
      <div class="promo-code-value"><strong>${esc(promoCodeDiscountLabel(code))}</strong><span>Creado ${new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(new Date(code.createdAt))}</span></div>
      <div class="promo-code-actions">
        <button class="ghost" type="button" data-promo-copy="${esc(code.code)}" aria-label="Copiar código ${esc(code.code)}">Copiar</button>
        <button class="ghost" type="button" data-promo-share="${esc(code.code)}" aria-label="Compartir código ${esc(code.code)}">Compartir</button>
        <button class="ghost" type="button" data-promo-toggle="${esc(code.id)}" data-active="${code.isActive}" aria-label="${code.isActive ? "Desactivar" : "Activar"} código ${esc(code.code)}">${code.isActive ? "Desactivar" : "Activar"}</button>
      </div>
    </article>`).join("");
  }

  promoCodeTypeEl.addEventListener("change", () => {
    const percent = promoCodeTypeEl.value === "PERCENT";
    promoCodeValueLabelEl.textContent = percent ? "Descuento (%)" : "Descuento fijo (Bs)";
    promoCodeValueEl.max = percent ? "99" : "1000000";
    promoCodeValueEl.step = percent ? "1" : "0.01";
    promoCodeValueEl.value = percent ? "10" : "10.00";
  });

  promoCodeFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentStoreId) return;
    promoCodeStatusEl.textContent = "";
    promoCodeStatusEl.classList.remove("is-success");
    const data = new FormData(promoCodeFormEl);
    const discountType = String(data.get("discountType"));
    const enteredValue = Number(data.get("discountValue"));
    const discountValue = discountType === "FIXED" ? Math.round(enteredValue * 100) : enteredValue;
    const submit = document.getElementById("promoCodeSubmit");
    setButtonBusy(submit, true, "Creando…");
    try {
      const created = await api(`/stores/${currentStoreId}/promo-codes`, {
        method: "POST",
        body: JSON.stringify({ code: String(data.get("code") || "").trim().toUpperCase(), discountType, discountValue }),
      });
      renderPromoCodes([created, ...lastPromoCodes]);
      promoCodeFormEl.reset();
      promoCodeTypeEl.dispatchEvent(new Event("change"));
      promoCodeStatusEl.textContent = `Código ${created.code} creado y activo.`;
      promoCodeStatusEl.classList.add("is-success");
    } catch (error) {
      promoCodeStatusEl.textContent = error.message;
      promoCodeStatusEl.classList.remove("is-success");
    } finally {
      setButtonBusy(submit, false, "Crear código");
    }
  });

  promoCodeListEl.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-promo-copy]");
    const shareButton = event.target.closest("[data-promo-share]");
    const toggleButton = event.target.closest("[data-promo-toggle]");
    if (copyButton) {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(copyButton.dataset.promoCopy);
        copyButton.textContent = "Copiado";
        promoCodeStatusEl.textContent = `Código ${copyButton.dataset.promoCopy} copiado.`;
        promoCodeStatusEl.classList.add("is-success");
        window.setTimeout(() => { copyButton.textContent = "Copiar"; }, 1200);
      } catch {
        promoCodeStatusEl.textContent = `No pudimos copiar ${copyButton.dataset.promoCopy}. Selecciona el código y cópialo manualmente.`;
        promoCodeStatusEl.classList.remove("is-success");
      }
      return;
    }
    if (shareButton) {
      const store = lastStores.find((entry) => entry.id === currentStoreId);
      const code = shareButton.dataset.promoShare;
      const url = document.getElementById("currentStoreLink").value;
      const text = `Usa el código ${code} en ${store?.name || "mi tienda"}.`;
      try {
        if (navigator.share) {
          await navigator.share({ title: `Promoción de ${store?.name || "la tienda"}`, text, url });
          promoCodeStatusEl.textContent = `Código ${code} compartido.`;
          promoCodeStatusEl.classList.add("is-success");
        } else {
          if (!navigator.clipboard?.writeText) throw new Error("Share unavailable");
          await navigator.clipboard.writeText(`${text} ${url}`);
          promoCodeStatusEl.textContent = `Mensaje con el código ${code} copiado para compartir.`;
          promoCodeStatusEl.classList.add("is-success");
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          promoCodeStatusEl.textContent = `No pudimos compartir ${code}. Inténtalo de nuevo.`;
          promoCodeStatusEl.classList.remove("is-success");
        }
      }
      return;
    }
    if (!toggleButton || !currentStoreId) return;
    const isActive = toggleButton.dataset.active !== "true";
    toggleButton.disabled = true;
    try {
      const updated = await api(`/stores/${currentStoreId}/promo-codes/${toggleButton.dataset.promoToggle}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      renderPromoCodes(lastPromoCodes.map((code) => code.id === updated.id ? updated : code));
      promoCodeStatusEl.textContent = `Código ${updated.code} ${updated.isActive ? "activado" : "desactivado"}.`;
      promoCodeStatusEl.classList.add("is-success");
      requestAnimationFrame(() => promoCodeListEl.querySelector(`[data-promo-toggle="${CSS.escape(updated.id)}"]`)?.focus());
    } catch (error) {
      promoCodeStatusEl.textContent = error.message;
      promoCodeStatusEl.classList.remove("is-success");
      toggleButton.disabled = false;
    }
  });

  function bulkDiscountDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null;
    const date = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function visibleBulkDiscountProducts() {
    const query = normalizeProductSearch(bulkDiscountProductSearchEl.value);
    return lastPaymentLinks.filter((link) =>
      link.status === "ACTIVE" && (!query || normalizeProductSearch(link.name).includes(query)),
    );
  }

  function renderBulkDiscountProducts() {
    const activeIds = new Set(lastPaymentLinks.filter((link) => link.status === "ACTIVE").map((link) => link.id));
    [...selectedBulkDiscountProductIds].forEach((id) => {
      if (!activeIds.has(id)) selectedBulkDiscountProductIds.delete(id);
    });
    const products = visibleBulkDiscountProducts();
    bulkDiscountProductListEl.innerHTML = products.length
      ? products.map((link) => `<label class="bulk-discount-product">
          <input type="checkbox" value="${esc(link.id)}" ${selectedBulkDiscountProductIds.has(link.id) ? "checked" : ""}>
          <span>${esc(link.name)}</span>
          <small>${money(link.amount)}</small>
        </label>`).join("")
      : `<p class="payment-link-group-empty">No hay productos activos que coincidan.</p>`;
    const selectedCount = selectedBulkDiscountProductIds.size;
    bulkDiscountSelectionCountEl.textContent = `${selectedCount} ${selectedCount === 1 ? "producto seleccionado" : "productos seleccionados"}`;
    const allVisibleSelected = products.length > 0 && products.every((product) => selectedBulkDiscountProductIds.has(product.id));
    bulkDiscountSelectAllEl.textContent = allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles";
    bulkDiscountSubmitEl.disabled = selectedCount === 0;
  }

  function updateBulkDiscountPreview() {
    const percent = Number(bulkDiscountPercentEl.value);
    const start = bulkDiscountDateTime(bulkDiscountStartDateEl.value, bulkDiscountStartTimeEl.value);
    const end = bulkDiscountDateTime(bulkDiscountEndDateEl.value, bulkDiscountEndTimeEl.value);
    if (!Number.isInteger(percent) || !start || !end) {
      bulkDiscountPreviewEl.textContent = "Completa el porcentaje y las fechas para revisar la campaña.";
      return;
    }
    const formatter = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" });
    bulkDiscountPreviewEl.textContent = `${percent}% menos desde ${formatter.format(start)} hasta ${formatter.format(end)}. El precio normal vuelve automáticamente al terminar.`;
  }

  function seedBulkDiscountDates() {
    const start = new Date();
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const today = localDateInputValue(new Date());
    bulkDiscountStartDateEl.min = today;
    bulkDiscountEndDateEl.min = today;
    bulkDiscountStartDateEl.value = localDateInputValue(start);
    bulkDiscountStartTimeEl.value = localTimeInputValue(start);
    bulkDiscountEndDateEl.value = localDateInputValue(end);
    bulkDiscountEndTimeEl.value = localTimeInputValue(end);
    updateBulkDiscountPreview();
  }

  function closeBulkDiscountStudio() {
    bulkDiscountStudioEl.hidden = true;
    document.getElementById("bulkDiscountOpen").setAttribute("aria-expanded", "false");
  }

  document.getElementById("bulkDiscountOpen").addEventListener("click", () => {
    seedBulkDiscountDates();
    renderBulkDiscountProducts();
    bulkDiscountStudioEl.hidden = false;
    document.getElementById("bulkDiscountOpen").setAttribute("aria-expanded", "true");
    bulkDiscountStudioEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    bulkDiscountProductSearchEl.focus({ preventScroll: true });
  });
  bulkDiscountClearAllEl.addEventListener("click", async () => {
    const discountedProducts = lastPaymentLinks.filter((product) => product.discountPercent !== null && product.discountPercent !== undefined);
    if (!discountedProducts.length) return;
    const confirmed = confirm(`¿Quitar los descuentos de ${discountedProducts.length} ${discountedProducts.length === 1 ? "producto" : "productos"}? Los clientes volverán a ver el precio normal inmediatamente.`);
    if (!confirmed) return;
    errorEl.textContent = "";
    setButtonBusy(bulkDiscountClearAllEl, true, "Quitando…");
    try {
      const result = await api(`/stores/${currentStoreId}/payment_links/discount`, { method: "DELETE" });
      selectedBulkDiscountProductIds.clear();
      renderPaymentLinkRows(lastPaymentLinks.map((product) => ({
        ...product,
        discountPercent: null,
        discountStartsAt: null,
        discountEndsAt: null,
      })));
      closeBulkDiscountStudio();
      infoEl.textContent = result.count === 1
        ? "Se quitó el descuento de 1 producto."
        : `Se quitaron los descuentos de ${result.count} productos.`;
    } catch (error) {
      errorEl.textContent = "Error: " + error.message;
    } finally {
      setButtonBusy(bulkDiscountClearAllEl, false, "Quitar todos los descuentos");
      bulkDiscountClearAllEl.disabled = !lastPaymentLinks.some((product) => product.discountPercent !== null && product.discountPercent !== undefined);
    }
  });
  document.getElementById("bulkDiscountClose").addEventListener("click", closeBulkDiscountStudio);
  document.getElementById("bulkDiscountCancel").addEventListener("click", closeBulkDiscountStudio);
  bulkDiscountProductSearchEl.addEventListener("input", renderBulkDiscountProducts);
  bulkDiscountProductListEl.addEventListener("change", (event) => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    if (checkbox.checked && selectedBulkDiscountProductIds.size >= 100) {
      checkbox.checked = false;
      errorEl.textContent = "Error: puedes programar hasta 100 productos por campaña";
      return;
    }
    if (checkbox.checked) selectedBulkDiscountProductIds.add(checkbox.value);
    else selectedBulkDiscountProductIds.delete(checkbox.value);
    renderBulkDiscountProducts();
  });
  bulkDiscountSelectAllEl.addEventListener("click", () => {
    const products = visibleBulkDiscountProducts();
    const allSelected = products.length > 0 && products.every((product) => selectedBulkDiscountProductIds.has(product.id));
    if (allSelected) products.forEach((product) => selectedBulkDiscountProductIds.delete(product.id));
    else products.slice(0, Math.max(0, 100 - selectedBulkDiscountProductIds.size)).forEach((product) => selectedBulkDiscountProductIds.add(product.id));
    renderBulkDiscountProducts();
  });
  [bulkDiscountPercentEl, bulkDiscountStartDateEl, bulkDiscountStartTimeEl, bulkDiscountEndDateEl, bulkDiscountEndTimeEl].forEach((input) => {
    input.addEventListener("input", () => {
      if (input === bulkDiscountStartDateEl) bulkDiscountEndDateEl.min = bulkDiscountStartDateEl.value || localDateInputValue(new Date());
      updateBulkDiscountPreview();
    });
  });
  document.getElementById("bulkDiscountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const productIds = [...selectedBulkDiscountProductIds];
    const discountPercent = Number(bulkDiscountPercentEl.value);
    const start = bulkDiscountDateTime(bulkDiscountStartDateEl.value, bulkDiscountStartTimeEl.value);
    const end = bulkDiscountDateTime(bulkDiscountEndDateEl.value, bulkDiscountEndTimeEl.value);
    if (!productIds.length) {
      errorEl.textContent = "Error: selecciona por lo menos un producto";
      bulkDiscountProductSearchEl.focus();
      return;
    }
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 99) {
      errorEl.textContent = "Error: el descuento debe estar entre 1% y 99%";
      bulkDiscountPercentEl.focus();
      return;
    }
    if (!start || !end || start.getTime() < Date.now() - 60_000) {
      errorEl.textContent = "Error: el descuento no puede comenzar en el pasado";
      bulkDiscountStartDateEl.focus();
      return;
    }
    if (end <= start) {
      errorEl.textContent = "Error: el descuento debe terminar después de comenzar";
      bulkDiscountEndDateEl.focus();
      return;
    }
    errorEl.textContent = "";
    setButtonBusy(bulkDiscountSubmitEl, true, "Programando…");
    try {
      const updatedProducts = await api(`/stores/${currentStoreId}/payment_links/discount`, {
        method: "PATCH",
        body: JSON.stringify({
          productIds,
          discountPercent,
          discountStartsAt: start.toISOString(),
          discountEndsAt: end.toISOString(),
        }),
      });
      const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
      selectedBulkDiscountProductIds.clear();
      renderPaymentLinkRows(lastPaymentLinks.map((product) => updatedById.get(product.id) || product));
      closeBulkDiscountStudio();
      infoEl.textContent = `Descuento del ${discountPercent}% programado para ${productIds.length} ${productIds.length === 1 ? "producto" : "productos"}.`;
    } catch (error) {
      errorEl.textContent = "Error: " + error.message;
    } finally {
      setButtonBusy(bulkDiscountSubmitEl, false, "Programar campaña");
    }
  });

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


  const KYC_LABELS = { APPROVED: "Verificado", PENDING: "En revisión", REJECTED: "Rechazado", NOT_SUBMITTED: "Sin enviar", NOT_CONFIGURED: "Sin configurar" };

  /**
   * The account page reads what the dashboard already loaded; it deliberately
   * states no plan, because pagosYa has no subscription model to report.
   */
  function renderAccount({ kyc, invoicing }) {
    const emailEl2 = document.getElementById("accountEmail");
    if (!emailEl2) return;
    const email = (emailEl.value || sessionStorage.getItem("pagosya_merchant_email") || "").trim();
    emailEl2.textContent = email || "Sin correo registrado";
    const nameEl = document.getElementById("accountName");
    const profileName = document.getElementById("profileDisplayName")?.textContent?.trim();
    nameEl.textContent = profileName && profileName !== "Mi perfil" ? profileName : email.split("@")[0] || "Mi perfil";
    // The avatar itself is kept in sync by renderProfileAvatar (decorative here: the heading above already names the person).

    document.getElementById("accountKycValue").textContent = KYC_LABELS[kyc?.status] || kyc?.status || "—";
    document.getElementById("accountInvoicingValue").textContent = invoicing?.cuis ? "Activa" : "Sin configurar";

    const count = document.getElementById("accountStoreCount");
    const list = document.getElementById("accountStoreList");
    count.textContent = String(lastStores.length);
    list.innerHTML = lastStores.slice(0, 5).map((store) => `<li><strong>${esc(store.name)}</strong><span>${esc(store.slug || "")}</span></li>`).join("")
      || '<li class="account-store-empty">Todavía no creaste ninguna tienda.</li>';

    // Sessions are only fetched when the profile popover opens, so the page asks
    // for them itself the first time it is shown.
    const countEl = document.getElementById("accountSessionCount");
    const paint = (payload) => { countEl.textContent = payload ? `${payload.active} / ${payload.limit}` : "No disponible"; };
    if (lastProfileSessionsPayload) paint(lastProfileSessionsPayload);
    else {
      countEl.textContent = "…";
      loadProfileSessions(false).then(paint).catch(() => paint(null));
    }
  }

  document.getElementById("openAccountPage")?.addEventListener("click", () => {
    profileMenuEl.hidePopover();
    history.pushState(null, "", "#dashboard-account");
    setDashboardView("account");
    document.getElementById("dashboardWorkspace")?.scrollIntoView({ block: "start" });
  });
  document.getElementById("accountEditProfile")?.addEventListener("click", () => profileMenuEl.showPopover());
  document.getElementById("accountManageSessions")?.addEventListener("click", () => profileMenuEl.showPopover());
  document.getElementById("accountLogoutProxy")?.addEventListener("click", () => document.getElementById("logout")?.click());

  function openCreateStore() {
    document.getElementById("createStoreTitle").textContent = lastStores.length ? "Crea otra tienda" : "Crea tu primera tienda";
    document.getElementById("createStoreError").hidden = true;
    document.getElementById("createStoreDialog").showModal();
    document.getElementById("createStoreName").focus();
  }
  document.getElementById("cancelCreateStore").addEventListener("click", () => document.getElementById("createStoreDialog").close());

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

  async function openImportedStore(view = "workspace") {
    shopifyImportDialog.close();
    selectStore(shopifyImport.storeId);
    await refresh();
    history.pushState(null, "", "#dashboard-workspace");
    setDashboardView(view);
  }

  shopifyImportDialog.querySelectorAll("[data-design]").forEach(button => button.addEventListener("click", async () => {
    if (button.dataset.design === "template") return openImportedStore("templates");
    showShopifyImportMessage("shopifyImportDesignError", "");
    try { renderShopifyImport(await api(`/store-imports/${shopifyImport.id}/design`, { method: "POST", body: JSON.stringify({ option: button.dataset.design }) })); }
    catch (err) { showShopifyImportMessage("shopifyImportDesignError", err.message); }
  }));

  document.getElementById("shopifyImportOpen").addEventListener("click", () => openImportedStore());
  document.getElementById("storeLibrarySearch").addEventListener("input", () => renderStoreRows(lastStores));
  document.getElementById("storeLibraryStatus").addEventListener("change", () => renderStoreRows(lastStores));
  document.getElementById("sidebarStorePicker").addEventListener("change", async event => {
    const nextId = event.target.value;
    if (nextId === currentStoreId) return;
    if (!canLeaveMerchantStudio()) { event.target.value = currentStoreId || ""; return; }
    selectStore(nextId); await refresh();
  });

  document.getElementById("createStoreForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    if (!canLeaveMerchantStudio()) return;
    setButtonBusy(submit, true, "Creando…");
    try {
      const store = await api("/stores", { method: "POST", body: JSON.stringify({ name: data.name }) });
      form.reset();
      lastStores = [store, ...lastStores.filter(existing => existing.id !== store.id)];
      document.getElementById("createStoreDialog").close();
      selectStore(store.id);
      await refresh();
      history.pushState(null, "", "#dashboard-workspace");
      setDashboardView("workspace");
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

  document.getElementById("quickPaymentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentStoreId) return;
    const form = event.currentTarget;
    const submit = document.getElementById("quickPaymentSubmit");
    const formStatus = document.getElementById("quickPaymentFormStatus");
    formStatus.textContent = "";
    try {
      const data = new FormData(form);
      const amount = debtAmountInCents(data.get("amount"));
      const description = String(data.get("description") || "").trim();
      submit.disabled = true;
      submit.textContent = "Generando…";
      stopQuickPaymentPolling();
      const payment = await api(`/stores/${currentStoreId}/quick-qr-payments`, {
        method: "POST",
        body: JSON.stringify({ amount, ...(description && { description }) }),
      });
      const result = document.getElementById("quickPaymentResult");
      const qr = document.getElementById("quickPaymentQr");
      document.getElementById("quickPaymentResultDescription").textContent = payment.description;
      document.getElementById("quickPaymentResultAmount").textContent = `${(payment.amount / 100).toFixed(2)} ${payment.currency}`;
      document.getElementById("quickPaymentResultStatus").classList.remove("success-text");
      if (payment.qrImageDataUrl) {
        qr.src = payment.qrImageDataUrl;
        qr.hidden = false;
        document.getElementById("quickPaymentResultStatus").textContent = "Esperando que el cliente escanee y confirme el pago…";
      } else {
        qr.removeAttribute("src");
        qr.hidden = true;
        document.getElementById("quickPaymentResultStatus").textContent = "El banco no devolvió una imagen QR. Crea un nuevo cobro o inténtalo nuevamente en unos segundos.";
      }
      result.hidden = false;
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (!setQuickPaymentOutcome(payment.status)) pollQuickPayment(payment.paymentIntentId);
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.textContent = "Generar QR";
    }
  });

  document.getElementById("quickPaymentNew").addEventListener("click", () => {
    stopQuickPaymentPolling();
    document.getElementById("quickPaymentResult").hidden = true;
    document.getElementById("quickPaymentForm").reset();
    document.getElementById("quickPaymentFormStatus").textContent = "";
    document.getElementById("quickPaymentAmount").focus();
  });

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
    if (!currentStoreId) {
      status.textContent = "Selecciona una tienda antes de adaptar el CSV.";
      return;
    }
    const targetStoreId = currentStoreId;
    const importVersion = ++debtCsvImportVersion;
    status.textContent = "La IA está interpretando las columnas y los montos…";
    try {
      const csv = await file.text();
      try {
        const normalized = await api(`/stores/${targetStoreId}/debt-collection-links/import/normalize`, {
          method: "POST",
          body: JSON.stringify({ csv }),
        });
        if (importVersion !== debtCsvImportVersion || targetStoreId !== currentStoreId) return;
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
        if (importVersion !== debtCsvImportVersion || targetStoreId !== currentStoreId) return;
        preparedDebtCsvRows = parseDebtCsv(csv);
        status.textContent = `${file.name} · ${preparedDebtCsvRows.length} ${preparedDebtCsvRows.length === 1 ? "deuda lista" : "deudas listas"} · adaptación básica (IA no disponible)`;
      }
    } catch (error) {
      if (importVersion !== debtCsvImportVersion || targetStoreId !== currentStoreId) return;
      status.textContent = error.message;
    }
  });

  document.getElementById("debtCollectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentStoreId) return;
    const form = event.currentTarget;
    const submit = document.getElementById("debtCollectionSubmit");
    const status = document.getElementById("debtCollectionStatus");
    const appendTarget = debtAppendTarget ? { ...debtAppendTarget } : null;
    const targetStoreId = currentStoreId;
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
      if (targetStoreId === currentStoreId) {
        renderDebtCollectionLinks(await api(`/stores/${targetStoreId}/debt-collection-links`));
      }
    } catch (error) {
      errorEl.textContent = `${appendTarget ? "Error agregando deudas" : "Error creando la colección"}: ${error.message}`;
    } finally {
      submit.disabled = false;
      submit.textContent = debtAppendTarget ? "Agregar a esta colección" : "Agregar deudas al portal";
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
      growth.reset();
      proposals.reset();
      contracts.reset();
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

  function debtCollectionUrl(slug) {
    return checkoutOriginEl.value.replace(/\/$/, "") + "/?debt=" + encodeURIComponent(slug);
  }

  function renderDebtCollectionLinks(links) {
    lastDebtCollectionLinks = links;
    const list = document.getElementById("debtCollectionList");
    if (!currentStoreId) {
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
      renderDebtCollectionLinks(lastDebtCollectionLinks);
      document.getElementById(`debt-link-tab-${debtLinkStatusTab.toLowerCase()}`)?.focus();
    }));

    list.querySelectorAll(".debt-link-page-button:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
      debtCollectionPageByStatus.set(button.dataset.status, Number(button.dataset.page));
      renderDebtCollectionLinks(lastDebtCollectionLinks);
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
        const response = await fetch(`${apiBaseEl.value.replace(/\/$/, "")}/stores/${currentStoreId}/debt-collection-links/${button.dataset.id}/status.pdf`, {
          headers: { authorization: "Bearer " + sessionToken },
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
        await api(`/stores/${currentStoreId}/debt-collection-links/${button.dataset.id}/archive`, { method: "POST" });
        renderDebtCollectionLinks(await api(`/stores/${currentStoreId}/debt-collection-links`));
      } catch (error) {
        errorEl.textContent = "Error: " + error.message;
      }
    }));
    list.querySelectorAll(".restore-debt-link").forEach((button) => button.addEventListener("click", async () => {
      try {
        button.disabled = true;
        button.textContent = "Restaurando…";
        await api(`/stores/${currentStoreId}/debt-collection-links/${button.dataset.id}/restore`, { method: "POST" });
        renderDebtCollectionLinks(await api(`/stores/${currentStoreId}/debt-collection-links`));
        infoEl.textContent = "Link de deuda restaurado y agregado nuevamente al portal.";
      } catch (error) {
        button.disabled = false;
        button.textContent = "Restaurar link";
        errorEl.textContent = "Error: " + error.message;
      }
    }));
  }

  function stopQuickPaymentPolling() {
    quickPaymentPollGeneration += 1;
    if (quickPaymentPollTimer) window.clearTimeout(quickPaymentPollTimer);
    quickPaymentPollTimer = null;
  }

  function setQuickPaymentOutcome(status) {
    const statusEl = document.getElementById("quickPaymentResultStatus");
    if (status === "SUCCEEDED") {
      statusEl.textContent = "Pago recibido y registrado correctamente.";
      statusEl.classList.add("success-text");
      refreshFinancesInBackground();
      return true;
    }
    if (["FAILED", "CANCELED"].includes(status)) {
      statusEl.textContent = status === "CANCELED" ? "Este cobro fue cancelado." : "El pago no se completó. Crea un nuevo QR para reintentar.";
      statusEl.classList.remove("success-text");
      return true;
    }
    return false;
  }

  function pollQuickPayment(paymentIntentId) {
    stopQuickPaymentPolling();
    const generation = quickPaymentPollGeneration;
    let attempts = 0;
    const poll = async () => {
      if (generation !== quickPaymentPollGeneration) return;
      attempts += 1;
      try {
        const payment = await api(`/payment_intents/${paymentIntentId}`);
        if (generation !== quickPaymentPollGeneration || setQuickPaymentOutcome(payment.status)) return;
      } catch {
        // A temporary dashboard/network failure does not invalidate the bank
        // QR. Keep the visible QR and try again within the bounded window.
      }
      if (attempts >= 60) {
        document.getElementById("quickPaymentResultStatus").textContent = "El QR sigue visible, pero dejamos de consultar automáticamente. Revisa Pedidos y pagos para confirmar el estado.";
        return;
      }
      quickPaymentPollTimer = window.setTimeout(poll, 2500);
    };
    quickPaymentPollTimer = window.setTimeout(poll, 2500);
  }

  function renderCurrentStoreBanner() {
    const store = lastStores.find((s) => s.id === currentStoreId);
    document.getElementById("currentStoreLabel").textContent = store ? store.name : "esta tienda";
    document.getElementById("currentStoreLink").value = currentStoreUrl();
  }

  function renderStoreRows(stores) {
    lastStores = stores;
    const picker = document.getElementById("sidebarStorePicker");
    picker.innerHTML = stores.length ? stores.map(store => `<option value="${esc(store.id)}">${esc(store.name)}</option>`).join("") : '<option value="">Crea tu primera tienda</option>';
    picker.disabled = !stores.length;

    // If the previously selected store is gone (or nothing was selected yet), fall back
    // to the first store so the store pages always show something usable.
    if (!stores.some((s) => s.id === currentStoreId)) {
      selectStore(stores[0] ? stores[0].id : null);
    }

    picker.value = currentStoreId || "";
    const search = document.getElementById("storeLibrarySearch").value.trim().toLocaleLowerCase();
    const filter = document.getElementById("storeLibraryStatus").value;
    const statusFor = storePublicationState;
    const visible = stores.filter(store => (!search || store.name.toLocaleLowerCase().includes(search)) && (!filter || statusFor(store) === filter));
    document.getElementById("storeLibraryCount").textContent = `${visible.length} de ${stores.length} ${stores.length === 1 ? "tienda" : "tiendas"}`;
    document.getElementById("storeRows").innerHTML = `<button class="store-create-tile" id="openCreateStore" type="button"><span aria-hidden="true">+</span><strong>Crear una tienda</strong><small>Empieza desde cero</small></button><button class="store-create-tile" id="openShopifyImport" type="button"><span aria-hidden="true">↧</span><strong>Traer mi tienda de Shopify</strong><small>Productos, fotos y páginas</small></button>` + visible.map(store => {
      const revision = store.sourceProject?.revision || store.publishedSourceRevision;
      const cover = store.bannerUrl || store.heroSlides?.[0]?.imageUrl || store.publicityImageUrl;
      const preview = revision ? `<iframe src="/studio/?thumbnail=1&embedded=1&store=${encodeURIComponent(store.id)}&revision=${Number(revision)}" title="Vista de ${esc(store.name)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe>` : cover ? `<img src="${esc(dashboardAssetUrl(cover))}" alt="" loading="lazy">` : `<div class="store-card-placeholder"><span aria-hidden="true">${esc(store.name.slice(0,1).toUpperCase())}</span><strong>${esc(store.name)}</strong><small>Tu próximo gran comienzo</small></div>`;
      const state = statusFor(store), stateLabel = { published: "Publicada", draft: "Borrador", archived: "Archivada" }[state];
      return `<article class="store-row ${store.id === currentStoreId ? "active" : ""}" data-id="${esc(store.id)}">
        <div class="store-card-preview">${preview}</div>
        <div class="store-card-info"><div><h3 class="store-row-name">${esc(store.name)}</h3><p><span class="store-card-status" data-status="${state}">${stateLabel}</span>${store.id === currentStoreId ? '<span class="store-card-current">Tienda actual</span>' : ''}</p></div><details class="store-card-menu"><summary aria-label="Opciones de ${esc(store.name)}">•••</summary><div><a class="store-row-open" href="${esc(publicStoreUrl(store))}" target="_blank" rel="noopener noreferrer">Abrir tienda pública</a><button class="ghost delete-store" data-id="${esc(store.id)}" data-name="${esc(store.name)}" type="button">Eliminar tienda</button></div></details></div>
        <span class="store-card-edit">Abrir editor ↗</span>
      </article>`;
    }).join("") + (!visible.length ? `<p class="store-library-empty">${stores.length ? "No hay tiendas que coincidan con tu búsqueda." : "Todavía no tienes una tienda. Crea la tuya para comenzar."}</p>` : "");
    document.getElementById("openCreateStore").addEventListener("click", openCreateStore);
    document.getElementById("openShopifyImport").addEventListener("click", openShopifyImport);
    document.querySelectorAll(".store-card-menu").forEach(menu => menu.addEventListener("click", event => event.stopPropagation()));

    document.querySelectorAll(".store-row").forEach((row) => {
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Administrar ${stores.find(store => store.id === row.dataset.id)?.name || "tienda"}`);
      row.addEventListener("keydown", event => { if (event.target === row && ["Enter", " "].includes(event.key)) { event.preventDefault(); row.click(); } });
      row.addEventListener("click", async () => {
        const changingStore = row.dataset.id !== currentStoreId;
        if (changingStore && !canLeaveMerchantStudio()) return;
        selectStore(row.dataset.id);
        history.pushState(null, "", "#dashboard-workspace");
        setDashboardView("workspace");
        await refresh();
      });
    });
    document.querySelectorAll(".delete-store").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (currentStoreId === btn.dataset.id && !canLeaveMerchantStudio()) return;
        if (!confirm(`¿Eliminar la tienda "${btn.dataset.name}" y todos sus productos? Esta acción no se puede deshacer.`)) return;
        try {
          await api(`/stores/${btn.dataset.id}`, { method: "DELETE" });
          if (currentStoreId === btn.dataset.id) selectStore(null);
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
    const hasStore = !!currentStoreId;
    document.getElementById("paymentLinksSection").style.display = hasStore ? "block" : "none";
    document.getElementById("debtCollectionSection").style.display = hasStore ? "block" : "none";
    document.getElementById("quickPaymentSection").style.display = hasStore ? "block" : "none";
    document.getElementById("noStoreMessage").style.display = hasStore ? "none" : "block";
    if (hasStore && !document.getElementById("debtNotificationEmail").value) {
      document.getElementById("debtNotificationEmail").value = emailEl.value;
    }
    renderCurrentStoreBanner();
  }

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
    const store = lastStores.find((item) => item.id === currentStoreId);
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

  // One row per currency in the "Tu cuenta" list on Resumen.
  function renderBalanceCards(balances) {
    document.getElementById("balanceCards").innerHTML = balances
      .map(
        (entry) => `<div class="overview-balance">
          <dt>Saldo por desembolsar (${esc(entry.currency)})</dt>
          <dd>${money(entry.payableBalance, esc(entry.currency))}</dd>
          <p>Se transfiere a tu cuenta bancaria en el próximo desembolso.</p>
        </div>`,
      )
      .join("");
  }

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

  function renderInternationalCard(intl) {
    if (!intl) return "";
    const fee = `${(intl.feeBps / 100).toFixed(1).replace(".", ",")}%`;
    const states = {
      OFF: `<p>Recibe pagos de compradores fuera de Bolivia con tarjeta y métodos locales. Se cobra en USD con una comisión de ${fee}.</p>
            <button type="button" class="primary" data-intl-request ${intl.settlementMode !== "AGGREGATOR" ? "disabled" : ""}>Solicitar activación</button>
            ${intl.settlementMode !== "AGGREGATOR" ? '<p class="hint">Disponible solo cuando pagosYa liquida tus cobros.</p>' : ""}`,
      REQUESTED: `<p><strong>Solicitud en revisión.</strong> Te avisaremos cuando esté activo. Comisión: ${fee}.</p>`,
      ENABLED: `<p><strong>Activo.</strong> Comisión internacional: ${fee}.</p>`,
      REJECTED: `<p><strong>No aprobado.</strong> ${esc(intl.note || "")}</p><button type="button" data-intl-request>Volver a solicitar</button>`,
    };
    const usdHint = intl.status !== "OFF" && !intl.usdPayoutAccountOnFile
      ? '<p class="hint">Agrega una cuenta en USD en tus datos de verificación para recibir desembolsos en dólares.</p>'
      : "";
    return `<section class="panel" role="region" aria-label="Pagos internacionales"><h3>Pagos internacionales</h3>${states[intl.status] ?? ""}${usdHint}</section>`;
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

  function renderPayoutRows(payouts) {
    lastPayouts = payouts;
    document.getElementById("downloadPayoutsPdf").disabled = payouts.length === 0;
    document.getElementById("payoutRows").innerHTML = payouts
      .map(
        (p) => `<tr>
          <td><code>${esc(p.id)}</code></td>
          <td>${money(p.amount)}</td>
          <td>${esc(maskBankAccount(p.bankAccount))}</td>
          <td><span class="badge ${esc(p.status)}">${esc(p.status)}</span></td>
          <td>${p.paidOutAt ? esc(new Date(p.paidOutAt).toLocaleString()) : "—"}</td>
        </tr>`,
      )
      .join("") || `<tr><td colspan="5" class="muted">Todavía no hay desembolsos.</td></tr>`;
  }

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
    if (lastTotalFinances) renderTotalFinances(lastTotalFinances);
    if (lastFinances) renderFinances(lastFinances);
    if (lastPayments.length) renderPaymentRows();
    if (lastPayouts.length) renderPayoutRows(lastPayouts);
    if (lastPaymentLinks.length) renderPaymentLinkRows(lastPaymentLinks);
    if (preparedInventoryRows.length) renderInventoryReview();
  }

  moneyVisibilityToggleEl.addEventListener("click", () => setMonetaryValuesHidden(!monetaryValuesHidden));
  setMonetaryValuesHidden(monetaryValuesHidden, false);
  const PAYMENT_METHOD_META = {
    CARD: { label: "Tarjeta", color: "#818cf8" },
    QR: { label: "Código QR", color: "#34d399" },
    BANK_TRANSFER: { label: "Transferencia", color: "#ffbd59" },
    TIGO_MONEY: { label: "Tigo Money", color: "#c084fc" },
    UNSPECIFIED: { label: "Sin método", color: "#737373" },
  };

  function renderFinanceDonut(segments) {
    const donut = document.getElementById("financeDonut");
    const legend = document.getElementById("financeLegend");
    const total = segments.reduce((sum, segment) => sum + segment.amount, 0);
    document.getElementById("financeDonutTotal").textContent = moneyNumber(total);
    if (total <= 0) {
      donut.style.background = "conic-gradient(var(--pg-border) 0 100%)";
      donut.setAttribute("aria-label", "Todavía no hay ingresos para graficar");
      legend.innerHTML = `<div class="finance-legend-empty">El gráfico aparecerá cuando recibas tu primer pago.</div>`;
      return;
    }

    let offset = 0;
    const gradientStops = [];
    const accessibleParts = [];
    legend.innerHTML = segments
      .filter((segment) => segment.amount > 0)
      .map((segment) => {
        const meta = PAYMENT_METHOD_META[segment.paymentMethodType] || { label: segment.paymentMethodType, color: "#f87171" };
        const start = offset;
        offset += (segment.amount / total) * 100;
        gradientStops.push(`${meta.color} ${start.toFixed(2)}% ${offset.toFixed(2)}%`);
        const percent = Math.round((segment.amount / total) * 100);
        accessibleParts.push(`${meta.label}: ${percent}%`);
        return `<div class="finance-legend-row">
          <span class="finance-legend-swatch" style="--legend-color:${meta.color}"></span>
          <span>${esc(meta.label)} · ${percent}%</span>
          <strong>${money(segment.amount)}</strong>
        </div>`;
      })
      .join("");
    donut.style.background = `conic-gradient(${gradientStops.join(",")})`;
    donut.setAttribute("aria-label", `Ingresos por medio de pago. ${accessibleParts.join(". ")}. Total ${money(total)}.`);
  }

  function renderTotalFinances(finances) {
    lastTotalFinances = finances;
    document.getElementById("financeAllRevenueValue").textContent = money(finances.totalRevenue);
    document.getElementById("financeAllPaymentCount").textContent = String(finances.paymentCount ?? 0);
    document.getElementById("financeDirectRevenueValue").textContent = money(finances.unattributedRevenue ?? 0);
    const directCount = finances.unattributedPaymentCount ?? 0;
    document.getElementById("financeDirectPaymentCount").textContent =
      directCount === 1 ? "1 pago sin tienda asignada" : `${directCount} pagos sin tienda asignada`;
  }

  function renderFinanceForecast(finances) {
    const projection = finances.monthlyProjection || {};
    const monthToDate = Number(projection.monthToDateRevenue) || 0;
    const projected = Number(projection.projectedRevenue) || 0;
    const elapsedDays = Number(projection.elapsedDays) || 0;
    const daysInMonth = Number(projection.daysInMonth) || 0;
    document.getElementById("financeProjectedRevenue").textContent = money(projected);
    document.getElementById("financeMonthToDateRevenue").textContent = `Acumulado: ${money(monthToDate)}`;
    document.getElementById("financeProjectionDays").textContent = elapsedDays && daysInMonth
      ? `Día ${elapsedDays} de ${daysInMonth}`
      : "Mes sin actividad";
    const progress = projected > 0 ? Math.max(0, Math.min(100, Math.round((monthToDate / projected) * 100))) : 0;
    document.getElementById("financeProjectionProgress").style.width = `${progress}%`;
    const track = document.getElementById("financeProjectionTrack");
    track.setAttribute("aria-valuenow", String(progress));
    track.setAttribute("aria-valuetext", `${progress}% del ingreso mensual proyectado`);
  }

  function renderSalesByWeekday(finances) {
    const rows = Array.isArray(finances.salesByWeekday) ? finances.salesByWeekday : [];
    const maximum = Math.max(...rows.map((row) => Number(row.paymentCount) || 0), 1);
    const best = finances.bestSalesDay;
    const bars = document.getElementById("financeWeekdayBars");
    document.getElementById("financeBestDay").textContent = best
      ? `${best.name} · ${best.paymentCount} ${best.paymentCount === 1 ? "venta" : "ventas"}`
      : "Todavía sin ventas";
    bars.innerHTML = rows.map((row) => {
      const count = Number(row.paymentCount) || 0;
      const height = count ? Math.max(14, Math.round((count / maximum) * 100)) : 6;
      const isBest = best?.weekday === row.weekday && count > 0;
      return `<div class="finance-weekday${isBest ? " is-best" : ""}" title="${esc(row.name)}: ${count} ${count === 1 ? "venta" : "ventas"}, ${esc(money(row.amount || 0))}">
        <div class="finance-weekday-column" style="--day-height:${height}%"></div>
        <strong>${esc(String(row.name || "").slice(0, 3))}</strong>
        <span>${count}</span>
      </div>`;
    }).join("");
    const description = rows.some((row) => row.paymentCount > 0)
      ? rows.map((row) => `${row.name}: ${row.paymentCount} ventas`).join(". ")
      : "Todavía no hay ventas para comparar por día";
    bars.setAttribute("aria-label", description);
  }

  function renderFinances(finances) {
    lastFinances = finances;
    renderOverview();
    const selectedStore = lastStores.find((store) => store.id === currentStoreId);
    const storeName = finances.scope?.storeName || selectedStore?.name;
    const isStoreScope = finances.scope?.type === "STORE" && !!storeName;
    document.getElementById("financeScopeHeading").textContent = isStoreScope ? `Finanzas de ${storeName}` : "Finanzas de todo el negocio";
    document.getElementById("financeScopeLabel").textContent = isStoreScope ? storeName : "Toda la cuenta";
    document.getElementById("financeScopeDescription").textContent = isStoreScope
      ? "Las ventas, el inventario y las visitas corresponden únicamente a esta tienda."
      : "No hay una tienda seleccionada; se muestra el resumen completo del negocio.";
    document.getElementById("financeRevenueCaption").textContent = isStoreScope
      ? `Pagos exitosos de ${storeName}`
      : "Pagos exitosos de todo el negocio";
    document.getElementById("financeRevenueValue").textContent = money(finances.totalRevenue);
    document.getElementById("financeInventoryValue").textContent = money(finances.inventoryValue);
    document.getElementById("financeViewsValue").textContent = String(finances.totalStoreViews);
    document.getElementById("downloadFinancePdf").disabled = !(finances.paymentCount > 0);
    renderFinanceDonut(finances.revenueByPaymentMethod || []);
    renderFinanceForecast(finances);
    renderSalesByWeekday(finances);
    const topProductsEmptyEl = document.getElementById("topProductsEmpty");
    const topProductsTableEl = document.getElementById("topProductsTable");
    const productBarsEl = document.getElementById("financeProductBars");
    if (finances.topProducts.length === 0) {
      topProductsTableEl.style.display = "none";
      topProductsEmptyEl.style.display = "block";
      productBarsEl.innerHTML = "";
      return;
    }
    topProductsEmptyEl.style.display = "none";
    topProductsTableEl.style.display = "table";
    const maximumProductRevenue = Math.max(...finances.topProducts.map((product) => Number(product.revenue) || 0), 1);
    const productBarColors = ["#f87171", "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa"];
    productBarsEl.innerHTML = finances.topProducts.slice(0, 5).map((product, index) => {
      const percent = Math.max(18, Math.round(((Number(product.revenue) || 0) / maximumProductRevenue) * 100));
      return `<div class="finance-product-bar" style="--bar-height:${percent}%;--bar-color:${productBarColors[index % productBarColors.length]}" title="${esc(product.name)}: ${esc(money(product.revenue))}"><span>${esc(product.name)}</span></div>`;
    }).join("");
    document.getElementById("topProductsRows").innerHTML = finances.topProducts
      .map(
        (product, index) => `<tr>
          <td>${index + 1}</td>
          <td>${esc(product.name)}</td>
          <td>${product.quantity}</td>
          <td>${money(product.revenue)}</td>
        </tr>`,
      )
      .join("");
  }

  function refreshFinancesInBackground() {
    const storeId = currentStoreId;
    Promise.all([
      api("/merchants/finances"),
      storeId ? api(`/merchants/finances?storeId=${encodeURIComponent(storeId)}`) : api("/merchants/finances"),
    ]).then(([totalFinances, scopedFinances]) => {
      if (storeId !== currentStoreId) return;
      renderTotalFinances(totalFinances);
      renderFinances(scopedFinances);
    }).catch(() => {
      // The product mutation already succeeded. Keep the last summary instead
      // of turning a non-critical refresh into a blocking error.
    });
  }

  // Shows only the last 4 digits — a payout row has no reason to repeat the
  // full account number on every line.
  function maskBankAccount(s) {
    const str = String(s ?? "");
    const digits = str.replace(/\D/g, "");
    if (digits.length <= 4) return str;
    return str.slice(0, -4).replace(/[0-9]/g, "•") + str.slice(-4);
  }

  // "active" hides REQUIRES_PAYMENT_METHOD specifically — a customer who
  // never even chose how to pay isn't a real payment attempt, and on a busy
  // store these dwarf real payments in the raw list. "Todos" still shows
  // them for anyone who wants the full picture.
  const PENDING_STATUSES = ["REQUIRES_PAYMENT_METHOD", "REQUIRES_CONFIRMATION", "PROCESSING"];
  const ENDED_STATUSES = ["CANCELED", "FAILED"];

  function filteredPayments() {
    const normalizedSearch = orderSearch.trim().toLocaleLowerCase("es");
    const matchingSearch = normalizedSearch
      // p.orderId is the id the buyer has: it is what the confirmation email
      // and the tracking link show, not the pi_ id.
      ? lastPayments.filter((p) => [p.id, p.orderId, p.customerName, p.customerEmail, p.customerPhone, p.description]
          .some((value) => String(value || "").toLocaleLowerCase("es").includes(normalizedSearch)))
      : lastPayments;
    if (paymentStatusFilter === "all") return matchingSearch;
    if (paymentStatusFilter === "active") return matchingSearch.filter((p) => p.status !== "REQUIRES_PAYMENT_METHOD");
    if (paymentStatusFilter === "pending") return matchingSearch.filter((p) => PENDING_STATUSES.includes(p.status));
    if (paymentStatusFilter === "ended") return matchingSearch.filter((p) => ENDED_STATUSES.includes(p.status));
    return matchingSearch.filter((p) => p.status === paymentStatusFilter);
  }

  const ORDER_STATUS_LABELS = {
    LEAD_RECEIVED: "Interesado recibido",
    SUCCEEDED: "Pago exitoso",
    REQUIRES_ACTION: "Necesita acción",
    REQUIRES_PAYMENT_METHOD: "Sin método de pago",
    REQUIRES_CONFIRMATION: "Por confirmar",
    PROCESSING: "Procesando",
    CANCELED: "Cancelado",
    FAILED: "Fallido",
    PAID: "Pagado · por preparar",
    PREPARING: "En preparación",
    READY_FOR_PICKUP: "Listo para recoger",
    SHIPPED: "Enviado",
    DELIVERED: "Entregado",
    REFUNDED: "Reembolsado",
  };

  const FULFILLMENT_NEXT = {
    PAID: ["PREPARING", "READY_FOR_PICKUP", "SHIPPED", "CANCELED", "REFUNDED"],
    PREPARING: ["READY_FOR_PICKUP", "SHIPPED", "CANCELED"],
    READY_FOR_PICKUP: ["DELIVERED", "CANCELED"],
    SHIPPED: ["DELIVERED", "CANCELED"],
    DELIVERED: ["REFUNDED"],
  };

  function orderItemsLabel(order) {
    if (!Array.isArray(order.items) || order.items.length === 0) return order.description || "Sin detalle de productos";
    return order.items.map((item) => {
      const name = item.name || item.label || "Producto";
      const option = item.variantName ? ` (${item.variantName})` : "";
      return `${name}${option} × ${item.quantity || 1}`;
    }).join(" · ");
  }

  function emptyPaymentRowHtml() {
    if (lastPayments.length === 0) return `<tr><td colspan="6" class="muted">Todavía no hay pedidos ni interesados.</td></tr>`;
    const incomplete = paymentStatusFilter === "active"
      ? lastPayments.filter((payment) => payment.status === "REQUIRES_PAYMENT_METHOD").length
      : 0;
    if (!incomplete) return `<tr><td colspan="6" class="muted">No encontramos pedidos con estos filtros.</td></tr>`;
    const count = incomplete === 1 ? "1 pedido quedó" : `${incomplete} pedidos quedaron`;
    return `<tr><td colspan="6" class="muted">Ningún pago completado todavía. ${count} sin llegar a elegir método de pago. <button type="button" class="ghost" id="showAllPayments">Ver todos</button></td></tr>`;
  }

  function renderPaymentRows() {
    const selectedStore = lastStores.find((store) => store.id === currentStoreId);
    document.getElementById("paymentScopeLabel").textContent = selectedStore?.name || "Toda la cuenta";
    const filtered = filteredPayments();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAYMENT_PAGE_SIZE));
    paymentPage = Math.min(paymentPage, pageCount);
    const start = (paymentPage - 1) * PAYMENT_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAYMENT_PAGE_SIZE);
    document.getElementById("downloadOrdersCsv").disabled = filtered.length === 0;
    document.getElementById("downloadOrdersPdf").disabled = filtered.length === 0;
    document.getElementById("downloadSalesCsv").disabled = !(lastFinances?.paymentCount > 0);

    document.getElementById("paymentRows").innerHTML = pageRows
      .map(
        (p) => `<tr>
          <td><div class="buyer-summary"><strong>${p.kind === "LEAD" ? "Interesado" : "Pago"}</strong><code>${esc(p.id)}</code>${p.storeName ? `<span>${esc(p.storeName)}</span>` : ""}</div></td>
          <td><div class="buyer-summary"><strong>${esc(p.customerName || "Sin nombre")}</strong><span>${esc(p.customerEmail || "Sin correo")}</span><span>${esc(p.customerPhone || "Sin teléfono")}</span></div></td>
          <td>${money(p.amount)}</td>
          <td><span class="badge ${esc(p.status)}">${esc(ORDER_STATUS_LABELS[p.status] || p.status)}</span>${p.paymentMethodType ? `<div class="faint" style="margin-top:4px">${esc(p.paymentMethodType)}</div>` : ""}</td>
          <td>${esc(new Date(p.createdAt).toLocaleString())}</td>
          <td><details class="order-detail"><summary>Ver datos</summary><div class="order-detail-card"><strong>${esc(orderItemsLabel(p))}</strong>${p.description ? `<span>${esc(p.description)}</span>` : ""}${p.fulfillmentStatus ? `<span>Entrega: <b>${esc(ORDER_STATUS_LABELS[p.fulfillmentStatus] || p.fulfillmentStatus)}</b></span>` : ""}${p.deliveryRequested ? `<span><b>Entrega solicitada</b>${p.deliveryAddress ? ` · ${esc(p.deliveryAddress)}` : ""}</span>` : ""}<div class="order-contact-links">${p.customerEmail ? `<a href="mailto:${encodeURIComponent(p.customerEmail)}">Enviar correo</a>` : ""}${p.customerPhone ? `<a href="tel:${esc(String(p.customerPhone).replace(/[^+\d]/g, ""))}">Llamar</a>` : ""}${Number.isFinite(p.customerLatitude) && Number.isFinite(p.customerLongitude) ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${p.customerLatitude},${p.customerLongitude}`)}" target="_blank" rel="noopener noreferrer">Abrir ubicación</a>` : ""}</div>${p.orderId && (FULFILLMENT_NEXT[p.fulfillmentStatus] || []).length ? `<label class="faint">Actualizar entrega<select class="fulfillment-select" data-order-id="${esc(p.orderId)}" style="margin-top:6px"><option value="">Selecciona…</option>${FULFILLMENT_NEXT[p.fulfillmentStatus].map((status) => `<option value="${status}">${esc(ORDER_STATUS_LABELS[status] || status)}</option>`).join("")}</select></label>` : ""}${p.orderId ? `<div data-shipment-panel data-order-id="${esc(p.orderId)}"></div>` : ""}<code>ID: ${esc(p.id)}</code></div></details></td>
        </tr>`,
      )
      .join("") || emptyPaymentRowHtml();

    // "Con actividad" hides checkouts that never reached a payment method. With
    // no completed payment yet that leaves a blank table, which reads as "nothing
    // ever arrived" rather than "your buyers are dropping off before paying".
    document.getElementById("showAllPayments")?.addEventListener("click", () => {
      const select = document.getElementById("paymentStatusFilter");
      select.value = "all";
      select.dispatchEvent(new Event("change"));
    });

    document.getElementById("paymentPager").innerHTML =
      filtered.length === 0
        ? ""
        : `<button type="button" class="ghost" id="paymentPrev" ${paymentPage <= 1 ? "disabled" : ""}>&larr; Anterior</button>
           <span>Página ${paymentPage} de ${pageCount} (${filtered.length} pedidos)</span>
           <button type="button" class="ghost" id="paymentNext" ${paymentPage >= pageCount ? "disabled" : ""}>Siguiente &rarr;</button>`;

    document.getElementById("paymentPrev")?.addEventListener("click", () => {
      paymentPage--;
      renderPaymentRows();
    });
    document.getElementById("paymentNext")?.addEventListener("click", () => {
      paymentPage++;
      renderPaymentRows();
    });
    document.querySelectorAll(".fulfillment-select").forEach((select) => {
      select.addEventListener("change", async () => {
        if (!select.value) return;
        select.disabled = true;
        try {
          await api(`/orders/${encodeURIComponent(select.dataset.orderId)}/fulfillment`, {
            method: "PATCH",
            body: JSON.stringify({ status: select.value }),
          });
          infoEl.textContent = "Estado de entrega actualizado.";
          await refresh();
        } catch (error) {
          errorEl.textContent = "Error actualizando la entrega: " + error.message;
          select.disabled = false;
        }
      });
    });
    document.querySelectorAll(".order-detail").forEach((d) => {
      d.addEventListener("toggle", async () => {
        const box = d.querySelector("[data-shipment-panel]");
        if (d.open && box && !box.dataset.loaded) {
          box.dataset.loaded = "1";
          try {
            if (!renderShipmentPanel) {
              ({ renderShipmentPanel } = await import('/src/shipment-panel.mjs'));
            }
            await renderShipmentPanel(box, api, box.dataset.orderId);
          } catch (e) {
            box.textContent = e.message;
          }
        }
      });
    });
  }

  document.getElementById("paymentStatusFilter").addEventListener("change", (e) => {
    paymentStatusFilter = e.target.value;
    paymentPage = 1;
    renderPaymentRows();
  });
  document.getElementById("orderSearch").addEventListener("input", (e) => {
    orderSearch = e.target.value;
    paymentPage = 1;
    renderPaymentRows();
  });

  let inboxThreadId = null;
  let inboxDomainVerified = false;

  // A store can accumulate threads before it ever verifies an email domain:
  // reading is fine, but a reply would be rejected server-side. Disable the
  // form instead of letting the merchant type a reply and hit a Spanish error.
  function setInboxReplyEnabled(enabled, domain) {
    document.getElementById("inboxDomainNotice").hidden = enabled;
    document.getElementById("inboxReplyBody").disabled = !enabled;
    document.getElementById("inboxReplySubmit").disabled = !enabled;
    // El aviso lleva al paso que falta de verdad: conectar el dominio o confirmar sus registros.
    document.getElementById("inboxDomainStep").textContent = domain
      ? `Ya conectaste ${domain.name}: solo falta confirmar sus registros DNS.`
      : "Conecta el dominio desde el que responderás y confirma sus registros DNS.";
    document.getElementById("inboxDomainLink").textContent = domain
      ? `Verificar los registros de ${domain.name} →`
      : "Conectar mi dominio de correo →";
  }

  document.getElementById("inboxDomainLink").addEventListener("click", (event) => {
    event.preventDefault();
    if (!canLeaveMerchantStudio()) return;
    selectMarketingTab("domain");
    history.pushState(null, "", "#dashboard-marketing");
    setDashboardView("marketing");
  });

  async function refreshInbox() {
    if (!currentStoreId) return;
    const storeId = currentStoreId;
    const [threads, workspace] = await Promise.all([
      api(`/stores/${storeId}/inbox`),
      api(`/stores/${storeId}/email-workspace`),
    ]);
    if (storeId !== currentStoreId) return;
    document.getElementById("inboxScopeLabel").textContent =
      lastStores.find((store) => store.id === currentStoreId)?.name || "Sin tienda seleccionada";
    inboxDomainVerified = workspace?.domain?.status === "verified";
    setInboxReplyEnabled(inboxDomainVerified, workspace?.domain);
    document.getElementById("inboxThreads").innerHTML = threads.length
      ? threads.map((thread) => `<li><button type="button" data-thread-id="${esc(thread.id)}" class="${thread.unreadForMerchant ? "is-unread" : ""}"><strong>${esc(thread.customerName || thread.customerEmail)}</strong><span>${esc(thread.subject)}</span></button></li>`).join("")
      : `<li class="muted">Todavía no hay conversaciones.</li>`;
  }

  async function openInboxThread(threadId) {
    inboxThreadId = threadId;
    const { messages } = await api(`/stores/${currentStoreId}/inbox/${threadId}`);
    // Inbound bodies are already plain text; esc() keeps them that way on screen.
    document.getElementById("inboxMessages").innerHTML = messages
      .map((message) => `<article class="inbox-message ${message.direction === "INBOUND" ? "is-from-customer" : "is-from-store"}"><p>${esc(message.body)}</p><time>${esc(new Date(message.createdAt).toLocaleString())}</time></article>`)
      .join("");
  }

  document.getElementById("inboxThreads").addEventListener("click", (event) => {
    const button = event.target.closest("[data-thread-id]");
    if (button) void openInboxThread(button.dataset.threadId);
  });

  document.getElementById("inboxReplyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!inboxDomainVerified || !inboxThreadId) return;
    const field = document.getElementById("inboxReplyBody");
    await api(`/stores/${currentStoreId}/inbox/${inboxThreadId}/reply`, {
      method: "POST", body: JSON.stringify({ body: field.value }),
    });
    field.value = "";
    await openInboxThread(inboxThreadId);
  });

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function safeFilename(value) {
    const valueOrDefault = value || "documento";
    return String(valueOrDefault)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function downloadPdf(path, filename, button) {
    const response = await fetch(`${apiBaseEl.value.replace(/\/$/, "")}${path}`, {
      headers: { authorization: "Bearer " + sessionToken },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error((body && body.message) || "No se pudo generar el PDF.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    if (button?.isConnected) {
      button.textContent = "PDF descargado";
      window.setTimeout(() => {
        if (button?.isConnected) button.textContent = "Descargar";
      }, 1400);
    }
  }

  function downloadOrdersCsv(rows, filename, includeTotal = false) {
    const headers = ["Tipo", "ID", "Tienda", "Fecha", "Estado", "Nombre", "Correo", "Teléfono", "Productos", "Monto", "Moneda", "Método"];
    const data = rows.map((order) => [
      order.kind === "LEAD" ? "Interesado" : "Pago",
      order.id,
      order.storeName || "Sin tienda",
      new Date(order.createdAt).toISOString(),
      ORDER_STATUS_LABELS[order.status] || order.status,
      order.customerName || "",
      order.customerEmail || "",
      order.customerPhone || "",
      orderItemsLabel(order),
      (Number(order.amount || 0) / 100).toFixed(2),
      order.currency || "BOB",
      order.paymentMethodType || "",
    ]);
    if (includeTotal) {
      data.push(["TOTAL", "", "", "", "", "", "", "", "", (rows.reduce((sum, order) => sum + Number(order.amount || 0), 0) / 100).toFixed(2), rows[0]?.currency || "BOB", ""]);
    }
    const csv = "\ufeff" + [headers, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  document.getElementById("downloadOrdersCsv").addEventListener("click", () => {
    const rows = filteredPayments();
    if (!rows.length) return;
    downloadOrdersCsv(rows, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`);
  });
  document.getElementById("downloadOrdersPdf").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando PDF…";
    try {
      const selectedStore = lastStores.find((candidate) => candidate.id === currentStoreId);
      const datePart = new Date().toISOString().slice(0, 10);
      const query = new URLSearchParams({ export: "true" });
      if (currentStoreId) query.set("storeId", currentStoreId);
      if (orderSearch.trim()) query.set("search", orderSearch.trim());
      if (paymentStatusFilter && paymentStatusFilter !== "all") query.set("status", paymentStatusFilter);
      await downloadPdf(`/merchants/orders.pdf?${query.toString()}`, `pedidos-${safeFilename(selectedStore?.slug || selectedStore?.name || "tienda")}-${datePart}.pdf`, button);
      infoEl.textContent = "PDF de pagos preparado.";
      button.textContent = original;
    } catch (error) {
      button.disabled = false;
      errorEl.textContent = "Error al descargar el PDF: " + error.message;
      button.textContent = original;
    } finally {
      button.disabled = false;
      if (button.textContent !== "PDF descargado") button.textContent = original;
    }
  });
  document.getElementById("downloadSalesCsv").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando CSV…";
    try {
      const query = currentStoreId
        ? `?storeId=${encodeURIComponent(currentStoreId)}&export=true`
        : "?export=true";
      const allOrders = await api(`/merchants/orders${query}`);
      const rows = allOrders.filter((order) => order.kind === "PAYMENT" && order.status === "SUCCEEDED");
      if (!rows.length) throw new Error("Todavía no hay ventas exitosas para descargar.");
      const store = lastStores.find((candidate) => candidate.id === currentStoreId);
      const slug = String(store?.slug || "negocio").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      downloadOrdersCsv(rows, `ventas-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, true);
      infoEl.textContent = `CSV preparado con ${rows.length} ${rows.length === 1 ? "venta" : "ventas"}.`;
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    } finally {
      button.textContent = originalText;
      renderPaymentRows();
    }
  });
  document.getElementById("downloadPayoutsPdf").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando PDF…";
    try {
      const datePart = new Date().toISOString().slice(0, 10);
      await downloadPdf(`/merchants/payouts.pdf`, `desembolsos-${datePart}.pdf`, button);
      infoEl.textContent = "Estado de desembolsos en PDF preparado.";
      button.textContent = originalText;
    } catch (error) {
      errorEl.textContent = "Error al descargar el PDF: " + error.message;
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("downloadFinancePdf").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando PDF…";
    try {
      const datePart = new Date().toISOString().slice(0, 10);
      const query = currentStoreId ? `?storeId=${encodeURIComponent(currentStoreId)}` : "";
      await downloadPdf(
        `/merchants/finances.pdf${query}`,
        `finanzas-${safeFilename(currentStoreId ? (lastStores.find((store) => store.id === currentStoreId)?.name || "tienda") : "negocio")}-${datePart}.pdf`,
        button,
      );
      infoEl.textContent = "Resumen financiero en PDF preparado.";
      button.textContent = originalText;
    } catch (error) {
      errorEl.textContent = "Error al descargar el PDF: " + error.message;
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  });

  /** `step` (Crecimiento): open the guide at description, price, photos or stock instead of the first question. */
  function beginPaymentLinkEdit(link, step = null) {
    if (!link) return;
    syncStoreResourceViews("products");
    const guide = document.getElementById("productGuideFrame");
    if (guide.dataset.ready === "true") guide.contentWindow?.postMessage({type:"pagosya:product-guide-edit", storeId: currentStoreId, product: link, ...(step ? { step } : {})}, location.origin);
    else {
      guide.dataset.pendingProduct = JSON.stringify(link);
      if (step) guide.dataset.pendingStep = step; else delete guide.dataset.pendingStep;
    }
    guide.scrollIntoView({block:"center",behavior:"smooth"});
  }
  function renderPaymentLinkRows(links) {
    lastPaymentLinks = links;
    bulkDiscountClearAllEl.disabled = !links.some((product) => product.discountPercent !== null && product.discountPercent !== undefined);
    if (!bulkDiscountStudioEl.hidden) renderBulkDiscountProducts();
    const rowsEl = document.getElementById("paymentLinkRows");
    const searchQuery = normalizeProductSearch(paymentLinkSearchEl.value);
    const matchingLinks = searchQuery
      ? links.filter((link) => {
          const category = lastCategories.find((item) => item.id === link.categoryId);
          return normalizeProductSearch([
            link.name,
            link.description,
            category?.name,
            ...(link.tags || []),
          ].filter(Boolean).join(" ")).includes(searchQuery);
        })
      : links;
    paymentLinkSearchClearEl.hidden = !searchQuery;
    paymentLinkSearchSummaryEl.textContent = searchQuery
      ? `${matchingLinks.length} de ${links.length} ${links.length === 1 ? "producto coincide" : "productos coinciden"} con tu búsqueda.`
      : links.length > paymentLinkPageSize
        ? `${links.length} productos guardados. Los más nuevos aparecen primero; los anteriores continúan en las páginas siguientes.`
        : `${links.length} ${links.length === 1 ? "producto guardado" : "productos guardados"}. Los más nuevos aparecen primero.`;
    const pageTokens = (currentPage, totalPages) => {
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
    const renderRow = (link) => {
        const cover = link.imageUrls && link.imageUrls[0];
        const thumb = cover ? `<img class="link-thumb" src="${esc(dashboardAssetUrl(cover))}" alt="" style="object-position:${esc(link.imagePositions?.[0] || "50% 50%")}">` : "";
        const swatch = link.color
          ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(link.color)};border:1px solid rgba(0,0,0,.15);margin-right:6px" title="${esc(link.color)}"></span>`
          : "";
        const category = lastCategories.find((c) => c.id === link.categoryId);
        const meta = [];
        if (category) meta.push(esc(category.name));
        if (link.stock !== null && link.stock !== undefined) meta.push(`Stock: ${link.stock}`);
        if (link.variants?.length) {
          meta.push(
            `Opciones: ${link.variants
              .map((variant) => `${esc(variant.name)} (${variant.stock === undefined ? "compartido" : variant.stock === null ? "∞" : variant.stock})`)
              .join(", ")}`,
          );
        }
        if (link.codigoProducto) meta.push(`SKU: ${esc(link.codigoProducto)}`);
        if (link.codigoProductoSin) meta.push("SIN clasificado");
        const discountStartsAt = Date.parse(link.discountStartsAt || "");
        const discountEndsAt = Date.parse(link.discountEndsAt || "");
        const discountActive = Number.isInteger(link.discountPercent) && Date.now() >= discountStartsAt && Date.now() < discountEndsAt;
        if (Number.isInteger(link.discountPercent) && Number.isFinite(discountStartsAt) && Number.isFinite(discountEndsAt)) {
          const discountState = discountActive ? "Activa" : Date.now() < discountStartsAt ? "Programada" : "Finalizada";
          meta.push(`${discountState}: ${link.discountPercent}% hasta ${new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(discountEndsAt))}`);
        }
        const metaLine = meta.length ? `<div class="faint" style="margin-top:2px">${meta.join(" · ")}</div>` : "";
        const tagBadges = (link.tags || []).map((t) => `<span class="tag-badge">${esc(t)}</span>`).join("");
        const prices = (link.variants || []).map((variant) => variant.amount);
        const regularPriceLabel = prices.length
          ? Math.min(...prices) === Math.max(...prices)
            ? money(prices[0])
            : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`
          : money(link.amount);
        const priceLabel = discountActive
          ? `<strong style="color:#be123c">${link.discountPercent}% menos</strong><br><span class="faint"><s>${regularPriceLabel}</s></span>`
          : regularPriceLabel;
        const soldOut = link.variants?.length
          ? link.variants.every((variant) => variant.stock === 0)
          : link.stock === 0;
        const statusLabel = link.status === "ACTIVE" ? "Activo" : link.status === "ARCHIVED" ? "Archivado" : link.status;
        return `<tr data-payment-link-id="${esc(link.id)}">
          <td>${thumb}${swatch}${esc(link.name)}${tagBadges ? `<br>${tagBadges}` : ""}${metaLine}</td>
          <td>${priceLabel}</td>
          <td><div class="product-availability-badges"><span class="badge ${esc(link.status)}">${esc(statusLabel)}</span>${soldOut ? '<span class="badge SOLD_OUT">Agotado</span>' : ""}</div></td>
          <td>
            <div class="product-row-actions">
              ${link.status === "ACTIVE" ? `<button class="ghost edit-link" data-id="${esc(link.id)}">Editar</button>` : ""}
              ${link.status === "ACTIVE" && !soldOut ? `<button class="ghost sold-out-link" data-id="${esc(link.id)}" data-name="${esc(link.name)}">Marcar agotado</button>` : ""}
              ${link.status === "ACTIVE" ? `<button class="ghost archive-link" data-id="${esc(link.id)}">Archivar</button>` : ""}
              ${link.status === "ARCHIVED" ? `<button class="ghost restore-link" data-id="${esc(link.id)}">Restaurar</button>` : ""}
              <button class="ghost delete-link" data-id="${esc(link.id)}" data-name="${esc(link.name)}">Eliminar</button>
            </div>
          </td>
        </tr>`;
    };
    const groups = [
      { status: "ACTIVE", title: "Productos activos", className: "is-active", empty: "No hay productos activos." },
      { status: "ARCHIVED", title: "Productos archivados", className: "is-archived", empty: "No hay productos archivados." },
    ];
    rowsEl.innerHTML = groups.map((group) => {
      const statusLinks = links.filter((link) => link.status === group.status);
      const groupLinks = matchingLinks.filter((link) => link.status === group.status);
      const totalPages = Math.max(1, Math.ceil(groupLinks.length / paymentLinkPageSize));
      const requestedPage = paymentLinkPageByStatus.get(group.status) || 1;
      const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
      paymentLinkPageByStatus.set(group.status, currentPage);
      const start = (currentPage - 1) * paymentLinkPageSize;
      const visibleLinks = groupLinks.slice(start, start + paymentLinkPageSize);
      const summary = groupLinks.length ? `${start + 1}–${Math.min(start + paymentLinkPageSize, groupLinks.length)} de ${groupLinks.length}` : "0 productos";
      const controls = pageTokens(currentPage, totalPages).map((token) => token === "gap"
        ? `<span class="payment-link-page-gap" aria-hidden="true">…</span>`
        : `<button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${token}" ${token === currentPage ? 'aria-current="page"' : ""} aria-label="Página ${token} de ${group.title.toLowerCase()}">${token}</button>`).join("");
      return `<section class="payment-link-group ${group.className}" data-payment-link-status="${group.status}" aria-labelledby="payment-link-${group.status.toLowerCase()}-title">
        <header class="payment-link-group-head">
          <h3 id="payment-link-${group.status.toLowerCase()}-title">${group.title}</h3>
          <span class="payment-link-group-count">${searchQuery ? `${groupLinks.length} de ${statusLinks.length}` : groupLinks.length} ${statusLinks.length === 1 ? "producto" : "productos"}</span>
        </header>
        ${groupLinks.length ? `<div class="payment-link-table-wrap"><table class="payment-link-table">
          <thead><tr><th>Nombre</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${visibleLinks.map(renderRow).join("")}</tbody>
        </table></div>` : group.status === "ACTIVE" && !searchQuery && links.length === 0
          ? '<p class="payment-link-group-empty">Todavía no tienes productos. <button class="ghost" type="button" id="emptyCatalogImport">Importar catálogo</button></p>'
          : `<p class="payment-link-group-empty">${searchQuery ? "No hay productos de este estado que coincidan con tu búsqueda." : group.empty}</p>`}
        <nav class="payment-link-pagination" aria-label="Páginas de ${group.title.toLowerCase()}" ${totalPages <= 1 ? "hidden" : ""}>
          <span class="payment-link-page-summary">${summary}</span>
          <div class="payment-link-page-controls">
            <button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${currentPage - 1}" aria-label="Página anterior" ${currentPage === 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
            ${controls}
            <button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${currentPage + 1}" aria-label="Página siguiente" ${currentPage === totalPages ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
        </nav>
      </section>`;
    }).join("");

    document.getElementById("emptyCatalogImport")?.addEventListener("click", () => {
      document.getElementById("catalogImportDisclosure").open = true;
      const toggle = document.getElementById("inventoryImporterToggle");
      if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      document.getElementById("inventoryImporter").scrollIntoView({ block: "start" });
      document.getElementById("inventoryCsvInput").focus();
    });

    document.querySelectorAll(".payment-link-page-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        paymentLinkPageByStatus.set(btn.dataset.status, Number(btn.dataset.page));
        renderPaymentLinkRows(lastPaymentLinks);
        document.querySelector(`[data-payment-link-status="${btn.dataset.status}"]`)?.scrollIntoView({ block: "nearest" });
      });
    });

    document.querySelectorAll(".archive-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Archivando…";
          const archivedLink = await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}/archive`, { method: "POST" });
          renderPaymentLinkRows(lastPaymentLinks.map((link) => (link.id === archivedLink.id ? archivedLink : link)));
          infoEl.textContent = `Producto "${archivedLink.name}" archivado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Archivar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".sold-out-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const link = lastPaymentLinks.find((item) => item.id === btn.dataset.id);
        if (!link || !confirm(`¿Marcar "${btn.dataset.name}" como agotado? Los clientes lo verán, pero no podrán comprarlo hasta que vuelvas a asignar stock.`)) return;
        const body = link.variants?.length
          ? { variants: link.variants.map((variant) => ({ id: variant.id, name: variant.name, amount: variant.amount, stock: 0 })) }
          : { stock: 0 };
        try {
          btn.disabled = true;
          btn.textContent = "Marcando…";
          const updatedLink = await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          renderPaymentLinkRows(lastPaymentLinks.map((item) => (item.id === updatedLink.id ? updatedLink : item)));
          infoEl.textContent = `Producto "${updatedLink.name}" marcado como agotado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Marcar agotado";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".restore-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Restaurando…";
          const restoredLink = await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}/restore`, { method: "POST" });
          renderPaymentLinkRows(lastPaymentLinks.map((link) => (link.id === restoredLink.id ? restoredLink : link)));
          infoEl.textContent = `Producto "${restoredLink.name}" restaurado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Restaurar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".delete-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar "${btn.dataset.name}"? Esta acción no se puede deshacer.`)) return;
        try {
          btn.disabled = true;
          btn.textContent = "Eliminando…";
          await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}`, { method: "DELETE" });
          renderPaymentLinkRows(lastPaymentLinks.filter((link) => link.id !== btn.dataset.id));
          infoEl.textContent = `Producto "${btn.dataset.name}" eliminado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Eliminar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".edit-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        const link = lastPaymentLinks.find((l) => l.id === btn.dataset.id);
        beginPaymentLinkEdit(link);
      });
    });
  }

  function normalizeProductSearch(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .trim();
  }

  function resetPaymentLinkBrowseState() {
    paymentLinkPageByStatus.set("ACTIVE", 1);
    paymentLinkPageByStatus.set("ARCHIVED", 1);
    if (paymentLinkSearchEl) paymentLinkSearchEl.value = "";
  }

  paymentLinkSearchEl.addEventListener("input", () => {
    paymentLinkPageByStatus.set("ACTIVE", 1);
    paymentLinkPageByStatus.set("ARCHIVED", 1);
    renderPaymentLinkRows(lastPaymentLinks);
  });
  paymentLinkSearchClearEl.addEventListener("click", () => {
    resetPaymentLinkBrowseState();
    renderPaymentLinkRows(lastPaymentLinks);
    paymentLinkSearchEl.focus();
  });

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
  // its own: everything it edits is scoped to the selected store.
  /** Marca, envíos y dominio: the Studio's own panels, shown over the dashboard. */
  async function openSettingsSection(section) {
    if (!currentStoreId) return;
    sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, ""));
    const { openSettingsOverlay } = await import("/src/settings-overlay.mjs");
    openSettingsOverlay(currentStoreId, section);
  }
  document.querySelectorAll("[data-settings-open]").forEach(button => button.addEventListener("click", () => void openSettingsSection(button.dataset.settingsOpen)));
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
    initStoreEditorSections(document.getElementById("storeSettingsRoot"));
  }).catch(() => {
    document.getElementById("storeSettingsRoot").textContent = "No pudimos cargar los ajustes de la tienda. Recarga la página para volver a intentar.";
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

  function renderInventoryAiWarnings(warnings = []) {
    const visibleWarnings = Array.isArray(warnings) ? warnings.filter(Boolean).slice(0, 30) : [];
    inventoryAiWarningsEl.replaceChildren(...visibleWarnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }));
    inventoryAiWarningsEl.hidden = visibleWarnings.length === 0;
  }

  function renderInventoryReview() {
    const invalidCount = preparedInventoryRows.filter((row) => row.errors.length).length;
    const categoryCount = new Set(preparedInventoryRows.map((row) => row.product.categoryName).filter(Boolean).map((name) => name.toLocaleLowerCase("es"))).size;
    const preparedStore = lastStores.find((store) => store.id === preparedInventoryStoreId);
    const belongsToCurrentStore = !!preparedInventoryStoreId && preparedInventoryStoreId === currentStoreId;
    inventoryReviewEl.hidden = preparedInventoryRows.length === 0;
    const skuCount = preparedInventoryRows.filter((row) => row.product.codigoProducto).length;
    const connectionLabel = inventoryConnectionEl.selectedOptions[0]?.textContent || "sin conexión";
    inventoryReviewSummaryEl.innerHTML = `<strong>${preparedInventoryRows.length} productos</strong> · destino: <strong>${esc(preparedStore?.name || "tienda seleccionada")}</strong> · ${skuCount} con SKU · ${inventoryConnectionEl.value ? `conectar a <strong>${esc(connectionLabel)}</strong>` : "guardar sin conexión"} · ${categoryCount} categorías · ${invalidCount ? `${invalidCount} filas por corregir` : "listos para importar"}`;
    inventoryCommitEl.disabled = preparedInventoryRows.length === 0 || invalidCount > 0 || !belongsToCurrentStore || inventoryImportInProgress;
    inventoryReviewRowsEl.innerHTML = preparedInventoryRows.map((row) => {
      const amounts = row.product.variants.length ? row.product.variants.map((variant) => variant.amount) : [row.product.amount];
      const price = Math.min(...amounts) === Math.max(...amounts)
        ? money(amounts[0])
        : `${money(Math.min(...amounts))} – ${money(Math.max(...amounts))}`;
      return `<tr>
        <td>${row.rowNumber}</td>
        <td><strong>${esc(row.product.name || "Sin nombre")}</strong></td>
        <td><code>${esc(row.product.codigoProducto || "—")}</code></td>
        <td>${esc(row.product.categoryName || "Sin categoría")}</td>
        <td>${price}</td>
        <td>${row.product.variants.length ? row.product.variants.map((variant) => esc(variant.name)).join(", ") : "—"}</td>
        <td class="inventory-photo-count">${row.imageFiles.length}</td>
        <td>${row.errors.length ? `<span class="inventory-row-error">${row.errors.map(esc).join("<br>")}</span>` : '<span class="inventory-row-ready">Lista</span>'}</td>
      </tr>`;
    }).join("");
  }

  function resetInventoryImportState(status = "Aún no hay un archivo preparado.") {
    inventoryImportVersion++;
    preparedInventoryRows = [];
    preparedInventoryStoreId = null;
    inventoryCsvInputEl.value = "";
    inventoryImagesInputEl.value = "";
    updateInventoryFileSummary();
    renderInventoryAiWarnings();
    inventoryImportStatusEl.textContent = status;
    renderInventoryReview();
  }

  async function loadInventoryConnections({ force = false } = {}) {
    if (!currentStoreId) {
      inventoryConnectionEl.innerHTML = '<option value="">Crea o selecciona una tienda primero</option>';
      inventoryConnectionEl.disabled = true;
      return [];
    }
    if (!force && inventoryConnectionEl.dataset.storeId === currentStoreId) return [];
    const selected = inventoryConnectionEl.value;
    inventoryConnectionEl.disabled = true;
    inventoryConnectionEl.innerHTML = '<option value="">Cargando conexiones…</option>';
    try {
      const connections = await api(`/stores/${currentStoreId}/operations/integrations`);
      inventoryConnectionEl.innerHTML = '<option value="">Guardar SKU sin conectar todavía</option>' +
        connections.map((connection) => `<option value="${esc(connection.id)}">${esc(connection.name)} · ${esc(inventoryConnectionKindLabel(connection.kind))}</option>`).join("");
      inventoryConnectionEl.dataset.storeId = currentStoreId;
      inventoryConnectionEl.disabled = false;
      if (connections.some((connection) => connection.id === selected)) inventoryConnectionEl.value = selected;
      renderInventoryReview();
      return connections;
    } catch (error) {
      inventoryConnectionEl.innerHTML = '<option value="">No se pudieron cargar las conexiones</option>';
      inventoryConnectionEl.disabled = false;
      inventoryImportStatusEl.textContent = `Puedes importar sin conexión. ${error.message}`;
      return [];
    }
  }

  inventoryConnectionEl.addEventListener("focus", () => loadInventoryConnections().catch(() => undefined));
  inventoryConnectionEl.addEventListener("change", renderInventoryReview);

  function inventoryConnectionKindLabel(kind) {
    return ({
      CUSTOM_DATABASE: "base propia",
      SHOPIFY: "Shopify",
      WOOCOMMERCE: "WooCommerce",
      POS: "otro POS",
      ACCOUNTING: "contabilidad",
      OTHER: "otro sistema",
    })[kind] || String(kind || "conexión").replaceAll("_", " ").toLowerCase();
  }

  async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function takeNext() {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, takeNext));
    return results;
  }

  function updateInventoryFileSummary() {
    const csv = inventoryCsvInputEl.files[0];
    const imageCount = inventoryImagesInputEl.files.length;
    if (!csv && imageCount === 0) {
      inventoryFileSummaryEl.textContent = "Ningún archivo seleccionado.";
      return;
    }
    inventoryFileSummaryEl.innerHTML = [
      csv ? `<strong>${esc(csv.name)}</strong>` : "Falta el CSV",
      imageCount ? `${imageCount} ${imageCount === 1 ? "foto seleccionada" : "fotos seleccionadas"}` : "sin fotos",
    ].join(" · ");
  }

  function replaceInventoryInputFiles(input, files) {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  }

  function acceptDroppedInventoryFiles(files) {
    const dropped = [...files];
    const csvFiles = dropped.filter((file) => /\.(csv|tsv)$/i.test(file.name) || ["text/csv", "text/tab-separated-values"].includes(file.type));
    const imageFiles = dropped.filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type));
    if (csvFiles.length) replaceInventoryInputFiles(inventoryCsvInputEl, [csvFiles[0]]);
    if (imageFiles.length) {
      const combined = [...inventoryImagesInputEl.files, ...imageFiles];
      const unique = [...new Map(combined.map((file) => [`${file.name.toLocaleLowerCase("es")}:${file.size}:${file.lastModified}`, file])).values()];
      replaceInventoryInputFiles(inventoryImagesInputEl, unique);
    }
    const unsupported = dropped.length - csvFiles.length - imageFiles.length;
    inventoryImportStatusEl.textContent = unsupported
      ? `${unsupported} ${unsupported === 1 ? "archivo no compatible fue ignorado" : "archivos no compatibles fueron ignorados"}. Usa CSV, TSV, PNG, JPG o WebP.`
      : csvFiles.length || imageFiles.length
        ? "Archivos listos. Presiona “Adaptar y revisar con IA”."
        : "No encontramos un CSV ni fotos compatibles en lo que soltaste.";
    updateInventoryFileSummary();
  }

  ["dragenter", "dragover"].forEach((eventName) => inventoryDropzoneEl.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    inventoryDropzoneEl.classList.add("is-dragging");
  }));
  ["dragleave", "dragend"].forEach((eventName) => inventoryDropzoneEl.addEventListener(eventName, () => {
    inventoryDropzoneEl.classList.remove("is-dragging");
  }));
  inventoryDropzoneEl.addEventListener("drop", (event) => {
    event.preventDefault();
    inventoryDropzoneEl.classList.remove("is-dragging");
    acceptDroppedInventoryFiles(event.dataTransfer?.files || []);
  });
  inventoryDropzoneEl.addEventListener("keydown", (event) => {
    if (event.target !== inventoryDropzoneEl || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    inventoryCsvInputEl.click();
  });
  inventoryCsvInputEl.addEventListener("change", updateInventoryFileSummary);
  inventoryImagesInputEl.addEventListener("change", updateInventoryFileSummary);

  async function readInventoryCsvFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  function downloadInventoryTemplate(advanced = false) {
    const template = advanced
      ? [
          "sku;nombre;precio;categoria;stock;descripcion;etiquetas;imagenes;opciones;color",
          "COM-001;Silpancho;45,50;Comida;12;Plato completo;Popular|Almuerzo;silpancho.webp;;#c2410c",
          "BEB-001;Limonada;;Bebidas;;Preparada al momento;Fría;limonada.jpg;Vaso:12:20|Jarra:30:8;#15803d",
        ].join("\r\n")
      : [
          "sku;nombre;precio;categoria;stock;descripcion;imagenes",
          "COM-001;Silpancho;45,50;Comida;12;Plato completo;silpancho.webp",
          "BEB-001;Limonada;12,50;Bebidas;;Preparada al momento;limonada.jpg",
        ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + template], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = advanced ? "plantilla-productos-pagosya-completa.csv" : "plantilla-productos-pagosya.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById("inventoryTemplateDownload").addEventListener("click", () => downloadInventoryTemplate());
  document.getElementById("inventoryTemplateAdvancedDownload").addEventListener("click", () => downloadInventoryTemplate(true));

  document.getElementById("inventoryPrepare").addEventListener("click", async () => {
    const prepareButton = document.getElementById("inventoryPrepare");
    const csvFile = inventoryCsvInputEl.files[0];
    if (!csvFile) {
      inventoryImportStatusEl.textContent = "Selecciona primero un archivo CSV.";
      inventoryCsvInputEl.focus();
      return;
    }
    if (!currentStoreId) {
      inventoryImportStatusEl.textContent = "Selecciona una tienda antes de revisar el CSV.";
      return;
    }
    const targetStoreId = currentStoreId;
    const prepareVersion = ++inventoryImportVersion;
    if (inventoryConnectionEl.dataset.storeId !== targetStoreId) await loadInventoryConnections();
    prepareButton.disabled = true;
    prepareButton.textContent = "Adaptando inventario…";
    inventoryImportStatusEl.textContent = "La IA está interpretando columnas, precios y stock…";
    renderInventoryAiWarnings();
    try {
      const normalized = await api(`/stores/${targetStoreId}/payment_links/import/normalize`, {
        method: "POST",
        body: JSON.stringify({
          csv: await readInventoryCsvFile(csvFile),
          imageFileNames: [...inventoryImagesInputEl.files].map((file) => file.name),
        }),
      });
      const prepared = prepareAiInventoryRows(normalized?.products, [...inventoryImagesInputEl.files]);
      if (prepareVersion !== inventoryImportVersion || targetStoreId !== currentStoreId) return;
      preparedInventoryRows = prepared.rows;
      preparedInventoryStoreId = targetStoreId;
      renderInventoryAiWarnings([...(normalized?.warnings || []), ...prepared.warnings]);
      renderInventoryReview();
      const invalidCount = preparedInventoryRows.filter((row) => row.errors.length).length;
      inventoryImportStatusEl.textContent = invalidCount
        ? `Revisa ${invalidCount} ${invalidCount === 1 ? "fila marcada" : "filas marcadas"}.`
        : "Archivo adaptado por IA y listo para revisar.";
    } catch (err) {
      if (prepareVersion !== inventoryImportVersion || targetStoreId !== currentStoreId) return;
      preparedInventoryRows = [];
      preparedInventoryStoreId = null;
      renderInventoryReview();
      inventoryImportStatusEl.textContent = err.networkFailure
        ? `${err.message} El CSV y las fotos siguen seleccionados.`
        : err.message;
    } finally {
      if (prepareVersion === inventoryImportVersion) {
        prepareButton.disabled = false;
        prepareButton.textContent = "Adaptar y revisar con IA";
      }
    }
  });

  inventoryCommitEl.addEventListener("click", async () => {
    if (
      inventoryImportInProgress ||
      !currentStoreId ||
      preparedInventoryStoreId !== currentStoreId ||
      preparedInventoryRows.length === 0 ||
      preparedInventoryRows.some((row) => row.errors.length)
    ) return;
    errorEl.textContent = "";
    infoEl.textContent = "";
    const importStoreId = currentStoreId;
    const importVersion = inventoryImportVersion;
    const rowsToImport = preparedInventoryRows;
    inventoryImportInProgress = true;
    inventoryCommitEl.disabled = true;
    let importCommitted = false;
    const uniqueFiles = [...new Map(rowsToImport.flatMap((row) => row.imageFiles).map((file) => [file.name.toLocaleLowerCase("es"), file])).values()];
    const importStillVisible = () => importVersion === inventoryImportVersion && importStoreId === currentStoreId;
    try {
      let uploadedCount = 0;
      const uploadedUrls = await runWithConcurrency(uniqueFiles, 3, async (file) => {
        const url = await uploadFile(file);
        uploadedCount++;
        if (importStillVisible()) inventoryImportStatusEl.textContent = `Subiendo fotos ${uploadedCount} de ${uniqueFiles.length}…`;
        return [file.name.toLocaleLowerCase("es"), url];
      });
      const urlByFilename = new Map(uploadedUrls);
      if (importStillVisible()) inventoryImportStatusEl.textContent = "Creando productos y categorías…";
      const products = rowsToImport.map((row) => ({
        ...row.product,
        imageUrls: row.imageFiles.map((file) => urlByFilename.get(file.name.toLocaleLowerCase("es"))).filter(Boolean),
      }));
      const result = await api(`/stores/${importStoreId}/payment_links/import`, {
        method: "POST",
        body: JSON.stringify({
          products,
          ...(inventoryConnectionEl.value && { integrationConnectionId: inventoryConnectionEl.value }),
        }),
      });
      importCommitted = true;
      if (importStillVisible()) {
        const importedProducts = Array.isArray(result?.products) ? result.products : [];
        const categoriesCreated = Array.isArray(result?.categoriesCreated) ? result.categoriesCreated : [];
        // Once the API confirms the transaction, the import succeeded. Mark it
        // complete before refreshing local views so a rendering problem cannot
        // be reported as a failed import (and tempt the merchant to retry it).
        resetInventoryImportState("Importación completada.");
        const mappingsCreated = Number(result?.mappingsCreated || 0);
        infoEl.textContent = `${importedProducts.length} ${importedProducts.length === 1 ? "producto importado" : "productos importados"}${categoriesCreated.length ? ` y ${categoriesCreated.length} categorías nuevas` : ""}${mappingsCreated ? `; ${mappingsCreated} SKU ${mappingsCreated === 1 ? "conectado" : "conectados"}` : ""}.`;
        try {
          resetPaymentLinkBrowseState();
          lastCategories = [...lastCategories, ...categoriesCreated];
          renderPaymentLinkRows([...importedProducts, ...lastPaymentLinks]);
        } catch (renderError) {
          console.error("La importación terminó, pero el catálogo no se pudo actualizar en pantalla.", renderError);
          infoEl.textContent += " Actualiza la página para ver el catálogo completo.";
        }
      }
      refreshFinancesInBackground();
    } catch (err) {
      if (importStillVisible()) {
        if (importCommitted) {
          inventoryImportStatusEl.textContent = "Importación completada.";
          infoEl.textContent = "Los productos se importaron. Actualiza la página para ver el catálogo completo.";
        } else {
          errorEl.textContent = "Error importando el inventario: " + err.message;
          inventoryImportStatusEl.textContent = "La importación no se completó. Corrige el problema e intenta otra vez.";
        }
      }
    } finally {
      inventoryImportInProgress = false;
      renderInventoryReview();
    }
  });

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
      ]);
      const stores = await api("/stores");
      if (refreshVersion !== dashboardRefreshVersion) {
        await overviewPromise.catch(() => undefined);
        return;
      }

      showLoggedIn();
      appEl.style.display = "block";
      renderStoreRows(stores);

      const selectedStoreId = currentStoreId;
      const storeQuery = selectedStoreId ? `?storeId=${encodeURIComponent(selectedStoreId)}` : "";
      const [[balance, kyc, invoicing, payouts, totalFinances, international, terms, limits], payments, finances, categories, paymentLinks, promoCodes, debtCollectionLinks, customDomains] = await Promise.all([
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
      document.getElementById("storeSettingsScopeLabel").textContent = selectedStore?.name || "Sin tienda seleccionada";
      storeSettings?.setStore(selectedStore, paymentLinks);

      renderTotalFinances(totalFinances);
      renderFinances(finances);

      lastCategories = categories;
      renderPaymentLinkRows(paymentLinks);
      renderPromoCodes(promoCodes);
      renderDebtCollectionLinks(debtCollectionLinks);
      updateSelectedStoreDomains(customDomains);

      lastPayments = payments;
      paymentPage = 1;
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

  document.getElementById("internationalPaymentsCard").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-intl-request]");
    if (!button) return;
    errorEl.textContent = "";
    setButtonBusy(button, true, button.textContent);
    try {
      await api("/merchants/international_payments/request", { method: "POST" });
      await refresh();
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
      setButtonBusy(button, false, button.textContent);
    }
  });

  // pagosYa's own terms (ASFI): the version in force must be accepted before KYC
  // and payouts; an announced next version is shown early but blocks nothing.
  const bobFmt = (centavos) => `Bs ${(centavos / 100).toLocaleString("es-BO", { maximumFractionDigits: 0 })}`;

  // ASFI afiliación: level, monthly usage and the path to the next level.
  function renderLevel(limits) {
    const card = document.getElementById("levelCard");
    card.hidden = !limits;
    if (!limits) return;
    document.getElementById("levelName").textContent = `Nivel ${limits.level} · ${limits.levelName}`;
    document.getElementById("levelUsage").textContent = limits.monthlyLimit
      ? `${bobFmt(limits.used)} de ${bobFmt(limits.monthlyLimit)} este mes`
      : "Aún no puedes cobrar en vivo. Verifícate para empezar.";
    document.getElementById("levelPerPayment").textContent = limits.perPaymentLimit ? `Máximo por pago: ${bobFmt(limits.perPaymentLimit)}` : "";
    document.getElementById("levelResets").textContent = limits.monthlyLimit
      ? `· Se reinicia el ${new Date(limits.resetsAt).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" })}`
      : "";
    const banner = document.getElementById("limitBanner");
    const ratio = limits.monthlyLimit ? limits.used / limits.monthlyLimit : 0;
    banner.hidden = ratio < 0.8;
    banner.dataset.state = ratio >= 1 ? "blocked" : "warn";
    banner.textContent = ratio >= 1
      ? "Llegaste a tu límite mensual: los cobros en vivo están pausados hasta el inicio del próximo mes o hasta que subas de nivel."
      : "Ya usaste el 80% de tu límite mensual. Sube de nivel para seguir cobrando sin pausas.";
    document.getElementById("levelUpgradeButton").hidden = limits.level >= 2;
    document.getElementById("level3RequestButton").hidden = limits.level !== 2;
    const select = document.getElementById("kycTargetLevel");
    select.querySelector('option[value="1"]').disabled = limits.level >= 1;
    select.value = limits.level >= 1 ? "2" : "1";
    syncKycLevelFields();
  }

  function syncKycLevelFields() {
    const business = document.getElementById("kycTargetLevel").value === "2";
    document.getElementById("kycBusinessFields").hidden = !business;
    document.getElementById("kycNameLabel").textContent = business ? "Razón social" : "Nombre completo";
    for (const name of ["taxId", "legalRepName"]) document.querySelector(`#kycForm [name=${name}]`).required = business;
  }
  document.getElementById("kycTargetLevel").addEventListener("change", syncKycLevelFields);
  document.getElementById("levelUpgradeButton").addEventListener("click", () => document.getElementById("kycForm").scrollIntoView({ behavior: "smooth" }));
  document.getElementById("level3RequestButton").addEventListener("click", async () => {
    errorEl.textContent = "";
    try {
      await api("/dashboard/limits/level3_request", { method: "POST" });
      infoEl.textContent = "Recibimos tu solicitud. El equipo de pagosYa te escribirá para pedir los documentos de tu empresa.";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  async function uploadKycPhoto(input) {
    const file = input.files?.[0];
    if (!file) return undefined;
    const form = new FormData();
    form.append("slot", input.dataset.slot);
    form.append("file", file);
    const doc = await api("/merchants/kyc/documents", { method: "POST", body: form });
    return doc.id;
  }

  function renderTermsPrompt(terms) {
    const prompt = document.getElementById("termsPrompt");
    const target = terms?.needsAcceptance
      ? terms.current
      : terms?.upcoming && terms.acceptedVersion !== terms.upcoming.version ? terms.upcoming : null;
    prompt.hidden = !target;
    document.querySelector("#kycForm button[type=submit]").disabled = Boolean(terms?.needsAcceptance);
    if (!target) return;
    const effectiveAt = new Date(target.effectiveAt);
    document.getElementById("termsPromptTitle").textContent = target.title;
    document.getElementById("termsPromptWhen").textContent = effectiveAt > new Date()
      ? `(vigente desde el ${effectiveAt.toLocaleDateString("es-BO")})`
      : "";
    document.getElementById("termsPromptLink").href = `https://pagosya.bo/terminos/comercios?version=${encodeURIComponent(target.version)}`;
    document.getElementById("termsAcceptButton").dataset.version = target.version;
  }

  document.getElementById("termsAcceptButton").addEventListener("click", async (e) => {
    const button = e.currentTarget;
    errorEl.textContent = "";
    infoEl.textContent = "";
    button.disabled = true;
    try {
      const status = await api("/dashboard/terms/accept", { method: "POST", body: JSON.stringify({ version: button.dataset.version }) });
      renderTermsPrompt(status);
      infoEl.textContent = "Registramos tu aceptación de los Términos y Condiciones.";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("kycForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    infoEl.textContent = "";
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const [ciFrontDocId, ciBackDocId, selfieDocId] = await Promise.all(
        ["kycDocFront", "kycDocBack", "kycDocSelfie"].map((id) => uploadKycPhoto(document.getElementById(id))),
      );
      const payload = { ...data, targetLevel: Number(data.targetLevel), ciFrontDocId, ciBackDocId, selfieDocId };
      for (const key of Object.keys(payload)) if (payload[key] === "" || payload[key] === undefined) delete payload[key];
      await api("/merchants/kyc", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
      infoEl.textContent = "Verificación enviada — te avisaremos cuando sea revisada.";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("invoicingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    infoEl.textContent = "";
    const data = Object.fromEntries(new FormData(e.target));
    data.sucursal = Number(data.sucursal) || 0;
    data.puntoVenta = Number(data.puntoVenta) || 0;
    try {
      await api("/merchants/invoicing_profile", { method: "POST", body: JSON.stringify(data) });
      await refresh();
      infoEl.textContent = "Perfil de facturación guardado.";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
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
