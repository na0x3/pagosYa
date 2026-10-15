import { escapeHtml as esc } from "./html.mjs";

/**
 * Cuenta: the account card, KYC, pagosYa's terms and the affiliation level (moved from dashboard.js 2026-10-15, no
 * behaviour change). create…() only looks things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   emailEl, errorEl, infoEl       the login email input and the dashboard's error and info banners
 *   profileMenuEl                  the profile menu popover
 *   setDashboardView, setButtonBusy, refresh
 *                                  dashboard.js functions this screen calls
 *   loadProfileSessions(...)       the profile panel's loader, reached through an arrow
 *   stores()                       the merchant's stores, read at use time
 *   profileSessionsPayload()       the loaded profile sessions, read at use time
 */
export function createAccountPanel(deps) {
  const { api, emailEl, errorEl, infoEl, profileMenuEl, setDashboardView, setButtonBusy, refresh, loadProfileSessions } = deps;
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
    count.textContent = String(deps.stores().length);
    list.innerHTML = deps.stores().slice(0, 5).map((store) => `<li><strong>${esc(store.name)}</strong><span>${esc(store.slug || "")}</span></li>`).join("")
      || '<li class="account-store-empty">Todavía no creaste ninguna tienda.</li>';

    // Sessions are only fetched when the profile popover opens, so the page asks
    // for them itself the first time it is shown.
    const countEl = document.getElementById("accountSessionCount");
    const paint = (payload) => { countEl.textContent = payload ? `${payload.active} / ${payload.limit}` : "No disponible"; };
    if (deps.profileSessionsPayload()) paint(deps.profileSessionsPayload());
    else {
      countEl.textContent = "…";
      loadProfileSessions(false).then(paint).catch(() => paint(null));
    }
  }

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

  function init() {
    document.getElementById("openAccountPage")?.addEventListener("click", () => {
      profileMenuEl.hidePopover();
      history.pushState(null, "", "#dashboard-account");
      setDashboardView("account");
      document.getElementById("dashboardWorkspace")?.scrollIntoView({ block: "start" });
    });
    document.getElementById("accountEditProfile")?.addEventListener("click", () => profileMenuEl.showPopover());
    document.getElementById("accountManageSessions")?.addEventListener("click", () => profileMenuEl.showPopover());
    document.getElementById("accountLogoutProxy")?.addEventListener("click", () => document.getElementById("logout")?.click());
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
  }

  return { init, renderAccount, renderLevel, renderTermsPrompt };
}
