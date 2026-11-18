import { escapeHtml as esc } from "./html.mjs";
import { BANKS, accountStatusLabel, currentAccounts } from "./payout-accounts.mjs";

export const bankOptionsHtml = () => `<option value="">Elige tu banco</option>${BANKS.map((bank) => `<option value="${bank.code}">${esc(bank.name)}</option>`).join("")}`;
const describe = (account) => `${esc(account.bankName ?? account.bankCode)} ····${esc(account.accountLast4)} · ${esc(account.holderName)}`;

/**
 * Desembolsos → "Cuenta para desembolsos" (payout account ownership): the account payouts go to, the one ops are
 * reviewing, a rejected change, and "Cambiar cuenta" (bank, number, holder, proof). A change pauses payouts until
 * ops approve it, then 72 hours more.
 */
export function mountPayoutAccountPanel({ api }) {
  const root = document.getElementById("payoutAccountPanel");
  let state = { approved: null, waiting: null, lastRejected: null };
  let formOpen = false;

  function render(error = "") {
    const { approved, waiting, lastRejected } = state;
    root.innerHTML = `
      <div class="section-head"><h2>Cuenta para desembolsos</h2></div>
      ${approved ? `<p><strong>${describe(approved)}</strong><br><span class="muted">${esc(accountStatusLabel(approved))}</span></p>` : '<p>Agrega tu cuenta bancaria con un comprobante para recibir desembolsos.</p>'}
      ${waiting ? `<p class="notice">Estamos revisando tu cuenta bancaria.<br><span class="muted">${describe(waiting)}</span></p>` : ""}
      ${lastRejected ? `<p class="notice error">Tu cambio de cuenta no fue aprobado: ${esc(lastRejected.reviewNote ?? "")}</p>` : ""}
      ${waiting ? "" : formOpen ? `
        <form id="payoutAccountForm">
          <label>Banco<select name="bankCode" required>${bankOptionsHtml()}</select></label>
          <label>Número de cuenta<input name="accountNumber" inputmode="numeric" required></label>
          <label>Titular (como aparece en el comprobante)<input name="holderName" required></label>
          <label>Certificado o captura de tu banco con tu nombre y el número de cuenta (JPG, PNG o PDF de 5 MB)<input name="proof" type="file" accept="image/png,image/jpeg,application/pdf" required></label>
          <p class="hint">Mientras revisamos el cambio, tus desembolsos se pausan. Te avisaremos por correo.</p>
          <p class="notice error" role="alert" id="payoutAccountError"${error ? "" : " hidden"}>${esc(error)}</p>
          <button class="primary" type="submit">Enviar cambio</button>
        </form>` : `<button type="button" class="secondary" id="payoutAccountChange">${approved ? "Cambiar cuenta" : "Agregar cuenta"}</button>`}`;
    root.querySelector("#payoutAccountChange")?.addEventListener("click", () => { formOpen = true; render(); });
    root.querySelector("#payoutAccountForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const errorEl = form.querySelector("#payoutAccountError");
      try {
        await api("/dashboard/payout_accounts", { method: "POST", body: new FormData(form) });
        formOpen = false;
        await load();
      } catch (cause) {
        // ISO M-09: a change takes the second factor. Ask for the code in place, keeping what was typed and the proof.
        if ((cause.code === "mfa_required" || cause.code === "mfa_invalid") && !form.querySelector("[name=mfaCode]")) {
          const label = document.createElement("label");
          label.innerHTML = 'Código de tu app de verificación<input name="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required>';
          form.insertBefore(label, errorEl);
          label.querySelector("input").focus();
        }
        errorEl.textContent = cause.message;
        errorEl.hidden = false;
      }
    });
  }

  async function load() {
    state = currentAccounts(await api("/dashboard/payout_accounts"));
    render();
  }

  return {
    async show() {
      try { await load(); } catch { root.innerHTML = ""; }
    },
    current() {
      return { ...state, waitingPayableFrom: state.approved?.payableFrom ?? undefined };
    },
  };
}
