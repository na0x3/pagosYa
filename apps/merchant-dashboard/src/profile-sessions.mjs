import { escapeHtml as esc } from "./html.mjs";
import { profileInitials } from "./profile-initials.mjs";
import { greetingFor } from "./overview.mjs";

/**
 * Perfil: the profile menu of the account's one owner (owner 2026-10-22: no per-session profiles, no «¿Quién está
 * ingresando?»). create…() only looks things up; init() attaches the listeners and draws the first avatar.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   emailEl                        the login email input
 *   elements                       the profile menu elements, looked up by dashboard.js
 *   profileName(), setProfileName(name)
 *                                  the signed-in profile's display name, read and written at use time
 *   profileSessionsPayload(), setProfileSessionsPayload(payload)
 *                                  the loaded sessions, read and written at use time
 */
export function profileNameFromEmail(email) {
  const localPart = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!localPart) return "Mi perfil";
  return localPart.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
}

/** One owner per account (owner 2026-10-22): the owner's name is the last real name the account used, else the email's. */
export function ownerName(payload, email) {
  const named = [...(payload?.profiles || []), ...(payload?.sessions || [])].map((session) => String(session?.profileName || "").trim())
    .find((name) => name && !["Seleccionar perfil", "Propietario", "Sin nombre"].includes(name));
  return named || profileNameFromEmail(email);
}

/** «Abierta en 3 dispositivos»; one device needs no line of its own. */
export function devicesLine(active) {
  return active > 1 ? `Abierta en ${active} dispositivos` : "Abierta solo en este dispositivo";
}

export function createProfileSessions(deps) {
  const { api, emailEl } = deps;
  const { loggedInAsEl, profileMenuEl, profileMenuTriggerEl, profileTriggerAvatarEl, profileMenuAvatarEl, accountAvatarEl, profileDisplayNameEl, profileSessionsEl } = deps.elements;

  /** A profile's picture is its initials. Where a heading or label already names the person it is decorative. */
  function initialsHtml(name, decorative = true) {
    return `<span class="profile-initials"${decorative ? ' aria-hidden="true"' : ` role="img" aria-label="${esc(name)}"`}>${esc(profileInitials(name))}</span>`;
  }

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

  function positionProfileMenu() {
    if (!profileMenuEl.matches(":popover-open")) return;
    const triggerRect = profileMenuTriggerEl.getBoundingClientRect();
    const gutter = 12;
    const width = Math.min(320, window.innerWidth - gutter * 2);
    const height = Math.min(profileMenuEl.scrollHeight, window.innerHeight - gutter * 2);
    profileMenuEl.style.left = `${Math.max(gutter, Math.min(triggerRect.right - width, window.innerWidth - width - gutter))}px`;
    profileMenuEl.style.top = `${Math.max(gutter, Math.min(triggerRect.bottom + 10, window.innerHeight - height - gutter))}px`;
  }

  function renderProfileSessions(payload) {
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    const active = Number.isFinite(Number(payload?.active)) ? Number(payload.active) : sessions.length;
    deps.setProfileSessionsPayload({ ...payload, active, sessions });
    deps.setProfileName(ownerName(payload, emailEl.value));
    profileDisplayNameEl.textContent = deps.profileName();
    renderProfileAvatar();
    const others = sessions.filter((session) => !session.current).length;
    profileSessionsEl.innerHTML = `<span>${esc(devicesLine(Math.max(active, 1)))}</span>${others ? ' · <button type="button" data-close-other-sessions>Cerrar las demás</button>' : ""}`;
    requestAnimationFrame(positionProfileMenu);
  }

  async function loadProfileSessions(showLoading = true) {
    if (showLoading) profileSessionsEl.textContent = "Revisando dispositivos…";
    try {
      const payload = await api("/dashboard/sessions");
      renderProfileSessions(payload);
      return payload;
    } catch (error) {
      profileSessionsEl.innerHTML = `No pudimos revisar tus dispositivos. <button type="button" data-retry-sessions>Reintentar</button>`;
      requestAnimationFrame(positionProfileMenu);
      throw error;
    }
  }

  /** After signing in: the owner's name, without asking who is signing in. */
  async function chooseProfileForNewLogin() {
    try { renderProfileSessions(await api("/dashboard/sessions")); } catch { /* the menu loads them when it opens */ }
  }

  function init() {
    renderProfileAvatar();
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
      const button = event.target.closest("[data-close-other-sessions]");
      if (!button) return;
      button.disabled = true;
      button.textContent = "Cerrando…";
      try {
        const others = (deps.profileSessionsPayload()?.sessions || []).filter((session) => !session.current);
        for (const session of others) await api(`/dashboard/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
        await loadProfileSessions(false);
      } catch (error) {
        profileSessionsEl.innerHTML = `No pudimos cerrar las demás. ${esc(error.message)} <button type="button" data-retry-sessions>Reintentar</button>`;
      }
    });
  }

  return { init, applyProfileIdentity, loadProfileSessions, chooseProfileForNewLogin };
}
