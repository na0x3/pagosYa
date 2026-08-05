import { PaymentMethodType } from "@pagosya/shared-types";
import {
  checkoutCart,
  confirmPaymentIntent,
  fetchSession,
  fetchStore,
  simulateRailCallback,
  CheckoutSession,
  Store,
  StoreItem,
} from "./api";
import { observeResize, postToParent } from "./postmessage";

interface LinkHeader {
  merchantName: string;
  description: string;
}

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
let linkHeader: LinkHeader | null = null;

function formatAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

// Payment Link name/description/merchant name are merchant-supplied and rendered via
// innerHTML — escape them so a malicious link can't script-inject into a customer's page.
function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const linkSlug = params.get("link");
  const clientSecret = params.get("client_secret");

  // Payment Links (no-code path): the URL carries a link slug instead of an
  // already-created client_secret. Any of a merchant's link slugs opens their
  // whole catalog (Store) — a customer buying several things adds them all
  // to one Cart and pays once, instead of needing a separate QR per item.
  if (linkSlug && !clientSecret) {
    try {
      const store = await fetchStore(linkSlug);
      renderStore(linkSlug, store);
      observeResize(app);
    } catch (err) {
      app.innerHTML = `<div class="status failed">Este link de pago ya no está disponible: ${(err as Error).message}</div>`;
    }
    return;
  }

  if (!clientSecret) {
    app.innerHTML = `<div class="status failed">Falta client_secret o link en la URL.</div>`;
    return;
  }

  await enterPaymentFlow(clientSecret);
}

async function enterPaymentFlow(clientSecret: string) {
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

// paymentLinkId -> quantity. Cleared on each store visit; nothing persists across reloads.
const cart = new Map<string, number>();

function cartTotal(items: StoreItem[]): number {
  return items.reduce((sum, item) => sum + item.amount * (cart.get(item.id) ?? 0), 0);
}

function cartCount(): number {
  return [...cart.values()].reduce((sum, qty) => sum + qty, 0);
}

function renderStore(slug: string, store: Store) {
  if (store.items.length === 0) {
    app.innerHTML = `<div class="status failed">Esta tienda no tiene productos disponibles todavía.</div>`;
    return;
  }
  const currency = store.items[0].currency;

  app.innerHTML = `
    <div class="merchant-header">${escapeHtml(store.merchantName)}</div>
    <div class="store-items">
      ${store.items
        .map((item) => {
          const qty = cart.get(item.id) ?? 0;
          return `
            <div class="store-item" data-id="${item.id}">
              ${item.imageUrl ? `<img class="store-item-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />` : `<div class="store-item-image placeholder"></div>`}
              <div class="store-item-info">
                <div class="store-item-name">${escapeHtml(item.name)}</div>
                ${item.description ? `<div class="store-item-description">${escapeHtml(item.description)}</div>` : ""}
                <div class="store-item-price">${formatAmount(item.amount, item.currency)}</div>
              </div>
              <div class="qty-stepper">
                <button type="button" class="qty-minus" ${qty === 0 ? "disabled" : ""}>−</button>
                <span class="qty-value">${qty}</span>
                <button type="button" class="qty-plus">+</button>
              </div>
            </div>`;
        })
        .join("")}
    </div>
    <div class="cart-bar">
      <span class="cart-summary">${cartCount()} ${cartCount() === 1 ? "producto" : "productos"} — ${formatAmount(cartTotal(store.items), currency)}</span>
      <button class="primary" id="cart-pay" ${cartCount() === 0 ? "disabled" : ""}>Ir a pagar</button>
    </div>
    <div class="secure-note">${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span></div>
  `;

  app.querySelectorAll<HTMLElement>(".store-item").forEach((row) => {
    const id = row.dataset.id!;
    row.querySelector(".qty-plus")!.addEventListener("click", () => {
      cart.set(id, (cart.get(id) ?? 0) + 1);
      renderStore(slug, store);
    });
    row.querySelector(".qty-minus")!.addEventListener("click", () => {
      const next = (cart.get(id) ?? 0) - 1;
      if (next <= 0) cart.delete(id);
      else cart.set(id, next);
      renderStore(slug, store);
    });
  });

  const payButton = app.querySelector<HTMLButtonElement>("#cart-pay");
  payButton?.addEventListener("click", async () => {
    payButton.disabled = true;
    payButton.textContent = "Procesando...";
    try {
      const items = [...cart.entries()].map(([paymentLinkId, quantity]) => ({ paymentLinkId, quantity }));
      const result = await checkoutCart(slug, items);
      linkHeader = { merchantName: result.merchantName, description: result.cartDescription };
      await enterPaymentFlow(result.clientSecret);
    } catch (err) {
      app.innerHTML = `<div class="status failed">No se pudo iniciar el pago: ${(err as Error).message}</div>`;
    }
  });
}

function renderForm(session: CheckoutSession, clientSecret: string) {
  const tokens = TEST_TOKENS[selectedType];

  const headerHtml = linkHeader
    ? `
      <div class="merchant-header">${escapeHtml(linkHeader.merchantName)}</div>
      <div class="amount">${formatAmount(session.amount, session.currency)}</div>
      <div class="description">${escapeHtml(linkHeader.description)}</div>
    `
    : `
      <div class="amount">${formatAmount(session.amount, session.currency)}</div>
      <div class="description">${session.description ? escapeHtml(session.description) : "Pago a comercio"}</div>
    `;

  app.innerHTML = `
    ${headerHtml}
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
  // Real bank QR (e.g. Baneco) returns a ready-to-scan PNG; the mock rail only has a raw
  // EMV-ish payload string to render as text — support both without the adapter caring.
  const qrImageHtml =
    action?.type === "qr_display" && action.data.qrImageBase64
      ? `<img class="qr-image" alt="Código QR" src="data:image/png;base64,${action.data.qrImageBase64}" />`
      : "";
  const message =
    action?.type === "ussd_prompt"
      ? action.data.message
      : action?.type === "qr_display"
        ? qrImageHtml
          ? "Escanee el código QR con su app bancaria"
          : `Escanee el código QR: ${action.data.qrPayload}`
        : action?.type === "redirect"
          ? `Confirme en: ${action.data.redirectUrl}`
          : "Esperando confirmación...";

  app.innerHTML = `
    <div class="status action">${ICON_CLOCK}<span>${message}</span></div>
    ${qrImageHtml}
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
