// Merchant dashboard behavior. The current website editor is mounted in Studio.
import { ANIMATIONS, mountBlob } from "@pagosya/blob-characters";
import { ADVENTURE_LEVELS, companionBlobHtml, companionBlobUri, companionSeed } from "/src/companions.mjs";
import { normalizeVariation, profileBlobHtml, profileBlobUri, randomVariation, variationChoices } from "/src/profile-blob.mjs";
import { escapeHtml as esc } from "/src/html.mjs";
import { countsLine, importStep, parseExchangeRate, progressLabel, summaryLines } from "/src/store-import.mjs";
import { mountRewardsPanel } from "/src/rewards-panel.mjs";
import { mountCobrosPanel } from "/src/cobros-panel.mjs";
import { mountGrowthPanel } from "/src/growth-panel.mjs";
import { mountProposalsPanel } from "/src/proposals-panel.mjs";
import { mountContractsPanel } from "/src/contracts-panel.mjs";

  (() => {
  // The dashboard ships a single light theme; drop any preference left by the old switcher.
  try { localStorage.removeItem("pagosya_dashboard_theme"); } catch { /* storage unavailable */ }

  // Keep XP current while the merchant leaves the dashboard open. A newly
  // completed sale can therefore unlock and announce its companion in-session.
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
  const profileAvatarOptionsEl = document.getElementById("profileAvatarOptions");
  const accountAvatarEl = document.getElementById("accountAvatar");
  const sessionProfileAvatarsEl = document.getElementById("sessionProfileAvatars");
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
  const PROFILE_AVATAR_STORAGE_PREFIX = "pagosya_merchant_avatar:";
  // B1: the API's one-way blob seed, cached per email so the picture paints at once on the next load.
  const PROFILE_BLOB_SEED_STORAGE_PREFIX = "pagosya_merchant_blob_seed:";
  let currentBlobSeed = "";
  let profileVariationChoices = [];
  let loginVariationChoices = [];
  let editingVariationChoices = [];
  let selectedProfileAvatar = 1;
  let currentProfileName = "";
  let selectedLoginAvatar = 1;
  let lastProfileSessionsPayload = null;
  let editingProfileSessionId = null;
  let pendingLoginSessionId = null;
  let resolveProfileSelection = null;


  function profileAvatarStorageKey() {
    return PROFILE_AVATAR_STORAGE_PREFIX + String(emailEl.value || "default").trim().toLocaleLowerCase("es");
  }

  function readProfileAvatar() {
    try {
      return normalizeVariation(localStorage.getItem(profileAvatarStorageKey()));
    } catch {
      return 1;
    }
  }

  function blobSeedStorageKey() {
    return PROFILE_BLOB_SEED_STORAGE_PREFIX + String(emailEl.value || "default").trim().toLocaleLowerCase("es");
  }

  function readBlobSeed() {
    try { return localStorage.getItem(blobSeedStorageKey()) || ""; } catch { return ""; }
  }

  /** Takes the blob seed from a /dashboard/sessions answer; an answer without one changes nothing. */
  function rememberBlobSeed(seed) {
    if (typeof seed !== "string" || !seed || seed === currentBlobSeed) return;
    currentBlobSeed = seed;
    try { localStorage.setItem(blobSeedStorageKey(), seed); } catch {}
    renderProfileAvatar();
    setLoginAvatar(selectedLoginAvatar);
    // Only the runner token's image, never the whole board: renderBoard() can briefly show "No pudimos
    // cargar el tablero." when sessions arrive before rewards has loaded, and this fires before that.
    rewards.refreshRunner();
  }

  function profileNameFromEmail(email) {
    const localPart = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
    if (!localPart) return "Mi perfil";
    return localPart.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
  }

  /**
   * Renders a row of variation-option buttons by updating existing <button> elements in place rather
   * than rebuilding them with `innerHTML`, so a re-render while one of them holds keyboard focus (a
   * save in flight, a menu refresh under a focused user) never drops focus to <body>.
   */
  function renderVariationOptionButtons(container, className, dataAttr, variations, selected) {
    const buttons = Array.from(container.children);
    while (buttons.length < variations.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      container.appendChild(button);
      buttons.push(button);
    }
    while (buttons.length > variations.length) buttons.pop().remove();
    variations.forEach((variation, index) => {
      const button = buttons[index];
      button.dataset[dataAttr] = String(variation);
      button.setAttribute("aria-label", `Variación ${variation}`);
      button.setAttribute("aria-pressed", String(variation === selected));
      button.innerHTML = profileBlobHtml({ blobSeed: currentBlobSeed, variation, decorative: true });
    });
  }

  function renderProfileAvatar() {
    const name = currentProfileName || profileNameFromEmail(emailEl.value);
    // The trigger button carries its own label, so its blob is decorative; the menu head is the named picture.
    profileTriggerAvatarEl.innerHTML = profileBlobHtml({ blobSeed: currentBlobSeed, variation: selectedProfileAvatar, decorative: true });
    profileMenuAvatarEl.innerHTML = profileBlobHtml({ blobSeed: currentBlobSeed, variation: selectedProfileAvatar, name });
    if (!profileVariationChoices.includes(selectedProfileAvatar)) profileVariationChoices = variationChoices(selectedProfileAvatar);
    renderVariationOptionButtons(profileAvatarOptionsEl, "profile-avatar-option", "profileAvatar", profileVariationChoices, selectedProfileAvatar);
    // The account page has its own heading naming the person, so its picture stays decorative here too.
    if (accountAvatarEl) accountAvatarEl.innerHTML = profileBlobHtml({ blobSeed: currentBlobSeed, variation: selectedProfileAvatar, decorative: true });
  }

  function setLoginAvatar(avatarId) {
    selectedLoginAvatar = normalizeVariation(avatarId);
    if (!loginVariationChoices.includes(selectedLoginAvatar)) loginVariationChoices = variationChoices(selectedLoginAvatar);
    renderVariationOptionButtons(sessionProfileAvatarsEl, "session-profile-avatar-option", "loginAvatar", loginVariationChoices, selectedLoginAvatar);
  }

  function applyProfileIdentity() {
    const email = emailEl.value || "tu cuenta del panel";
    selectedProfileAvatar = readProfileAvatar();
    currentBlobSeed = readBlobSeed();
    profileDisplayNameEl.textContent = currentProfileName || profileNameFromEmail(email);
    loggedInAsEl.textContent = email;
    profileMenuTriggerEl.setAttribute("aria-label", `Abrir perfil de ${email}`);
    renderProfileAvatar();
  }

  function applyCurrentSessionIdentity(session) {
    if (!session) return;
    selectedProfileAvatar = normalizeVariation(session.profileAvatarId);
    currentProfileName = session.profileName || profileNameFromEmail(emailEl.value);
    profileDisplayNameEl.textContent = currentProfileName;
    try { localStorage.setItem(profileAvatarStorageKey(), String(selectedProfileAvatar)); } catch {}
    renderProfileAvatar();
  }

  // Guards selectProfileVariation against overlapping requests: while a save is in flight, the
  // option buttons and the shuffle button are marked aria-disabled (the click handlers below re-check
  // this flag, which is what actually blocks a second call — native `disabled` would do that too, but
  // it also blurs a focused element to <body> immediately, so aria-disabled is used instead).
  let profileVariationSaveInFlight = false;

  function setProfileAvatarControlsBusy(busy) {
    profileAvatarOptionsEl.querySelectorAll("[data-profile-avatar]").forEach((button) => button.setAttribute("aria-disabled", String(busy)));
    const shuffleButton = document.getElementById("profileAvatarShuffle");
    if (shuffleButton) shuffleButton.setAttribute("aria-disabled", String(busy));
  }

  async function selectProfileVariation(variation) {
    if (profileVariationSaveInFlight) return;
    const previousAvatar = selectedProfileAvatar;
    selectedProfileAvatar = normalizeVariation(variation);
    try { localStorage.setItem(profileAvatarStorageKey(), String(selectedProfileAvatar)); } catch {}
    renderProfileAvatar();
    rewards.refreshRunner();
    const currentSession = lastProfileSessionsPayload?.sessions?.find((session) => session.current);
    if (!currentSession) return;
    profileVariationSaveInFlight = true;
    setProfileAvatarControlsBusy(true);
    try {
      await updateProfileSession(currentSession.id, currentSession.profileName, selectedProfileAvatar);
    } catch (error) {
      selectedProfileAvatar = previousAvatar;
      try { localStorage.setItem(profileAvatarStorageKey(), String(previousAvatar)); } catch {}
      renderProfileAvatar();
      rewards.refreshRunner();
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos guardar el avatar. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
      profileVariationSaveInFlight = false;
      setProfileAvatarControlsBusy(false);
      return;
    }
    // The save already succeeded; a refresh that fails afterwards keeps the new variation and shows no error
    // (calling loadProfileSessions here would overwrite the menu with its own "couldn't load" message).
    try {
      const payload = await api("/dashboard/sessions");
      renderProfileSessions(payload);
    } catch { /* save succeeded; nothing to roll back */ }
    profileVariationSaveInFlight = false;
    setProfileAvatarControlsBusy(false);
  }
  profileAvatarOptionsEl.addEventListener("click", (event) => {
    if (profileVariationSaveInFlight) return;
    const button = event.target.closest("[data-profile-avatar]");
    if (button) void selectProfileVariation(Number(button.dataset.profileAvatar));
  });
  // "Otra variación": a fresh blob, saved at once, with three new alternatives beside it.
  document.getElementById("profileAvatarShuffle").addEventListener("click", () => {
    if (profileVariationSaveInFlight) return;
    const next = randomVariation(profileVariationChoices);
    profileVariationChoices = variationChoices(next);
    void selectProfileVariation(next);
  });
  sessionProfileAvatarsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-login-avatar]");
    if (button) setLoginAvatar(Number(button.dataset.loginAvatar));
  });
  document.getElementById("sessionProfileAvatarShuffle").addEventListener("click", () => {
    const next = randomVariation(loginVariationChoices);
    loginVariationChoices = variationChoices(next);
    setLoginAvatar(next);
  });
  renderProfileAvatar();
  setLoginAvatar(1);

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
    rememberBlobSeed(payload?.blobSeed);
    profileSessionCountEl.textContent = `${active} / ${limit}`;
    if (!sessions.length) {
      profileSessionsEl.innerHTML = '<p class="profile-session-state">No se encontraron sesiones activas.</p>';
      requestAnimationFrame(positionProfileMenu);
      return;
    }
    applyCurrentSessionIdentity(sessions.find((session) => session.current));
    profileSessionsEl.innerHTML = sessions.map((session) => `<div class="profile-session-row">
      <div class="profile-session-person">
        <span class="profile-session-avatar" aria-hidden="true">${profileBlobHtml({ blobSeed: currentBlobSeed, variation: session.profileAvatarId, decorative: true })}</span>
        <div class="profile-session-copy"><strong>${esc(session.profileName || "Sin nombre")}</strong><small>Inicio: ${esc(formatSessionDate(session.createdAt))}${session.isPrimary ? " · Principal" : ""}</small></div>
      </div>
      <div class="profile-session-actions">
        ${session.current ? '<span class="profile-session-current">Esta sesión</span>' : ""}
        ${(session.current || payload.canManageSessions) ? `<button class="profile-session-action" type="button" data-edit-session="${esc(session.id)}" aria-label="Cambiar nombre de ${esc(session.profileName || "esta sesión")}" title="Cambiar nombre y avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>` : ""}
        ${!session.current && payload.canManageSessions ? `<button class="profile-session-action" type="button" data-revoke-session="${esc(session.id)}" aria-label="Cerrar la sesión de ${esc(session.profileName || "este perfil")}" title="Cerrar esta sesión"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
      </div>
      ${editingProfileSessionId === session.id ? `<form class="profile-session-edit-form" data-session-edit-form="${esc(session.id)}" data-avatar-id="${normalizeVariation(session.profileAvatarId)}">
        <label>Nombre del perfil<input name="profileName" value="${esc(session.profileName || "")}" maxlength="32" autocomplete="off" required></label>
        <div class="profile-session-edit-avatars" role="group" aria-label="Avatar del perfil">${editingVariationChoices.map((variation) => `<button class="profile-session-edit-avatar" type="button" data-edit-avatar="${variation}" aria-label="Variación ${variation}" aria-pressed="${variation === normalizeVariation(session.profileAvatarId)}">${profileBlobHtml({ blobSeed: currentBlobSeed, variation, decorative: true })}</button>`).join("")}</div>
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
    rememberBlobSeed(payload?.blobSeed);
    const seen = new Set();
    const choices = (payload?.profiles?.length ? payload.profiles : payload?.sessions || []).filter((session) => {
      const name = String(session.profileName || "").trim();
      if (!name || name === "Seleccionar perfil") return false;
      const key = `${name.toLocaleLowerCase("es")}:${session.profileAvatarId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    sessionProfileExistingEl.hidden = choices.length === 0;
    sessionProfileChoicesEl.innerHTML = choices.map((session) => `<button class="session-profile-choice" type="button" data-profile-choice-name="${esc(session.profileName)}" data-profile-choice-avatar="${normalizeVariation(session.profileAvatarId)}" aria-pressed="false">
      <span class="session-profile-choice-avatar" aria-hidden="true">${profileBlobHtml({ blobSeed: currentBlobSeed, variation: session.profileAvatarId, decorative: true })}</span><span>${esc(session.profileName)}</span>
    </button>`).join("");

    const isUnassigned = !currentSession?.profileName || currentSession.profileName === "Seleccionar perfil";
    sessionProfileNameEl.value = isUnassigned ? "" : currentSession.isPrimary ? profileNameFromEmail(emailEl.value) : currentSession.profileName;
    setLoginAvatar(currentSession?.profileAvatarId);
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
    setLoginAvatar(Number(choice.dataset.profileChoiceAvatar));
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
      await updateProfileSession(pendingLoginSessionId, profileName, selectedLoginAvatar);
      selectedProfileAvatar = selectedLoginAvatar;
      try { localStorage.setItem(profileAvatarStorageKey(), String(selectedProfileAvatar)); } catch {}
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
      const editing = lastProfileSessionsPayload?.sessions?.find((session) => session.id === editingProfileSessionId);
      editingVariationChoices = variationChoices(editing?.profileAvatarId);
      renderProfileSessions(lastProfileSessionsPayload);
      profileSessionsEl.querySelector(`[data-session-edit-form="${CSS.escape(editingProfileSessionId)}"] input`)?.focus();
      return;
    }
    if (event.target.closest("[data-cancel-session-edit]")) {
      editingProfileSessionId = null;
      renderProfileSessions(lastProfileSessionsPayload);
      return;
    }
    const avatarButton = event.target.closest("[data-edit-avatar]");
    if (avatarButton) {
      const form = avatarButton.closest("[data-session-edit-form]");
      form.dataset.avatarId = avatarButton.dataset.editAvatar;
      form.querySelectorAll("[data-edit-avatar]").forEach((button) => button.setAttribute("aria-pressed", String(button === avatarButton)));
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
  const rewards = mountRewardsPanel({
    api,
    storeId: () => currentStoreId,
    signedIn: () => !!sessionToken,
    currentXp: () => (lastFinances ? gamificationState(lastFinances).xp : 0),
    // The dice-board runner is the merchant's own blob; the level's companion stands in until the API sends the seed.
    runnerImage: () => (currentBlobSeed
      ? profileBlobUri(currentBlobSeed, selectedProfileAvatar)
      : companionBlobUri(ADVENTURE_LEVELS[selectedGamificationCompanion(lastFinances ? gamificationState(lastFinances).levelIndex : 0)])),
    celebrateCompanion: () => { if (heroBlob) void heroBlob.play(ANIMATIONS.cheer); },
    rerender: (announce) => { if (lastFinances) renderGamification(lastFinances, { announce }); },
    burstConfetti,
    playTouchSound: playAdventureTouchSound,
    audioContext: adventureAudio,
  });
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
  let luckWheelModalShownThisLoad = false;
  let lastTotalFinances = null;
  let lastBalances = null;
  const GAMIFICATION_XP_PER_SALE = 50;
  const GAMIFICATION_XP_PER_VISIT = 2;

  window.ADVENTURE_LEVELS = ADVENTURE_LEVELS;
  // World rewards use only signals the application already owns. Benefits that
  // require billing or promotion infrastructure are deliberately not implied.
  const ADVENTURE_REWARDS = [
    { id: "first-view", title: "Primera mirada", icon: "✦", requirement: { kind: "visits", threshold: 1 }, requirementCopy: "Recibe 1 visita", description: "Tu escaparate empezó a viajar: ganaste la insignia Mirada." },
    { id: "first-sale", title: "Primera venta", icon: "◆", requirement: { kind: "sales", threshold: 1 }, requirementCopy: "Completa 1 venta", description: "La primera compra exitosa enciende una celebración especial." },
    { id: "two-days", title: "2 días con estrella", icon: "2", requirement: { kind: "dailyLoginStars", threshold: 2 }, requirementCopy: "Vuelve 2 días", description: "Dos visitas diarias a tu panel desbloquean la insignia Ritmo." },
    { id: "discovered", title: "Tienda descubierta", icon: "◎", requirement: { kind: "visits", threshold: 100 }, requirementCopy: "Alcanza 100 visitas", description: "Tu tienda ya encontró una audiencia real." },
    { id: "seven-days", title: "Semana constante", icon: "7", requirement: { kind: "dailyLoginStars", threshold: 7 }, requirementCopy: "Suma 7 estrellas diarias", description: "Una semana de constancia deja una huella brillante en la ruta." },
    { id: "ten-sales", title: "Diez celebraciones", icon: "10", requirement: { kind: "sales", threshold: 10 }, requirementCopy: "Completa 10 ventas", description: "Diez pagos exitosos desbloquean el cofre de celebración." },
    { id: "unstoppable", title: "Tesoro imparable", icon: "★", requirement: { kind: "combined", sales: 25, visits: 500 }, requirementCopy: "25 ventas + 500 visitas", description: "La combinación final de ventas y audiencia revela el gran tesoro." },
  ];
  const ADVENTURE_WORLD_STAGES = [
    { type: "start", id: "start", title: "Tu tienda despega" },
    { type: "character", id: "character-1", levelIndex: 0 },
    { type: "reward", rewardIndex: 0 },
    { type: "character", id: "character-2", levelIndex: 1 },
    { type: "reward", rewardIndex: 1 },
    { type: "character", id: "character-3", levelIndex: 2 },
    { type: "reward", rewardIndex: 2 },
    { type: "character", id: "character-4", levelIndex: 3 },
    { type: "reward", rewardIndex: 3 },
    { type: "character", id: "character-5", levelIndex: 4 },
    { type: "reward", rewardIndex: 4 },
    { type: "character", id: "character-6", levelIndex: 5 },
    { type: "reward", rewardIndex: 5 },
    { type: "character", id: "character-7", levelIndex: 6 },
    { type: "reward", rewardIndex: 6 },
    { type: "character", id: "character-8", levelIndex: 7, special: true },
  ];

  const GAMIFICATION_STARS = [
    { id: "first-view", title: "Primera mirada", description: "El enlace de tu tienda recibió su primera visita.", earned: ({ visits }) => visits >= 1, progress: ({ visits }) => `${Math.min(visits, 1)}/1 visita` },
    { id: "first-sale", title: "Primera venta", description: "Completaste tu primer pago exitoso.", earned: ({ sales }) => sales >= 1, progress: ({ sales }) => `${Math.min(sales, 1)}/1 venta` },
    { id: "hundred-views", title: "Tienda descubierta", description: "Alcanzaste 100 visitas a la tienda.", earned: ({ visits }) => visits >= 100, progress: ({ visits }) => `${Math.min(visits, 100)}/100 visitas` },
    { id: "ten-sales", title: "Diez celebraciones", description: "Acumulaste 10 pagos exitosos.", earned: ({ sales }) => sales >= 10, progress: ({ sales }) => `${Math.min(sales, 10)}/10 ventas` },
    { id: "unstoppable", title: "Negocio imparable", description: "Llegaste a 25 ventas y 500 visitas.", earned: ({ sales, visits }) => sales >= 25 && visits >= 500, progress: ({ sales, visits }) => `${Math.min(sales, 25)}/25 ventas · ${Math.min(visits, 500)}/500 visitas` },
  ];
  let gamificationToastTimer = null;
  const gamificationAnnouncementQueue = [];
  let activeGamificationAnnouncement = null;
  const progressCelebrationFetches = new Set();
  const queuedProgressLevels = new Set();
  let progressAcknowledgementChain = Promise.resolve();
  let birdUnlockQueue = [];
  let adventureRenderedXp = null;
  let adventureRenderedScope = null;
  let adventureMarkerAnimation = null;
  let adventureLevelUpTimer = null;
  let adventureXpToastTimer = null;
  let lastAdventureState = null;
  let lastAdventureCommerceState = null;
  let adventureInitialScrollScope = null;
  let dailyLoginReward = { awarded: false, totalStars: 0 };
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
    progress: ["Progreso", "Convierte la actividad real de tu tienda en niveles, estrellas y nuevos compañeros."],
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
    if (nextView !== "progress" && document.getElementById("adventureGuide")?.getAttribute("aria-expanded") === "true") {
      setAdventureGuideOpen(false);
    }
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
      try { localStorage.setItem(DASHBOARD_VIEW_KEY, nextView); } catch {}
    }
    if (nextView === "progress" && lastAdventureState) {
      requestAnimationFrame(() => renderAnimalAdventure(lastAdventureState.currentXP, { animate: false, commerce: lastAdventureCommerceState }));
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
  document.getElementById("gamificationCompanions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-companion-select]");
    if (!button || button.disabled || !lastFinances) return;
    try { localStorage.setItem(gamificationCompanionKey(), button.dataset.companionSelect); } catch {}
    renderGamification(lastFinances, { announce: false });
  });
  document.getElementById("adventureLevelNodes")?.addEventListener("click", (event) => {
    const node = event.target.closest("[data-adventure-level-index]");
    if (!node || node.disabled) return;
    renderAdventureLevelDetail(ADVENTURE_LEVELS[Number(node.dataset.adventureLevelIndex)]);
  });
  document.getElementById("adventureGuide")?.addEventListener("click", () => {
    playAdventureTouchSound("open");
    setAdventureGuideOpen(true);
  });
  document.getElementById("adventureGuideClose")?.addEventListener("click", () => {
    playAdventureTouchSound("close");
    setAdventureGuideOpen(false, { restoreFocus: true });
  });
  document.getElementById("animalAdventure")?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.getElementById("adventureGuideBubble").hidden) return;
    playAdventureTouchSound("close");
    setAdventureGuideOpen(false, { restoreFocus: true });
  });
  document.getElementById("adventureDebugControls")?.addEventListener("click", (event) => {
    if (!lastFinances) return;
    const addButton = event.target.closest("[data-adventure-xp]");
    const resetButton = event.target.closest("[data-adventure-reset]");
    if (!addButton && !resetButton) return;
    const actualXP = gamificationState(lastFinances).xp;
    if (resetButton) {
      try { localStorage.removeItem(adventureDebugXpKey()); } catch {}
      renderAnimalAdventure(actualXP, { animate: true });
      return;
    }
    const previousXP = resolvedAdventureXp(actualXP);
    const gainedXP = Math.max(0, Number(addButton.dataset.adventureXp) || 0);
    const nextXP = previousXP + gainedXP;
    try { localStorage.setItem(adventureDebugXpKey(), String(nextXP)); } catch {}
    renderAnimalAdventure(nextXP, { animate: true, delta: gainedXP });
  });
  let adventureResizeTimer = null;
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(adventureResizeTimer);
    adventureResizeTimer = window.requestAnimationFrame(() => {
      if (lastAdventureState && document.getElementById("animalAdventure")?.offsetParent) {
        renderAnimalAdventure(lastAdventureState.currentXP, { animate: false, commerce: lastAdventureCommerceState });
      }
    });
  });
  document.getElementById("gamificationToastClose")?.addEventListener("click", () => hideGamificationToast());
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

  const MAX_IMAGE_BYTES = 8_000_000;
  const MAX_GALLERY_IMAGES = 10;
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
      birdUnlockQueue = birdUnlockQueue.filter((item) => {
        if (item.storeId === storeId) return true;
        queuedProgressLevels.delete(`${item.storeId}:${item.levelIndex}`);
        return false;
      });
      stopQuickPaymentPolling();
      resetPaymentLinkBrowseState();
      resetDebtCollectionEntry();
      document.getElementById("quickPaymentResult").hidden = true;
      lastPaymentLinks = [];
      lastDebtCollectionLinks = [];
      renderDebtCollectionLinks([]);
      resetInventoryImportState();
      rewards.reset();
      cobros.reset();
      growth.reset();
      proposals.reset();
      contracts.reset();
      rewards.load().then(() => { if (lastFinances) renderGamification(lastFinances, { announce: false }); });
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

  function debtAmountInCents(value, lineNumber) {
    let normalized = String(value || "").trim().replace(/\s|Bs\.?/gi, "");
    if (normalized.includes(",") && normalized.includes(".")) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else normalized = normalized.replace(",", ".");
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(lineNumber ? `Monto inválido en la línea ${lineNumber}.` : "Escribe un monto válido mayor a cero.");
    }
    return Math.round(amount * 100);
  }

  function parseDebtCollectionRows(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Agrega al menos una deuda.");
    if (lines.length > 1000) throw new Error("Puedes cargar hasta 1.000 deudas por link.");
    return lines.map((line, index) => {
      const [rawDocument = "", customerName = "", rawAmount = "", description = "", reference = "", customerEmail = "", customerPhone = ""] = line.split(";").map((cell) => cell.trim());
      const customerDocument = debtDocumentDigits(rawDocument);
      if (!customerDocument || !customerName || !rawAmount) throw new Error(`Completa carnet, nombre y monto en la línea ${index + 1}.`);
      return {
        customerDocument,
        customerName,
        amount: debtAmountInCents(rawAmount, index + 1),
        ...(description && { description }),
        ...(reference && { reference }),
        ...(customerEmail && { customerEmail }),
        ...(customerPhone && { customerPhone }),
      };
    });
  }

  function parseDebtCsv(text) {
    const source = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!source) throw new Error("El CSV está vacío.");
    const delimiter = csvDelimiter(source);
    const table = parseCsvTable(source, delimiter).filter((row) => row.some((cell) => cell.trim()));
    if (!table.length) throw new Error("El CSV está vacío.");
    const aliases = {
      customerDocument: ["nit", "nro_nit", "numeronit", "carnet", "ci", "cedula", "documento", "nrodocumento", "identificacion", "customerdocument", "customer_document"],
      customerName: ["nombre", "cliente", "alumno", "estudiante", "socio", "nombrecliente", "customername", "customer_name"],
      amount: ["monto", "montobs", "importe", "deuda", "saldo", "saldobs", "cuota", "precio", "total", "amount"],
      customerEmail: ["gmail", "correo", "correoelectronico", "email", "customeremail", "customer_email"],
      customerPhone: ["telefono", "telefonocelular", "celular", "movil", "whatsapp", "phone", "customerphone", "customer_phone"],
    };
    const normalizedHeader = table[0].map(normalizeDebtCsvHeader);
    const positions = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, normalizedHeader.findIndex((value) => names.includes(value))]));
    const hasHeader = positions.customerDocument >= 0 && positions.customerName >= 0 && positions.amount >= 0;
    const rows = hasHeader ? table.slice(1) : table;
    if (!rows.length) throw new Error("El CSV no contiene deudas debajo de los encabezados.");
    const parsed = rows.flatMap((row, index) => {
      const line = index + (hasHeader ? 2 : 1);
      const cell = (key, fallback) => String(row[hasHeader ? positions[key] : fallback] || "").trim();
      const customerDocument = debtDocumentDigits(cell("customerDocument", 0));
      const customerName = cell("customerName", 1);
      const rawAmount = cell("amount", 2);
      const customerEmail = cell("customerEmail", 3);
      const customerPhone = cell("customerPhone", 4);
      if (!customerDocument || !customerName || !rawAmount) return [];
      let amount;
      try { amount = debtAmountInCents(rawAmount, line); }
      catch { return []; }
      return [{
        customerDocument,
        customerName,
        amount,
        ...(customerEmail && { customerEmail }),
        ...(customerPhone && { customerPhone }),
      }];
    });
    if (!parsed.length) throw new Error("El CSV no contiene filas con NIT/CI, nombre y monto válidos.");
    return parsed.slice(0, 1000);
  }

  function debtDocumentDigits(value) {
    return String(value || "").normalize("NFKC").replace(/[^0-9]/g, "");
  }

  function normalizeDebtCsvHeader(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  }

  function csvDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    return (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  }

  function parseCsvTable(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell); cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += char;
    }
    row.push(cell);
    if (row.some((value) => value.length)) rows.push(row);
    if (quoted) throw new Error("El CSV tiene una comilla sin cerrar.");
    return rows;
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
    const statusFor = store => store.status === "ARCHIVED" ? "archived" : (store.publishedSourceRevision ? !store.sourcePublicationPaused : store.websitePublishedRevision > 0) ? "published" : "draft";
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

  const BALANCE_CARD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;

  function renderBalanceCards(balances) {
    document.getElementById("balanceCards").innerHTML = balances
      .map(
        (entry) => `<div class="card">
          <div class="card-head">
            <span class="muted">Saldo por desembolsar (${esc(entry.currency)})</span>
            <span class="card-icon">${BALANCE_CARD_ICON}</span>
          </div>
          <div class="value">${money(entry.payableBalance, esc(entry.currency))}</div>
          <p class="faint" style="margin:4px 0 0">Se transfiere a tu cuenta bancaria en el próximo desembolso</p>
        </div>`,
      )
      .join("");
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

  const GAMIFICATION_STAR_SVG = `<svg class="gamification-star-icon" viewBox="0 0 24 24" fill="currentColor" stroke="#050505" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="m12 2.7 2.86 5.8 6.4.93-4.63 4.51 1.1 6.38L12 17.3l-5.73 3.02 1.1-6.38-4.63-4.51 6.4-.93z"/></svg>`;

  function gamificationIdentityHash() {
    const identity = (emailEl.value || sessionStorage.getItem("pagosya_merchant_email") || "merchant").trim().toLocaleLowerCase("es");
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
  }

  function gamificationStorageScope() {
    return `${gamificationIdentityHash()}_${currentStoreId || "all-stores"}`;
  }

  function gamificationCompanionKey() {
    return `pagosya_gamification_companion_${gamificationStorageScope()}`;
  }

  function gamificationSnapshotKey() {
    return `pagosya_gamification_snapshot_${gamificationStorageScope()}`;
  }

  function adventureDebugXpKey() {
    return `pagosya_adventure_debug_xp_${gamificationStorageScope()}`;
  }

  function gamificationSeenAchievementsKey(scope = gamificationStorageScope()) {
    return `pagosya_gamification_seen_achievements_${scope}`;
  }

  function gamificationPendingAchievementsKey(scope = gamificationStorageScope()) {
    return `pagosya_gamification_pending_achievements_${scope}`;
  }

  function selectedGamificationCompanion(levelIndex) {
    try {
      const saved = localStorage.getItem(gamificationCompanionKey());
      if (saved === null) return levelIndex;
      const stored = Number(saved);
      if (Number.isInteger(stored) && stored >= 0 && stored <= levelIndex && stored < ADVENTURE_LEVELS.length) return stored;
    } catch {}
    return levelIndex;
  }

  function storedStringList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  function pendingAchievementIds(state) {
    const scope = gamificationStorageScope();
    const seen = new Set(storedStringList(gamificationSeenAchievementsKey(scope)));
    const pending = storedStringList(gamificationPendingAchievementsKey(scope)).filter((id) => !seen.has(id));
    const pendingSet = new Set(pending);
    state.stars.filter((star) => star.isEarned).forEach((star) => {
      if (!seen.has(star.id) && !pendingSet.has(star.id)) {
        pending.push(star.id);
        pendingSet.add(star.id);
      }
    });
    try { localStorage.setItem(gamificationPendingAchievementsKey(scope), JSON.stringify(pending)); } catch {}
    return pending;
  }

  function markAchievementSeen(achievementId, scope = gamificationStorageScope()) {
    if (!achievementId) return;
    const seenKey = gamificationSeenAchievementsKey(scope);
    const pendingKey = gamificationPendingAchievementsKey(scope);
    const seen = new Set(storedStringList(seenKey));
    seen.add(achievementId);
    const pending = storedStringList(pendingKey).filter((id) => id !== achievementId);
    try {
      localStorage.setItem(seenKey, JSON.stringify([...seen]));
      localStorage.setItem(pendingKey, JSON.stringify(pending));
    } catch {}
  }

  function gamificationState(finances) {
    const sales = Math.max(0, Number(finances?.paymentCount) || 0);
    const visits = Math.max(0, Number(finances?.totalStoreViews) || 0);
    const salesXp = sales * GAMIFICATION_XP_PER_SALE;
    const visitsXp = visits * GAMIFICATION_XP_PER_VISIT;
    const gameXp = Math.max(0, Number(rewards.state()?.bonusXp) || 0);
    const xp = salesXp + visitsXp + gameXp;
    let levelIndex = 0;
    ADVENTURE_LEVELS.forEach((entry, index) => { if (xp >= entry.xpRequired) levelIndex = index; });
    const level = ADVENTURE_LEVELS[levelIndex];
    const nextLevel = ADVENTURE_LEVELS[levelIndex + 1] || null;
    const span = nextLevel ? nextLevel.xpRequired - level.xpRequired : 1;
    const progress = nextLevel ? Math.max(0, Math.min(100, Math.round(((xp - level.xpRequired) / span) * 100))) : 100;
    const stars = GAMIFICATION_STARS.map((star) => ({ ...star, isEarned: star.earned({ sales, visits }) }));
    return { sales, visits, salesXp, visitsXp, gameXp, xp, levelIndex, level, nextLevel, progress, stars, earnedStars: stars.filter((star) => star.isEarned).length, dailyLoginStars: Math.max(0, Number(dailyLoginReward.totalStars) || 0) };
  }

  function getProgressState(currentXP, levels = ADVENTURE_LEVELS) {
    const safeLevels = Array.isArray(levels) && levels.length ? levels : ADVENTURE_LEVELS;
    const rawXP = Math.max(0, Number(currentXP) || 0);
    const maxXP = Math.max(0, Number(safeLevels[safeLevels.length - 1].xpRequired) || 0);
    const clampedXP = Math.min(rawXP, maxXP);
    let currentLevelIndex = 0;
    safeLevels.forEach((level, index) => {
      if (clampedXP >= Number(level.xpRequired)) currentLevelIndex = index;
    });
    const currentLevel = safeLevels[currentLevelIndex];
    const nextLevel = safeLevels[currentLevelIndex + 1] || null;
    const currentFloor = Number(currentLevel.xpRequired) || 0;
    const currentCeiling = nextLevel ? Number(nextLevel.xpRequired) : maxXP;
    const currentSpan = Math.max(1, currentCeiling - currentFloor);
    const currentLevelPercentage = nextLevel ? ((clampedXP - currentFloor) / currentSpan) * 100 : 100;
    return {
      currentXP: rawXP,
      clampedXP,
      maxXP,
      currentLevelIndex,
      currentLevel,
      nextLevel,
      completedLevels: safeLevels.filter((_, index) => index < currentLevelIndex || (!nextLevel && index === currentLevelIndex)),
      lockedLevels: safeLevels.filter((_, index) => index > currentLevelIndex),
      xpUntilNext: nextLevel ? Math.max(0, Number(nextLevel.xpRequired) - rawXP) : 0,
      overallPercentage: maxXP ? (clampedXP / maxXP) * 100 : 100,
      currentLevelPercentage: Math.max(0, Math.min(100, currentLevelPercentage)),
      isAdventureComplete: !nextLevel,
    };
  }
  window.getProgressState = getProgressState;

  function storedAdventureDebugXp() {
    try {
      const stored = localStorage.getItem(adventureDebugXpKey());
      if (stored === null) return null;
      const xp = Number(stored);
      return Number.isFinite(xp) && xp >= 0 ? xp : null;
    } catch {
      return null;
    }
  }

  function resolvedAdventureXp(actualXP) {
    const debugXP = storedAdventureDebugXp();
    return debugXP === null ? Math.max(0, Number(actualXP) || 0) : debugXP;
  }

  function adventureNodeStatus(index, state) {
    if (index < state.currentLevelIndex || (state.isAdventureComplete && index === state.currentLevelIndex)) return "completed";
    if (index === state.currentLevelIndex) return "current";
    return "locked";
  }

  function renderAdventureLevelDetail(level, state = lastAdventureState) {
    if (!level || !state) return;
    const statusIndex = ADVENTURE_LEVELS.findIndex((entry) => entry.id === level.id);
    const status = adventureNodeStatus(statusIndex, state);
    const statusCopy = status === "completed" ? "Completado" : status === "current" ? "Etapa actual" : `Se abre con ${level.xpRequired.toLocaleString("es-BO")} XP`;
    document.getElementById("adventureLevelDetail").innerHTML = `<strong>Nivel ${level.id} · ${esc(level.name)} <small>(${esc(level.englishName)})</small></strong>${esc(level.description)} · ${esc(statusCopy)}`;
  }

  function showAdventureXpToast(delta) {
    if (!(delta > 0)) return;
    const toast = document.getElementById("adventureXpToast");
    window.clearTimeout(adventureXpToastTimer);
    toast.textContent = `+${delta.toLocaleString("es-BO")} XP`;
    toast.hidden = true;
    void toast.offsetWidth;
    toast.hidden = false;
    adventureXpToastTimer = window.setTimeout(() => { toast.hidden = true; }, 820);
  }

  function showAdventureLevelUp(level) {
    const overlay = document.getElementById("adventureLevelUp");
    window.clearTimeout(adventureLevelUpTimer);
    document.getElementById("adventureLevelUpTitle").textContent = `Nivel ${level.id} — ${level.name}`;
    overlay.hidden = true;
    void overlay.offsetWidth;
    overlay.hidden = false;
    adventureLevelUpTimer = window.setTimeout(() => { overlay.hidden = true; }, 1120);
  }

  let adventureAudioContext = null;
  // One AudioContext for every dashboard sound; null where the browser has none.
  function adventureAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    adventureAudioContext ||= new AudioContext();
    return adventureAudioContext;
  }
  function playAdventureTouchSound(kind = "open") {
    try {
      const context = adventureAudio();
      if (!context) return;
      if (context.state === "suspended") context.resume();
      const now = context.currentTime;
      const notes = kind === "close" ? [620, 430] : [480, 720];
      notes.forEach((frequency, index) => {
        const start = now + (index * .075);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, start + .09);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.045, start + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .13);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + .14);
      });
    } catch {
      // Sound is optional; blocked audio must never affect the guide interaction.
    }
  }

  function setAdventureGuideOpen(open, { restoreFocus = false } = {}) {
    const guide = document.getElementById("adventureGuide");
    const bubble = document.getElementById("adventureGuideBubble");
    guide.setAttribute("aria-expanded", String(open));
    bubble.hidden = !open;
    document.body.classList.toggle("adventure-guide-open", open);
    document.querySelectorAll("#adventureMapStage > :not(#adventureGuideBubble)").forEach((element) => { element.inert = open; });
    if (open) requestAnimationFrame(() => document.getElementById("adventureGuideClose").focus());
    else if (restoreFocus) guide.focus();
  }

  const JOURNEY_NODE_Y = [350, 235, 365, 205, 325, 245, 380, 220, 345, 235, 375, 210, 330, 250, 370, 205];
  let journeySoundTimer = null;
  let journeySoundEnabled = false;
  const journeyStagePositions = () => ADVENTURE_WORLD_STAGES.map((_, index) => ({ x: 130 + (index * 235), y: JOURNEY_NODE_Y[index] }));
  function journeyPathData(positions) {
    return positions.slice(1).reduce((path, point, index) => {
      const previous = positions[index];
      const midpoint = (previous.x + point.x) / 2;
      return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
    }, `M ${positions[0].x} ${positions[0].y}`);
  }
  function journeyRewardUnlocked(reward, commerce) {
    const requirement = reward.requirement;
    if (requirement.kind === "combined") return commerce.sales >= requirement.sales && commerce.visits >= requirement.visits;
    return Math.max(0, Number(commerce[requirement.kind]) || 0) >= requirement.threshold;
  }
  function journeyStageStatus(stage, state, commerce) {
    if (stage.type === "start") return "completed";
    if (stage.type === "reward") return journeyRewardUnlocked(ADVENTURE_REWARDS[stage.rewardIndex], commerce) ? "earned" : "locked";
    if (stage.levelIndex < state.currentLevelIndex || (state.isAdventureComplete && stage.levelIndex === state.currentLevelIndex)) return "completed";
    if (stage.levelIndex === state.currentLevelIndex) return "current";
    return "locked";
  }
  function journeyPathProgress(state) {
    const characterStops = ADVENTURE_WORLD_STAGES.map((stage, index) => stage.type === "character" ? index : -1).filter((index) => index >= 0);
    const from = characterStops[state.currentLevelIndex] || 0;
    const to = characterStops[state.currentLevelIndex + 1] ?? from;
    return (state.nextLevel ? from + ((to - from) * state.currentLevelPercentage / 100) : from) / (ADVENTURE_WORLD_STAGES.length - 1);
  }
  function scheduleJourneySoundtrack() {
    if (!journeySoundEnabled) return;
    try {
      const context = adventureAudio();
      if (!context) return;
      if (context.state === "suspended") context.resume();
      [261.63,329.63,392,329.63,293.66,349.23,440,349.23].forEach((frequency, index) => {
        const oscillator = context.createOscillator(); const gain = context.createGain(); const start = context.currentTime + .04 + (index * .34);
        oscillator.type = index % 2 ? "sine" : "triangle"; oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.018, start + .035); gain.gain.exponentialRampToValueAtTime(.0001, start + .28);
        oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + .3);
      });
    } catch {}
  }
  function setJourneySound(enabled) {
    journeySoundEnabled = enabled; window.clearInterval(journeySoundTimer); journeySoundTimer = null;
    try { localStorage.setItem("pagosya_journey_sound", enabled ? "on" : "off"); } catch {}
    const button = document.getElementById("journeySoundToggle");
    button?.setAttribute("aria-pressed", String(enabled)); button?.setAttribute("aria-label", enabled ? "Silenciar música de la ruta" : "Reproducir música de la ruta");
    if (enabled) { scheduleJourneySoundtrack(); journeySoundTimer = window.setInterval(scheduleJourneySoundtrack, 3200); }
  }
  function renderJourneyDetail(stageIndex, state, commerce) {
    const stage = ADVENTURE_WORLD_STAGES[stageIndex]; if (!stage) return;
    if (stage.type === "start") { document.getElementById("adventureLevelDetail").innerHTML = `<strong>Inicio · Tu tienda despega</strong>Cada venta suma ${GAMIFICATION_XP_PER_SALE} XP y cada visita suma ${GAMIFICATION_XP_PER_VISIT} XP.`; return; }
    if (stage.type === "reward") {
      const reward = ADVENTURE_REWARDS[stage.rewardIndex]; const unlocked = journeyRewardUnlocked(reward, commerce);
      document.getElementById("adventureLevelDetail").innerHTML = `<strong>${unlocked ? "Recompensa ganada" : "Recompensa misteriosa"} · ${esc(reward.title)}</strong>${esc(unlocked ? reward.description : reward.requirementCopy)}.`; return;
    }
    const level = ADVENTURE_LEVELS[stage.levelIndex]; const unlocked = stage.levelIndex <= state.currentLevelIndex;
    document.getElementById("adventureLevelDetail").innerHTML = `<strong>${unlocked ? `${esc(level.character)} · ${esc(level.rarity)}` : "Personaje bloqueado"}</strong>${esc(unlocked ? level.description : `Consigue ${level.xpRequired.toLocaleString("es-BO")} XP para descubrirlo`)}.`;
  }
  function renderJourneyNodes(state, commerce) {
    const selected = selectedGamificationCompanion(state.currentLevelIndex); const positions = journeyStagePositions();
    document.getElementById("adventureLevelNodes").innerHTML = ADVENTURE_WORLD_STAGES.map((stage, index) => {
      const position = positions[index]; const status = journeyStageStatus(stage, state, commerce);
      if (stage.type === "start") return `<button class="journey-node is-start is-completed" type="button" data-world-stage-index="${index}" style="left:${position.x}px;top:${position.y}px"><span class="journey-node-platform"><span class="journey-start-flag"></span></span><span class="journey-node-copy"><strong>Comienza aquí</strong><small>Comparte tu tienda</small></span><span class="journey-node-badge">✓</span></button>`;
      if (stage.type === "reward") { const reward = ADVENTURE_REWARDS[stage.rewardIndex]; return `<button class="journey-node is-reward is-${status}" type="button" data-world-stage-index="${index}" style="left:${position.x}px;top:${position.y}px" aria-label="${esc(reward.title)}, ${status === "earned" ? "ganada" : "bloqueada"}"><span class="journey-node-platform"><span class="journey-reward-gem" aria-hidden="true">${esc(reward.icon)}</span></span><span class="journey-node-copy"><strong>${status === "earned" ? esc(reward.title) : "Recompensa misteriosa"}</strong><small>${status === "earned" ? "Ganada" : esc(reward.requirementCopy)}</small></span><span class="journey-node-badge">${status === "earned" ? "✓" : "🔒"}</span></button>`; }
      const level = ADVENTURE_LEVELS[stage.levelIndex]; const isSelected = selected === stage.levelIndex;
      return `<button class="journey-node is-${status}${isSelected ? " is-selected" : ""}" type="button" data-world-stage-index="${index}" data-journey-companion="${stage.levelIndex}" style="left:${position.x}px;top:${position.y}px" aria-label="${esc(level.character)}, ${status === "locked" ? `bloqueado hasta ${level.xpRequired} XP` : `${level.rarity}, desbloqueado`}" aria-disabled="${status === "locked"}"><span class="journey-node-platform"><span class="journey-node-art">${companionBlobHtml(level)}</span></span><span class="journey-node-copy"><strong>${status === "locked" ? "???" : esc(level.character)}</strong><small>${status === "locked" ? `${level.xpRequired.toLocaleString("es-BO")} XP` : esc(level.rarity)}</small></span><span class="journey-node-badge">${status === "completed" ? "✓" : status === "current" ? "AHORA" : "🔒"}</span></button>`;
    }).join("");
    const route = journeyPathData(positions); ["journeyRouteShadow","journeyRouteBase","journeyRouteProgressShadow","journeyRouteProgress"].forEach((id) => document.getElementById(id).setAttribute("d", route)); return positions;
  }
  function renderJourneyCompanions(state) {
    const selected = selectedGamificationCompanion(state.currentLevelIndex);
    document.getElementById("gamificationRunnerPicker").innerHTML = ADVENTURE_LEVELS.slice(0, state.currentLevelIndex + 1).map((level, index) => `<button class="journey-companion-option" type="button" data-journey-companion="${index}" aria-pressed="${index === selected}" aria-label="Elegir a ${esc(level.character)}" title="${esc(level.character)} · ${esc(level.rarity)}">${companionBlobHtml(level)}</button>`).join("");
  }
  function ensureJourneyMarkup() {
    const root = document.getElementById("animalAdventure"); if (!root || root.querySelector(".journey-shell")) return;
    root.className = "animal-adventure journey-experience";
    root.innerHTML = `<div class="journey-shell">
      <header class="journey-topbar"><div class="journey-title"><small>Ruta de crecimiento</small><h2 id="adventureMapTitle">Horizonte pagosYa</h2></div><div class="journey-progress-card" aria-live="polite"><div class="journey-progress-heading"><span id="adventureCurrentLevel">Nivel 1 · Pipa</span><strong id="adventureXpValue">0 / 100 XP</strong></div><div class="journey-xp-track" id="adventureXpTrack" role="progressbar" aria-label="Progreso de la etapa actual" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="adventureXpFill"></span></div><div class="journey-progress-meta"><span id="adventureXpRemaining">100 XP para Capi</span><span id="adventureOverallProgress">0% de la ruta</span></div></div><div class="journey-actions"><button class="journey-icon-button" id="journeySoundToggle" type="button" aria-pressed="false" aria-label="Reproducir música de la ruta" title="Música de la ruta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg></button><button class="journey-icon-button" type="button" data-journey-scroll="-1" aria-label="Explorar hacia atrás"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><button class="journey-icon-button" type="button" data-journey-scroll="1" aria-label="Explorar hacia adelante"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div></header>
      <div class="journey-viewport" id="journeyViewport" tabindex="0" aria-label="Mundo de progreso. Desliza horizontalmente para explorar."><div class="journey-world" id="journeyWorld"><span class="journey-sun" aria-hidden="true"></span><span class="journey-cloud cloud-a" aria-hidden="true"></span><span class="journey-cloud cloud-b" aria-hidden="true"></span><span class="journey-cloud cloud-c" aria-hidden="true"></span><span class="journey-biome-label biome-a">Valle inicial</span><span class="journey-biome-label biome-b">Bosque de impulso</span><span class="journey-biome-label biome-c">Cumbre brillante</span><svg class="journey-route" viewBox="0 0 3860 500" preserveAspectRatio="none" aria-hidden="true"><path class="journey-route-shadow" id="journeyRouteShadow"/><path class="journey-route-base" id="journeyRouteBase" pathLength="100"/><path class="journey-route-progress-shadow" id="journeyRouteProgressShadow" pathLength="100"/><path class="journey-route-progress" id="journeyRouteProgress" pathLength="100"/></svg><div class="journey-nodes" id="adventureLevelNodes"></div><div class="journey-player" id="adventurePlayer"><span class="journey-player-face" id="adventurePlayerFace"></span><span class="journey-player-flag">Tú</span></div></div></div>
      <footer class="journey-footer"><div class="journey-stage-detail" id="adventureLevelDetail" aria-live="polite"></div><div class="journey-companion-control"><span>Tu compañero</span><div class="journey-companion-picker" id="gamificationRunnerPicker" role="group" aria-label="Personajes desbloqueados"></div></div><div class="journey-help">Desliza para explorar. En escritorio también puedes arrastrar o usar las flechas.</div><div id="adventureDebugControls" hidden></div></footer><div class="journey-xp-toast" id="adventureXpToast" hidden aria-live="polite"></div><div class="journey-level-up" id="adventureLevelUp" hidden aria-live="assertive"><span>Nueva etapa</span><strong id="adventureLevelUpTitle"></strong></div></div>`;
    const viewport = document.getElementById("journeyViewport");
    root.addEventListener("click", (event) => {
      const scrollButton = event.target.closest("[data-journey-scroll]"); if (scrollButton) viewport.scrollBy({ left: Number(scrollButton.dataset.journeyScroll) * viewport.clientWidth * .72, behavior: "smooth" });
      if (event.target.closest("#journeySoundToggle")) setJourneySound(!journeySoundEnabled);
      const companionButton = event.target.closest("[data-journey-companion]");
      if (companionButton && lastAdventureState && Number(companionButton.dataset.journeyCompanion) <= lastAdventureState.currentLevelIndex) {
        try { localStorage.setItem(gamificationCompanionKey(), companionButton.dataset.journeyCompanion); } catch {}
        playAdventureTouchSound("open"); renderAnimalAdventure(lastAdventureState.currentXP, { animate: false, commerce: lastAdventureCommerceState });
      }
      const node = event.target.closest("[data-world-stage-index]"); if (node && lastAdventureState) renderJourneyDetail(Number(node.dataset.worldStageIndex), lastAdventureState, lastAdventureCommerceState);
    });
    let dragStartX = 0; let dragStartScroll = 0;
    viewport.addEventListener("pointerdown", (event) => { if (event.pointerType !== "mouse" || event.target.closest("button")) return; dragStartX = event.clientX; dragStartScroll = viewport.scrollLeft; viewport.classList.add("is-dragging"); viewport.setPointerCapture(event.pointerId); });
    viewport.addEventListener("pointermove", (event) => { if (viewport.classList.contains("is-dragging")) viewport.scrollLeft = dragStartScroll - (event.clientX - dragStartX); });
    const endDrag = () => viewport.classList.remove("is-dragging"); viewport.addEventListener("pointerup", endDrag); viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("wheel", (event) => { if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; event.preventDefault(); viewport.scrollLeft += event.deltaY; }, { passive: false });
    journeySoundEnabled = false;
    document.getElementById("journeySoundToggle").setAttribute("aria-pressed", "false");
  }

  function renderAnimalAdventure(currentXP, { animate = true, delta = null, commerce = null } = {}) {
    const scope = gamificationStorageScope();
    const state = getProgressState(currentXP);
    const previousState = adventureRenderedXp === null || adventureRenderedScope !== scope ? null : getProgressState(adventureRenderedXp);
    const commerceState = commerce || lastAdventureCommerceState || { sales: 0, visits: 0, dailyLoginStars: 0 };
    lastAdventureState = state; lastAdventureCommerceState = commerceState;
    // The Horizonte map was removed from the dashboard; keep the progress state for the rest of gamification.
    if (!document.getElementById("animalAdventure")) return;
    ensureJourneyMarkup();
    const positions = renderJourneyNodes(state, commerceState);
    renderJourneyCompanions(state);
    const selected = ADVENTURE_LEVELS[selectedGamificationCompanion(state.currentLevelIndex)];
    document.getElementById("adventurePlayerFace").innerHTML = companionBlobHtml(selected);
    const path = document.getElementById("journeyRouteBase");
    const progress = journeyPathProgress(state);
    const totalLength = path.getTotalLength();
    const point = path.getPointAtLength(totalLength * progress);
    const player = document.getElementById("adventurePlayer");
    const finalTransform = `translate3d(${point.x - 32}px,${point.y - 32}px,0)`;
    const shouldAnimate = animate && previousState && previousState.currentXP !== state.currentXP;
    if (shouldAnimate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const previousPoint = path.getPointAtLength(totalLength * journeyPathProgress(previousState));
      adventureMarkerAnimation?.cancel();
      adventureMarkerAnimation = player.animate([{ transform: `translate3d(${previousPoint.x - 32}px,${previousPoint.y - 32}px,0)` }, { transform: finalTransform }], { duration: 500, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" });
      adventureMarkerAnimation.addEventListener("finish", () => { player.style.transform = finalTransform; adventureMarkerAnimation?.cancel(); adventureMarkerAnimation = null; }, { once: true });
    } else player.style.transform = finalTransform;
    const routePercent = progress * 100;
    document.getElementById("journeyRouteProgress").style.strokeDasharray = `${routePercent} ${100 - routePercent}`;
    document.getElementById("journeyRouteProgressShadow").style.strokeDasharray = `${routePercent} ${100 - routePercent}`;
    document.getElementById("adventureCurrentLevel").textContent = `Nivel ${state.currentLevel.id} · ${state.currentLevel.character}`;
    document.getElementById("adventureXpValue").textContent = state.nextLevel ? `${state.currentXP.toLocaleString("es-BO")} / ${state.nextLevel.xpRequired.toLocaleString("es-BO")} XP` : `${state.currentXP.toLocaleString("es-BO")} XP · Ruta completa`;
    document.getElementById("adventureXpRemaining").textContent = state.nextLevel ? `${state.xpUntilNext.toLocaleString("es-BO")} XP para ${state.nextLevel.character}` : "Todos los personajes desbloqueados";
    document.getElementById("adventureOverallProgress").textContent = `${Math.round(state.overallPercentage)}% de la ruta`;
    const xpTrack = document.getElementById("adventureXpTrack"); xpTrack.setAttribute("aria-valuenow", String(Math.round(state.currentLevelPercentage))); xpTrack.setAttribute("aria-valuetext", `${Math.round(state.currentLevelPercentage)}% de la etapa actual`);
    document.getElementById("adventureXpFill").style.transform = `scaleX(${state.currentLevelPercentage / 100})`;
    const currentStageIndex = ADVENTURE_WORLD_STAGES.findIndex((stage) => stage.type === "character" && stage.levelIndex === state.currentLevelIndex);
    renderJourneyDetail(currentStageIndex, state, commerceState);
    const viewport = document.getElementById("journeyViewport");
    if (adventureInitialScrollScope !== scope && viewport.clientWidth > 0) { viewport.scrollLeft = Math.max(0, positions[currentStageIndex].x - (viewport.clientWidth * .38)); adventureInitialScrollScope = scope; }
    const inferredDelta = delta === null && previousState ? state.currentXP - previousState.currentXP : delta;
    if (shouldAnimate && inferredDelta > 0) showAdventureXpToast(inferredDelta);
    if (shouldAnimate && state.currentLevelIndex > previousState.currentLevelIndex) { showAdventureLevelUp(state.currentLevel); playAdventureTouchSound("open"); }
    adventureRenderedXp = state.currentXP; adventureRenderedScope = scope;
    return state;
  }
  window.renderAnimalAdventure = renderAnimalAdventure;

  function defaultGamificationSpeech(state, storeName) {
    const subject = storeName || "tu negocio";
    if (state.sales === 0 && state.visits === 0) {
      return `¡${subject} está listo para comenzar! Comparte el enlace de tu tienda: la primera visita ya suma experiencia.`;
    }
    if (!state.nextLevel) {
      return `¡Qué recorrido! ${subject} llegó a la guía final con ${state.sales.toLocaleString("es-BO")} ventas y ${state.visits.toLocaleString("es-BO")} visitas. Sigue creciendo a tu ritmo.`;
    }
    if (state.sales > 0) {
      return `¡Buen trabajo! ${subject} ya convirtió ${state.sales.toLocaleString("es-BO")} ${state.sales === 1 ? "venta" : "ventas"} y ${state.visits.toLocaleString("es-BO")} ${state.visits === 1 ? "visita" : "visitas"} en progreso real.`;
    }
    return `¡Ya te están descubriendo! ${subject} sumó ${state.visits.toLocaleString("es-BO")} ${state.visits === 1 ? "visita" : "visitas"}. La primera venta desbloqueará 50 XP de una vez.`;
  }

  function setGamificationProgress(element, progress) {
    element.style.setProperty("--xp-progress-scale", String(progress / 100));
    element.setAttribute("aria-valuenow", String(progress));
    element.setAttribute("aria-valuetext", `${progress}% del nivel completado`);
  }

  function hideGamificationToast() {
    window.clearTimeout(gamificationToastTimer);
    gamificationToastTimer = null;
    const toast = document.getElementById("gamificationToast");
    toast.hidden = true;
    if (activeGamificationAnnouncement?.achievementId) {
      markAchievementSeen(activeGamificationAnnouncement.achievementId, activeGamificationAnnouncement.achievementScope);
      document.querySelector(`[data-achievement-id="${activeGamificationAnnouncement.achievementId}"]`)?.classList.remove("is-unlocking");
    }
    activeGamificationAnnouncement = null;
    window.setTimeout(showNextGamificationAnnouncement, 220);
  }

  function showNextGamificationAnnouncement() {
    if (activeGamificationAnnouncement || !gamificationAnnouncementQueue.length) return;
    activeGamificationAnnouncement = gamificationAnnouncementQueue.shift();
    const { companion, title, message, achievementId } = activeGamificationAnnouncement;
    const toast = document.getElementById("gamificationToast");
    paintBlob(document.getElementById("gamificationToastBlob"), `${companion.id}:happy`, companionBlobHtml(companion, { expression: "happy" }));
    document.getElementById("gamificationToastTitle").textContent = title;
    document.getElementById("gamificationToastMessage").textContent = message;
    toast.dataset.kind = achievementId ? "achievement" : "progress";
    if (achievementId) {
      const card = document.querySelector(`[data-achievement-id="${achievementId}"]`);
      card?.classList.remove("is-unlocking");
      requestAnimationFrame(() => card?.classList.add("is-unlocking"));
    }
    window.clearTimeout(gamificationToastTimer);
    toast.hidden = false;
    requestAnimationFrame(() => burstConfetti(toast, { count: achievementId ? 56 : 28 }));
    gamificationToastTimer = window.setTimeout(hideGamificationToast, 8500);
  }

  function showGamificationToast(companion, title, message, achievementId = null, achievementScope = null) {
    const duplicate = achievementId && (
      (activeGamificationAnnouncement?.achievementId === achievementId && activeGamificationAnnouncement?.achievementScope === achievementScope)
      || gamificationAnnouncementQueue.some((item) => item.achievementId === achievementId && item.achievementScope === achievementScope)
    );
    if (duplicate) return;
    gamificationAnnouncementQueue.push({ companion, title, message, achievementId, achievementScope });
    showNextGamificationAnnouncement();
  }

  let unlockBlob = null;
  function showNextBirdUnlock() {
    const dialog = document.getElementById("birdUnlockDialog");
    const blockingDialog = document.querySelector("dialog[open]:not(#birdUnlockDialog)");
    if (dialog.open || blockingDialog || !birdUnlockQueue.length) return;
    const pending = birdUnlockQueue[0];
    if (pending.storeId !== currentStoreId) {
      birdUnlockQueue.shift();
      queuedProgressLevels.delete(`${pending.storeId}:${pending.levelIndex}`);
      window.setTimeout(showNextBirdUnlock, 0);
      return;
    }
    const { level, storeName, storeId, levelIndex } = pending;
    unlockBlob?.destroy();
    unlockBlob = mountBlob(document.getElementById("birdUnlockBlob"), { seed: companionSeed(level), look: level.look, expression: level.expression });
    document.getElementById("birdUnlockTitle").textContent = `¡${level.character} llegó!`;
    document.getElementById("birdUnlockLevel").textContent = `Nivel ${level.id} · ${level.name}`;
    document.getElementById("birdUnlockSpeech").textContent = `¡Felicidades! Has llegado al nivel ${level.id}. ${storeName} va muy bien; cada venta y cada visita cuentan. Desde ahora ${level.character} te acompaña. ¡Sigue así!`;
    try {
      dialog.showModal();
      birdUnlockQueue.shift();
      document.getElementById("birdUnlockContinue").focus();
      void unlockBlob.play(ANIMATIONS.unlock);
      progressAcknowledgementChain = progressAcknowledgementChain.then(() => acknowledgeBirdUnlock(storeId, levelIndex));
    } catch {
      // Keep the unlock pending locally and on the server so a later render can retry it.
    }
  }

  function queueBirdUnlock(levelIndex, storeName, storeId) {
    const level = ADVENTURE_LEVELS[levelIndex];
    const queueKey = `${storeId}:${levelIndex}`;
    if (!level || queuedProgressLevels.has(queueKey)) return;
    queuedProgressLevels.add(queueKey);
    birdUnlockQueue.push({ level, levelIndex, storeName, storeId });
    showNextBirdUnlock();
  }

  async function acknowledgeBirdUnlock(storeId, levelIndex) {
    try {
      await api("/dashboard/progress-celebrations/acknowledge", {
        method: "POST",
        body: JSON.stringify({ storeId, level: levelIndex }),
      });
    } catch {
      // The server remains authoritative and will offer the unlock again next login.
    }
  }

  async function claimProgressCelebrations() {
    if (!sessionToken || !currentStoreId) return;
    const storeId = currentStoreId;
    if (progressCelebrationFetches.has(storeId)) return;
    progressCelebrationFetches.add(storeId);
    try {
      const result = await api("/dashboard/progress-celebrations", {
        method: "POST",
        body: JSON.stringify({ storeId }),
      });
      if (storeId !== currentStoreId) return;
      const storeName = lastStores.find((store) => store.id === storeId)?.name || "Tu tienda";
      (result.newlyUnlockedLevels || []).forEach((levelIndex) => queueBirdUnlock(levelIndex, storeName, storeId));
    } catch {
      // Progress celebration must never block the operational dashboard.
    } finally {
      progressCelebrationFetches.delete(storeId);
    }
  }

  document.getElementById("birdUnlockContinue").addEventListener("click", () => document.getElementById("birdUnlockDialog").close());
  document.getElementById("birdUnlockDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    event.currentTarget.close();
  });
  document.getElementById("birdUnlockDialog").addEventListener("close", () => window.setTimeout(showNextBirdUnlock, 120));
  document.addEventListener("close", (event) => {
    if (event.target?.id !== "birdUnlockDialog") window.setTimeout(showNextBirdUnlock, 120);
  }, true);

  async function claimDailyLoginReward() {
    try {
      const reward = await api("/dashboard/daily-login-reward", { method: "POST" });
      dailyLoginReward = {
        awarded: reward?.awarded === true,
        totalStars: Math.max(0, Number(reward?.totalStars) || 0),
        wheelAvailable: reward?.wheelAvailable === true,
      };
      await rewards.load();
      if (lastFinances) renderGamification(lastFinances, { announce: false });
      if (dailyLoginReward.wheelAvailable && rewards.state()?.wheel.available && !luckWheelModalShownThisLoad) { luckWheelModalShownThisLoad = true; rewards.openWheelModal(); }
      if (!dailyLoginReward.awarded) return;

      const state = gamificationState(lastFinances);
      const companion = ADVENTURE_LEVELS[selectedGamificationCompanion(state.levelIndex)];
      const totalLabel = state.dailyLoginStars === 1 ? "tu primera estrella de constancia" : `${state.dailyLoginStars.toLocaleString("es-BO")} estrellas de constancia`;
      showGamificationToast(companion, "¡Ganaste 1 estrella!", `${companion.character} celebra que volviste hoy. Ya tienes ${totalLabel}.`);
    } catch {
      // A gamification reward must never block access to the operational dashboard.
    }
  }

  function gamificationCelebration(state, companion) {
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(gamificationSnapshotKey()) || "null"); } catch {}
    const snapshot = { xp: state.xp, levelIndex: state.levelIndex };
    try { localStorage.setItem(gamificationSnapshotKey(), JSON.stringify(snapshot)); } catch {}
    if (!previous || state.xp <= (Number(previous.xp) || 0)) return null;

    const gained = state.xp - (Number(previous.xp) || 0);
    if (state.levelIndex > (Number(previous.levelIndex) || 0)) {
      // The durable server claim owns level-up celebrations so they work on
      // another device and after an offline acquisition without duplicating.
      return null;
    }
    return { title: `¡+${gained.toLocaleString("es-BO")} XP!`, message: `${companion.character} te felicita: nuevas ventas o visitas acercaron tu tienda al siguiente nivel.` };
  }

  function renderGamificationMap(state) {
    renderAnimalAdventure(resolvedAdventureXp(state.xp), { commerce: state });
  }

  let topbarRenderedXp = null;
  let topbarRenderedScope = null;
  let topbarXpGainTimer = null;
  function renderTopbarXp(state, companion) {
    const bar = document.getElementById("topbarXp");
    const scope = gamificationStorageScope();
    const nextCopy = state.nextLevel ? `${(state.nextLevel.xpRequired - state.xp).toLocaleString("es-BO")} XP para nivel ${state.levelIndex + 2}` : "Nivel máximo";
    paintBlob(document.getElementById("topbarXpBlob"), String(companion.id), companionBlobHtml(companion));
    document.getElementById("topbarXpLevel").textContent = `Nivel ${state.levelIndex + 1} · ${state.level.name}`;
    document.getElementById("topbarXpNext").textContent = nextCopy;
    const track = document.getElementById("topbarXpTrack");
    track.setAttribute("aria-valuenow", String(state.progress));
    track.setAttribute("aria-valuetext", `${state.progress}% del nivel ${state.levelIndex + 1}. ${nextCopy}`);
    document.getElementById("topbarXpFill").style.transform = `scaleX(${state.progress / 100})`;
    bar.setAttribute("aria-label", `Nivel ${state.levelIndex + 1}, ${state.xp.toLocaleString("es-BO")} XP. ${nextCopy}. Ver tu progreso`);
    bar.hidden = false;
    const gained = topbarRenderedScope === scope && topbarRenderedXp !== null ? state.xp - topbarRenderedXp : 0;
    topbarRenderedXp = state.xp; topbarRenderedScope = scope;
    if (gained <= 0) return;
    const chip = document.getElementById("topbarXpGain");
    window.clearTimeout(topbarXpGainTimer);
    chip.textContent = `+${gained.toLocaleString("es-BO")} XP`;
    chip.hidden = true; bar.classList.remove("is-gaining");
    void bar.offsetWidth;
    chip.hidden = false; bar.classList.add("is-gaining");
    topbarXpGainTimer = window.setTimeout(() => { chip.hidden = true; bar.classList.remove("is-gaining"); }, 1600);
  }

  const CONFETTI_COLORS = ["#ffc956", "#f27a62", "#7fd3c3", "#818cf8", "#fff5bd", "#15352f"];
  function burstConfetti(origin, { count = 36, spread = 1 } = {}) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = origin?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    let remaining = count;
    for (let index = 0; index < count; index++) {
      const piece = document.createElement("span");
      piece.style.left = `${x}px`; piece.style.top = `${y}px`;
      piece.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
      if (index % 3 === 0) piece.style.borderRadius = "50%";
      layer.append(piece);
      const angle = Math.random() * Math.PI * 2;
      const distance = (90 + Math.random() * 190) * spread;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 80 * spread;
      piece.animate([
        { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${Math.random() * 540 - 270}deg)`, opacity: 1, offset: .55 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 160}px)) rotate(${Math.random() * 720 - 360}deg) scale(.6)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 600, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).finished.catch(() => {}).then(() => { if (--remaining === 0) layer.remove(); });
    }
  }

  // B1: repaint a static blob only when what it shows changed, so the 60-second refresh does not churn the DOM.
  function paintBlob(element, key, markup) {
    if (!element || element.dataset.blobKey === key) return;
    element.dataset.blobKey = key;
    element.innerHTML = markup;
  }

  // The Progreso hero is the one animated companion on the page (idle on hover, "cheer" on a Fiesta tip).
  let heroBlob = null;
  let heroBlobLevel = null;
  function mountHeroBlob(companion) {
    const host = document.getElementById("gamificationHeroBlob");
    if (!host || (heroBlob && heroBlobLevel === companion.id)) return;
    heroBlob?.destroy();
    heroBlob = mountBlob(host, { seed: companionSeed(companion), look: companion.look, expression: companion.expression, animate: "hover" });
    heroBlobLevel = companion.id;
  }

  function renderGamification(finances, { announce = true } = {}) {
    const state = gamificationState(finances);
    const selectedStore = lastStores.find((store) => store.id === currentStoreId);
    const storeName = finances?.scope?.storeName || selectedStore?.name || "tu negocio";
    const companionIndex = selectedGamificationCompanion(state.levelIndex);
    const companion = ADVENTURE_LEVELS[companionIndex];
    const achievementIds = announce ? pendingAchievementIds(state) : [];
    const celebration = announce ? gamificationCelebration(state, companion) : null;
    const speech = celebration?.message || defaultGamificationSpeech(state, storeName);
    const nextCopy = state.nextLevel
      ? `${(state.nextLevel.xpRequired - state.xp).toLocaleString("es-BO")} XP para ${state.nextLevel.name}`
      : "Nivel máximo alcanzado";

    paintBlob(document.getElementById("gamificationSummaryBlob"), `${companion.id}:hover`, companionBlobHtml(companion, { animate: "hover" }));
    mountHeroBlob(companion);

    document.getElementById("gamificationSummaryXp").textContent = `${state.xp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationSummarySpeech").textContent = speech;
    document.getElementById("gamificationSummaryLevel").textContent = `Nivel ${state.levelIndex + 1} · ${state.level.name}`;
    document.getElementById("gamificationSummaryNext").textContent = nextCopy;
    setGamificationProgress(document.getElementById("gamificationSummaryTrack"), state.progress);

    document.getElementById("gamificationLevelTitle").textContent = state.level.name;
    document.getElementById("gamificationLevelNumber").textContent = `Nivel ${state.levelIndex + 1} de ${ADVENTURE_LEVELS.length}`;
    document.getElementById("gamificationSpeech").textContent = speech;
    document.getElementById("gamificationXpTotal").textContent = `${state.xp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationXpNext").textContent = state.nextLevel ? `Te faltan ${nextCopy}` : nextCopy;
    document.getElementById("gamificationLevelFloor").textContent = `${state.level.xpRequired.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationLevelCeiling").textContent = state.nextLevel ? `${state.nextLevel.xpRequired.toLocaleString("es-BO")} XP` : "Nivel máximo";
    setGamificationProgress(document.getElementById("gamificationLevelTrack"), state.progress);
    document.getElementById("gamificationSalesXp").textContent = `${state.salesXp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationSalesSource").textContent = `${state.sales.toLocaleString("es-BO")} ${state.sales === 1 ? "venta" : "ventas"} × ${GAMIFICATION_XP_PER_SALE} XP`;
    document.getElementById("gamificationVisitsXp").textContent = `${state.visitsXp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationVisitsSource").textContent = `${state.visits.toLocaleString("es-BO")} ${state.visits === 1 ? "visita" : "visitas"} × ${GAMIFICATION_XP_PER_VISIT} XP`;
    document.getElementById("gamificationDailyStars").textContent = `${state.dailyLoginStars.toLocaleString("es-BO")} ${state.dailyLoginStars === 1 ? "estrella" : "estrellas"}`;
    document.getElementById("gamificationDailySource").textContent = dailyLoginReward.awarded ? "Ganaste 1 hoy · vuelve mañana" : "+1 por tu primer ingreso de cada día";

    document.getElementById("gamificationStarsSummary").textContent = `${state.earnedStars} de ${state.stars.length} estrellas ganadas con la actividad real de ${storeName}.`;
    document.getElementById("gamificationStars").innerHTML = state.stars.map((star) => `<article class="gamification-star${star.isEarned ? " is-earned" : ""}" data-achievement-id="${star.id}">
      ${GAMIFICATION_STAR_SVG}
      <strong>${esc(star.title)}</strong>
      <p>${esc(star.description)}</p>
      <span class="gamification-star-status">${star.isEarned ? "Ganada" : esc(star.progress(state))}</span>
    </article>`).join("");

    document.getElementById("gamificationCompanions").innerHTML = ADVENTURE_LEVELS.map((entry, index) => {
      const isLocked = index > state.levelIndex;
      const isSelected = index === companionIndex;
      const buttonLabel = isLocked ? `Se abre en nivel ${index + 1}` : isSelected ? "Acompañándote" : `Elegir a ${entry.character}`;
      return `<article class="gamification-companion${isLocked ? " is-locked" : ""}${isSelected ? " is-selected" : ""}">
        ${isLocked ? `<span class="gamification-companion-lock">Nivel ${index + 1}</span>` : ""}
        <div class="gamification-companion-art">${companionBlobHtml(entry, { expression: isLocked ? "sleepy" : entry.expression })}</div>
        <div class="gamification-companion-copy"><strong>${esc(entry.character)} · ${esc(entry.name)}</strong><span>${esc(entry.description)}</span><button type="button" data-companion-select="${index}" aria-pressed="${isSelected}"${isLocked ? " disabled" : ""}>${esc(buttonLabel)}</button></div>
      </article>`;
    }).join("");

    renderGamificationMap(state);
    renderTopbarXp(state, companion);
    rewards.renderWheel();
    if (activeGamificationAnnouncement?.achievementId) {
      document.querySelector(`[data-achievement-id="${activeGamificationAnnouncement.achievementId}"]`)?.classList.add("is-unlocking");
    }
    achievementIds.forEach((achievementId) => {
      const achievement = state.stars.find((star) => star.id === achievementId);
      if (!achievement) return;
      showGamificationToast(companion, "¡Logro desbloqueado!", `${companion.character} encontró “${achievement.title}”. ${achievement.description}`, achievement.id, gamificationStorageScope());
    });
    if (celebration) showGamificationToast(companion, celebration.title, celebration.message);
  }

  function renderFinances(finances) {
    lastFinances = finances;
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
    renderGamification(finances);
    void claimProgressCelebrations();
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
      // New sales may have earned a board roll; loading rewards pops the board when they did.
      void rewards.load();
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

  function inventoryFilenameKey(value) {
    let filename = String(value || "").trim();
    try { filename = decodeURIComponent(filename); } catch {}
    filename = filename.split(/[?#]/, 1)[0].replace(/\\/g, "/").split("/").pop() || filename;
    return filename.normalize("NFC").toLocaleLowerCase("es");
  }

  function inventoryStemKey(value) {
    return inventoryFilenameKey(value)
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function inventoryAutomaticImageMatches(name, codigoProducto, imageFiles, matchedImageFiles) {
    const nameKey = inventoryStemKey(name);
    const skuKey = inventoryStemKey(codigoProducto);
    const nameTokens = nameKey.split(" ").filter((token) => token.length >= 3);
    const candidates = imageFiles
      .filter((file) => !matchedImageFiles.has(file))
      .map((file) => {
        const stem = inventoryStemKey(file.name);
        let score = 0;
        if (skuKey && stem === skuKey) score = 100;
        else if (nameKey && stem === nameKey) score = 100;
        else if (skuKey && (stem.startsWith(`${skuKey} `) || stem.endsWith(` ${skuKey}`))) score = 92;
        else if (nameKey && (stem.startsWith(`${nameKey} `) || stem.endsWith(` ${nameKey}`))) score = 88;
        else if (nameTokens.length && nameTokens.every((token) => stem.includes(token))) score = 72;
        return { file, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.file.name.localeCompare(right.file.name, "es"));
    const strongMatches = candidates.filter((candidate) => candidate.score >= 88).slice(0, MAX_GALLERY_IMAGES);
    if (strongMatches.length) return strongMatches.map((candidate) => candidate.file);
    return candidates.length === 1 ? [candidates[0].file] : [];
  }

  function markDuplicateInventorySkus(rows) {
    const firstRowBySku = new Map();
    rows.forEach((row) => {
      const sku = row.product.codigoProducto;
      if (!sku) return;
      if (firstRowBySku.has(sku)) {
        row.errors.push(`El SKU ${sku} ya aparece en la fila ${firstRowBySku.get(sku)}`);
      } else {
        firstRowBySku.set(sku, row.rowNumber);
      }
    });
  }

  function prepareAiInventoryRows(products, imageFiles) {
    if (!Array.isArray(products) || products.length === 0) throw new Error("La IA no encontró productos en el archivo.");
    if (products.length > 100) throw new Error("La IA encontró más de 100 productos. Divide el archivo e intenta nuevamente.");
    const imagesByName = new Map();
    const imagesByStem = new Map();
    const matchedImageFiles = new Set();
    imageFiles.forEach((file) => {
      imagesByName.set(inventoryFilenameKey(file.name), file);
      const stem = inventoryStemKey(file.name);
      imagesByStem.set(stem, [...(imagesByStem.get(stem) || []), file]);
    });

    const rows = products.map((source, index) => {
      const errors = Array.isArray(source.errors) ? source.errors.map((value) => String(value)).filter(Boolean) : [];
      const name = String(source.name || "").trim();
      const codigoProducto = String(source.codigoProducto || "").trim();
      if (codigoProducto.length > 64) errors.push("El SKU supera 64 caracteres");
      if (codigoProducto && !/^[A-Za-z0-9._-]+$/.test(codigoProducto)) errors.push("El SKU solo admite letras, números, punto, guion y guion bajo");
      const requestedImages = Array.isArray(source.imageNames) ? source.imageNames.map((value) => String(value).trim()).filter(Boolean) : [];
      const matchedImages = requestedImages.map((filename) => {
        const exact = imagesByName.get(inventoryFilenameKey(filename));
        const stemMatches = imagesByStem.get(inventoryStemKey(filename)) || [];
        const file = exact || (stemMatches.length === 1 ? stemMatches[0] : undefined);
        if (!file) errors.push(`No se seleccionó la foto "${filename}"`);
        else matchedImageFiles.add(file);
        return file;
      }).filter(Boolean);
      if (requestedImages.length === 0 && name) {
        const automaticMatches = inventoryAutomaticImageMatches(name, codigoProducto, imageFiles, matchedImageFiles);
        automaticMatches.forEach((file) => matchedImageFiles.add(file));
        matchedImages.push(...automaticMatches);
      }
      matchedImages.forEach((file) => {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) errors.push(`Formato no admitido para "${file.name}"`);
        else if (file.size > MAX_IMAGE_BYTES) errors.push(`"${file.name}" supera 8 MB`);
      });
      const variants = Array.isArray(source.variants) ? source.variants : [];
      if (variants.length === 1) errors.push("Un producto con tamaños necesita por lo menos 2 opciones");
      return {
        rowNumber: Number.isInteger(source.sourceRow) ? source.sourceRow : index + 2,
        errors,
        imageFiles: matchedImages,
        product: {
          name,
          codigoProducto: codigoProducto || null,
          description: source.description || null,
          tags: Array.isArray(source.tags) ? source.tags : [],
          stock: variants.length ? null : source.stock ?? null,
          variants,
          categoryName: source.categoryName || undefined,
          color: source.color || null,
          amount: source.amount,
          currency: "BOB",
        },
      };
    });
    const unmatchedImageCount = imageFiles.filter((file) => !matchedImageFiles.has(file)).length;
    markDuplicateInventorySkus(rows);
    return {
      rows,
      warnings: unmatchedImageCount
        ? [`${unmatchedImageCount} ${unmatchedImageCount === 1 ? "foto no pudo relacionarse" : "fotos no pudieron relacionarse"} con un producto. Puedes renombrarlas con el nombre o SKU del producto y volver a adaptar el archivo.`]
        : [],
    };
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
  // Signed in, the same gradient sits behind every page; only one of the two runs at a time.
  let disposeDashboardShader = null;
  function startDashboardShader() {
    if (disposeDashboardShader) return;
    disposeDashboardShader = () => {};
    const host = document.querySelector("[data-dashboard-shader]");
    if (!host) return;
    import("/src/login-shader.mjs").then(async ({ mountLoginShader }) => {
      const dispose = await mountLoginShader(host, { still: true });
      if (document.body.classList.contains("is-logged-in")) disposeDashboardShader = dispose; else dispose();
    });
  }
  function stopDashboardShader() { disposeDashboardShader?.(); disposeDashboardShader = null; }

  function showLoggedOut() {
    const studioFrame = document.getElementById("merchantStudioFrame");
    studioFrame.removeAttribute("src"); delete studioFrame.dataset.storeId;
    dashboardRefreshVersion += 1;
    document.body.classList.add("is-logged-out");
    document.body.classList.remove("is-logged-in");
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
    currentProfileName = "";
    currentBlobSeed = "";
    if (profileMenuEl.matches(":popover-open")) profileMenuEl.hidePopover();
    loginFormEl.style.display = "grid";
    loggedInBarEl.style.display = "none";
    appEl.style.display = "none";
    stopDashboardShader();
    startLoginShader();
  }

  function showLoggedIn() {
    document.body.classList.remove("is-logged-out");
    document.body.classList.add("is-logged-in");
    loginFormEl.style.display = "none";
    stopLoginShader();
    startDashboardShader();
    loggedInBarEl.style.display = "flex";
    applyProfileIdentity();
    // The blob seed and the saved variation come from the sessions list; fetch it now, not only when the menu opens.
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
    if (sessionToken) await claimDailyLoginReward();
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
      const dashboardStatusLabels = { NOT_SUBMITTED: "Pendiente de envío", NOT_CONFIGURED: "Sin configurar" };
      kycBadge.textContent = paymentStore ? dashboardStatusLabels[kyc.status] || kyc.status : "No requerido para esta tienda";
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
      invBadge.textContent = paymentStore ? dashboardStatusLabels[invStatus] || invStatus : "No requerido para esta tienda";
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
    refresh().then(() => sessionToken ? claimDailyLoginReward() : undefined).finally(() => {
      if (sessionToken) infoEl.textContent = "";
    });
  } else {
    showLoggedOut();
  }
  setupMerchantGoogleSignIn();
  window.refresh = refresh;
  window.setDashboardView = setDashboardView;
  })();
