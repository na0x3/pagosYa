import { escapeHtml as esc } from "./html.mjs";
import { profileInitials } from "./profile-initials.mjs";
import { greetingFor } from "./overview.mjs";

/**
 * Perfil y sesiones: the profile menu, the active sessions and the profile picker shown after login (moved from
 * dashboard.js 2026-10-15, no behaviour change). create…() only looks things up; init() attaches the listeners and draws
 * the first avatar, as dashboard.js did at load.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   setButtonBusy                  dashboard.js helper
 *   emailEl                        the login email input
 *   elements                       the profile menu and session dialog elements, looked up by dashboard.js
 *   profileName(), setProfileName(name)
 *                                  the signed-in profile's display name, read and written at use time
 *   profileSessionsPayload(), setProfileSessionsPayload(payload)
 *                                  the loaded profile sessions, read and written at use time
 */
export function createProfileSessions(deps) {
  const { api, setButtonBusy, emailEl } = deps;
  const { loggedInAsEl, profileMenuEl, profileMenuTriggerEl, profileTriggerAvatarEl, profileMenuAvatarEl, accountAvatarEl, profileDisplayNameEl, profileSessionsEl, profileSessionCountEl, sessionProfileDialogEl, sessionProfileFormEl, sessionProfileExistingEl, sessionProfileChoicesEl, sessionProfileNameEl, sessionProfileErrorEl, sessionProfileContinueEl } = deps.elements;
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
    const name = deps.profileName() || profileNameFromEmail(emailEl.value);
    profileTriggerAvatarEl.innerHTML = initialsHtml(name);
    profileMenuAvatarEl.innerHTML = initialsHtml(name, false);
    if (accountAvatarEl) accountAvatarEl.innerHTML = initialsHtml(name);
  }

  function applyProfileIdentity() {
    const email = emailEl.value || "tu cuenta del panel";
    profileDisplayNameEl.textContent = deps.profileName() || profileNameFromEmail(email);
    loggedInAsEl.textContent = email;
    profileMenuTriggerEl.setAttribute("aria-label", `Abrir perfil de ${email}`);
    renderProfileAvatar();
    document.getElementById("overviewGreeting").textContent = greetingFor(new Date(), deps.profileName());
  }

  function applyCurrentSessionIdentity(session) {
    if (!session) return;
    deps.setProfileName(session.profileName || profileNameFromEmail(emailEl.value));
    profileDisplayNameEl.textContent = deps.profileName();
    renderProfileAvatar();
  }
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
    deps.setProfileSessionsPayload({ ...payload, limit, active, sessions });
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

  function init() {
    renderProfileAvatar();
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
        deps.setProfileName(profileName);
        profileDisplayNameEl.textContent = deps.profileName();
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
        renderProfileSessions(deps.profileSessionsPayload());
        profileSessionsEl.querySelector(`[data-session-edit-form="${CSS.escape(editingProfileSessionId)}"] input`)?.focus();
        return;
      }
      if (event.target.closest("[data-cancel-session-edit]")) {
        editingProfileSessionId = null;
        renderProfileSessions(deps.profileSessionsPayload());
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
  }

  return { init, applyProfileIdentity, loadProfileSessions, chooseProfileForNewLogin };
}
