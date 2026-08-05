import { PaymentMethodType } from "@pagosya/shared-types";
import { confirmPaymentIntent, fetchSession, simulateRailCallback, CheckoutSession } from "./api";
import { observeResize, postToParent } from "./postmessage";

const TEST_TOKENS: Record<PaymentMethodType, { label: string; value: string }[]> = {
  [PaymentMethodType.CARD]: [
    { label: "Visa (aprobada)", value: "tok_visa_success" },
    { label: "Visa (rechazada)", value: "tok_visa_decline" },
    { label: "Visa (error del adquirente)", value: "tok_visa_error" },
  ],
  [PaymentMethodType.TIGO_MONEY]: [
    { label: "Confirmación por USSD (demo)", value: "tok_tigo_demo" },
    { label: "Instantáneo (aprobado)", value: "tok_tigo_instant_success" },
    { label: "Rechazado", value: "tok_tigo_decline" },
  ],
  [PaymentMethodType.BANK_TRANSFER]: [
    { label: "Confirmación bancaria (demo)", value: "tok_bank_demo" },
    { label: "Instantáneo (aprobado)", value: "tok_bank_instant_success" },
    { label: "Rechazado", value: "tok_bank_decline" },
  ],
  [PaymentMethodType.QR]: [
    { label: "Escaneo QR (demo)", value: "tok_qr_demo" },
    { label: "Instantáneo (aprobado)", value: "tok_qr_instant_success" },
    { label: "Rechazado", value: "tok_qr_decline" },
  ],
};

const TAB_LABELS: Record<PaymentMethodType, string> = {
  [PaymentMethodType.CARD]: "Tarjeta",
  [PaymentMethodType.TIGO_MONEY]: "Tigo Money",
  [PaymentMethodType.BANK_TRANSFER]: "Transferencia",
  [PaymentMethodType.QR]: "QR",
};

const TAB_ICONS: Record<PaymentMethodType, string> = {
  [PaymentMethodType.CARD]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
  [PaymentMethodType.TIGO_MONEY]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
  [PaymentMethodType.BANK_TRANSFER]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v9M10 10v9M14 10v9M19 10v9"/><path d="M3 21h18"/></svg>',
  [PaymentMethodType.QR]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2"/></svg>',
};

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>';
const ICON_X =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.5 9.5l-5 5M9.5 9.5l5 5"/></svg>';
const ICON_CLOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 3"/></svg>';
const ICON_LOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

const app = document.getElementById("app")!;
let selectedType: PaymentMethodType = PaymentMethodType.CARD;

function formatAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const clientSecret = params.get("client_secret");

  if (!clientSecret) {
    app.innerHTML = `<div class="status failed">Falta client_secret en la URL.</div>`;
    return;
  }

  let session: CheckoutSession;
  try {
    session = await fetchSession(clientSecret);
  } catch (err) {
    app.innerHTML = `<div class="status failed">No se pudo cargar el pago: ${(err as Error).message}</div>`;
    return;
  }

  postToParent("CHECKOUT_READY", {});
  renderForm(session, clientSecret);
  observeResize(app);
}

function renderForm(session: CheckoutSession, clientSecret: string) {
  const tokens = TEST_TOKENS[selectedType];

  app.innerHTML = `
    <div class="amount">${formatAmount(session.amount, session.currency)}</div>
    <div class="description">${session.description ?? "Pago a comercio"}</div>
    <div class="tabs">
      ${Object.values(PaymentMethodType)
        .map(
          (type) =>
            `<button type="button" class="tab ${type === selectedType ? "active" : ""}" data-type="${type}">${TAB_ICONS[type]}<span>${TAB_LABELS[type]}</span></button>`,
        )
        .join("")}
    </div>
    <div class="field">
      <label for="token">Token de prueba (modo test)</label>
      <select id="token">
        ${tokens.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
      </select>
      <div class="hint">En producción este campo lo reemplaza el rail real (tokenización de tarjeta, deep link Tigo Money, etc).</div>
    </div>
    <button class="primary" id="pay">Pagar ${formatAmount(session.amount, session.currency)}</button>
    <div class="secure-note">${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span></div>
  `;

  app.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      selectedType = tab.dataset.type as PaymentMethodType;
      renderForm(session, clientSecret);
    });
  });

  app.querySelector<HTMLButtonElement>("#pay")!.addEventListener("click", async () => {
    const token = app.querySelector<HTMLSelectElement>("#token")!.value;
    await submitPayment(session, clientSecret, token);
  });
}

async function submitPayment(session: CheckoutSession, clientSecret: string, token: string) {
  const payButton = app.querySelector<HTMLButtonElement>("#pay");
  if (payButton) {
    payButton.disabled = true;
    payButton.textContent = "Procesando...";
  }
  postToParent("PAYMENT_PROCESSING", { paymentIntentId: session.id });

  try {
    const { paymentIntent, railResult } = await confirmPaymentIntent(session.id, clientSecret, {
      type: selectedType,
      token,
    });

    if (paymentIntent.status === "SUCCEEDED") {
      renderSuccess(paymentIntent.id);
    } else if (paymentIntent.status === "REQUIRES_ACTION") {
      renderRequiresAction(paymentIntent.id, paymentIntent.railId ?? "", railResult.actionRequired);
    } else {
      renderFailed(paymentIntent.id, railResult.failureReason ?? "Pago rechazado");
    }
  } catch (err) {
    renderFailed(session.id, (err as Error).message);
  }
}

function renderSuccess(paymentIntentId: string) {
  app.innerHTML = `<div class="status success">${ICON_CHECK}<span>Pago exitoso</span></div>`;
  postToParent("PAYMENT_SUCCEEDED", { paymentIntentId, status: "succeeded" });
}

function renderFailed(paymentIntentId: string, message: string) {
  app.innerHTML = `<div class="status failed">${ICON_X}<span>Pago fallido: ${message}</span></div>`;
  postToParent("PAYMENT_FAILED", { paymentIntentId, error: { message } });
}

function renderRequiresAction(paymentIntentId: string, railId: string, actionRequired: unknown) {
  const action = actionRequired as { type: string; data: Record<string, string> } | undefined;
  const message =
    action?.type === "ussd_prompt"
      ? action.data.message
      : action?.type === "qr_display"
        ? `Escanee el código QR: ${action.data.qrPayload}`
        : action?.type === "redirect"
          ? `Confirme en: ${action.data.redirectUrl}`
          : "Esperando confirmación...";

  app.innerHTML = `
    <div class="status action">${ICON_CLOCK}<span>${message}</span></div>
    ${import.meta.env.DEV ? `<button class="secondary" id="simulate">[dev] Simular confirmación exitosa</button>` : ""}
  `;

  if (import.meta.env.DEV) {
    app.querySelector<HTMLButtonElement>("#simulate")!.addEventListener("click", async () => {
      await simulateRailCallback(railId, paymentIntentId, "succeeded");
      renderSuccess(paymentIntentId);
    });
  }
}

main();
