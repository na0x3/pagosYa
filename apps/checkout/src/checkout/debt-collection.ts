/** Paying a debt collection link. */
import { DebtCollectionInfo, fetchDebtCollection, lookupDebt, checkoutDebt } from "../api";
import { state } from "../state";
import { app } from "../ui/app";
import { ICON_X, ICON_LOCK, ICON_CHECK } from "../ui/icons";
import { escapeHtml, formatAmount } from "../ui/html";
import { enterPaymentFlow } from "./payment-form";


export async function renderDebtCollection(slug: string) {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page");
  document.body.classList.add("debt-collection-page");
  let info: DebtCollectionInfo;
  try {
    info = await fetchDebtCollection(slug);
  } catch (error) {
    app.innerHTML = `<div class="status failed">${ICON_X}<span>${escapeHtml((error as Error).message)}</span></div>`;
    return;
  }

  app.innerHTML = `
    <div class="debt-collection-heading">
      <span class="debt-company-label">${escapeHtml(info.companyName)}</span>
      <h1>${escapeHtml(info.collectionName)}</h1>
      <p>Escribe tu carnet para consultar el monto pendiente. El importe lo confirma la empresa y no puede editarse aquí.</p>
    </div>
    <form id="debt-lookup-form" class="debt-lookup-form" novalidate>
      <div class="field">
        <label for="debt-document">NIT / CI</label>
        <input id="debt-document" name="customerDocument" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="24" placeholder="Ej. 7845123" aria-describedby="debt-document-hint debt-lookup-error" required>
        <div class="hint" id="debt-document-hint">Escribe únicamente los números, sin extensión departamental.</div>
        <div class="field-error" id="debt-lookup-error" aria-live="polite"></div>
      </div>
      <button class="primary" type="submit" id="debt-lookup-submit">Consultar deuda</button>
    </form>
    <div id="debt-lookup-result" aria-live="polite"></div>
    <div class="secure-note debt-secure-note">${ICON_LOCK}<span>La consulta y el pago se procesan de forma segura por pagosYa</span></div>
  `;

  const form = app.querySelector<HTMLFormElement>("#debt-lookup-form")!;
  const input = app.querySelector<HTMLInputElement>("#debt-document")!;
  const error = app.querySelector<HTMLElement>("#debt-lookup-error")!;
  const result = app.querySelector<HTMLElement>("#debt-lookup-result")!;
  const submit = app.querySelector<HTMLButtonElement>("#debt-lookup-submit")!;
  input.addEventListener("input", () => {
    const digits = input.value.replace(/[^0-9]/g, "");
    if (input.value !== digits) input.value = digits;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customerDocument = input.value.trim();
    error.textContent = "";
    result.innerHTML = "";
    if (customerDocument.replace(/[^0-9]/g, "").length < 4) {
      error.textContent = "Escribe un carnet válido.";
      input.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = "Consultando…";
    try {
      const debt = await lookupDebt(slug, customerDocument);
      const pendingDebts = debt.debts.filter((item) => item.status === "pending");
      if (!pendingDebts.length) {
        result.innerHTML = `<div class="debt-result debt-result-paid"><div class="status success">${ICON_CHECK}<span>Todas tus deudas están pagadas</span></div><p>Si necesitas un comprobante, comunícate con ${escapeHtml(info.companyName)}.</p></div>`;
        return;
      }
      result.innerHTML = `
        <div class="debt-result">
          <div class="debt-result-row"><span>Cliente</span><strong>${escapeHtml(debt.customerLabel)}</strong></div>
          <fieldset class="debt-choice-list">
            <legend>Selecciona las deudas que quieres pagar</legend>
            ${debt.debts.map((item) => item.status === "paid" ? `
              <div class="debt-choice is-paid">
                <span class="debt-choice-check" aria-hidden="true">${ICON_CHECK}</span>
                <span class="debt-choice-copy"><strong>${escapeHtml(item.collectionName || item.description || "Deuda")}</strong><small>${escapeHtml(item.reference || item.description || "Pagada")}</small></span>
                <span class="debt-choice-amount">${formatAmount(item.amount, item.currency)}<small>Pagada</small></span>
              </div>` : `
              <label class="debt-choice">
                <input class="debt-choice-input" type="checkbox" value="${escapeHtml(item.id)}" checked>
                <span class="debt-choice-check" aria-hidden="true"></span>
                <span class="debt-choice-copy"><strong>${escapeHtml(item.collectionName || item.description || "Deuda pendiente")}</strong><small>${escapeHtml(item.reference || item.description || "Pendiente")}</small></span>
                <span class="debt-choice-amount">${formatAmount(item.amount, item.currency)}</span>
              </label>`).join("")}
          </fieldset>
          <div class="debt-result-total"><span id="debt-selection-label">Total seleccionado</span><strong id="debt-selection-total"></strong></div>
          <button class="primary" type="button" id="debt-pay">Continuar al pago</button>
        </div>`;
      const choices = Array.from(result.querySelectorAll<HTMLInputElement>(".debt-choice-input"));
      const payButton = result.querySelector<HTMLButtonElement>("#debt-pay")!;
      const selectionLabel = result.querySelector<HTMLElement>("#debt-selection-label")!;
      const selectionTotal = result.querySelector<HTMLElement>("#debt-selection-total")!;
      const updateSelection = () => {
        const selectedIds = new Set(choices.filter((choice) => choice.checked).map((choice) => choice.value));
        const selectedDebts = pendingDebts.filter((item) => selectedIds.has(item.id));
        const total = selectedDebts.reduce((sum, item) => sum + item.amount, 0);
        selectionLabel.textContent = `${selectedDebts.length} ${selectedDebts.length === 1 ? "deuda seleccionada" : "deudas seleccionadas"}`;
        selectionTotal.textContent = formatAmount(total, debt.currency);
        payButton.disabled = selectedDebts.length === 0;
        payButton.textContent = selectedDebts.length ? "Continuar al pago" : "Selecciona una deuda";
      };
      choices.forEach((choice) => choice.addEventListener("change", updateSelection));
      updateSelection();
      payButton.addEventListener("click", async (payEvent) => {
        const payButton = payEvent.currentTarget as HTMLButtonElement;
        const selectedDebtIds = choices.filter((choice) => choice.checked).map((choice) => choice.value);
        if (!selectedDebtIds.length) return;
        payButton.disabled = true;
        payButton.textContent = "Abriendo pago…";
        try {
          const checkout = await checkoutDebt(slug, customerDocument, selectedDebtIds);
          state.currentDebtSlug = slug;
          state.linkHeader = {
            storeName: checkout.companyName,
            description: checkout.description,
            contactEmail: checkout.contactEmail,
            contactPhone: checkout.contactPhone,
          };
          await enterPaymentFlow(checkout.clientSecret);
        } catch (checkoutError) {
          error.textContent = (checkoutError as Error).message;
          payButton.disabled = false;
          payButton.textContent = "Continuar al pago";
        }
      });
    } catch (lookupError) {
      error.textContent = (lookupError as Error).message;
    } finally {
      submit.disabled = false;
      submit.textContent = "Consultar deuda";
    }
  });
}
