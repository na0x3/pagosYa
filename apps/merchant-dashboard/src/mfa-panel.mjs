import { escapeHtml as esc } from "./html.mjs";

/**
 * Dinero → "Verificación en dos pasos" (ISO M-09): turn authenticator-app codes on (scan the QR, type the first code)
 * or off (type a current code). Once on, signing in and changing the payout account ask for a code.
 */
export function mountMfaPanel({ api }) {
  const root = document.getElementById("mfaPanel");
  let status = { enabled: false, requiredForPayoutChange: false };
  let setup = null;

  function render(message = "", isError = false) {
    root.innerHTML = `
      <div class="section-head"><h2>Verificación en dos pasos</h2></div>
      ${status.enabled
        ? `<p><strong>Activa.</strong> Al entrar y al cambiar tu cuenta de desembolsos te pedimos el código de tu app de verificación.</p>
           <form id="mfaDisableForm" class="inline">
             <label>Código actual para desactivarla<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></label>
             <button class="secondary" type="submit">Desactivar</button>
           </form>`
        : setup
          ? `<p>Escanea este código con Google Authenticator, Microsoft Authenticator, 1Password o Authy.</p>
             <img class="mfa-qr" src="${esc(setup.qrDataUrl)}" alt="Código QR para tu app de verificación" width="180" height="180">
             <p class="muted">¿No puedes escanear? Escribe esta clave en la app: <code>${esc(setup.secret)}</code></p>
             <form id="mfaConfirmForm" class="inline">
               <label>Primer código que muestra la app<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></label>
               <button class="primary" type="submit">Activar</button>
             </form>`
          : `<p>Protege tu cuenta y tus desembolsos: además de tu contraseña, te pediremos un código de 6 dígitos de tu teléfono.${status.requiredForPayoutChange ? " La necesitas para cambiar tu cuenta de desembolsos." : ""}</p>
             <button class="primary" type="button" id="mfaStart">Activar verificación en dos pasos</button>`}
      ${message ? `<p class="notice${isError ? " error" : ""}" role="${isError ? "alert" : "status"}">${esc(message)}</p>` : ""}`;
    root.querySelector("#mfaStart")?.addEventListener("click", async () => {
      try { setup = await api("/dashboard/mfa/setup", { method: "POST" }); render(); root.querySelector("input[name=code]")?.focus(); } catch (cause) { render(cause.message, true); }
    });
    root.querySelector("#mfaConfirmForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/dashboard/mfa/confirm", { method: "POST", body: JSON.stringify({ code: new FormData(event.currentTarget).get("code") }) });
        setup = null;
        status = { ...status, enabled: true };
        render("Listo: la verificación en dos pasos está activa.");
      } catch (cause) { render(cause.message, true); }
    });
    root.querySelector("#mfaDisableForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/dashboard/mfa/disable", { method: "POST", body: JSON.stringify({ code: new FormData(event.currentTarget).get("code") }) });
        status = { ...status, enabled: false };
        render("La verificación en dos pasos está desactivada.");
      } catch (cause) { render(cause.message, true); }
    });
  }

  return {
    async show() {
      try { status = await api("/dashboard/mfa"); render(); } catch { root.innerHTML = ""; }
    },
  };
}
