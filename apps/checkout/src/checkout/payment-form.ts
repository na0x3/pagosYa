/** The payment form: method tabs, contact fields, fulfillment, and submitting or canceling a payment. */
import { applyCheckoutBranding } from "../checkout-branding";
import { markPrivateStorePage } from "../store-seo";
import { PaymentMethodType } from "@pagosya/shared-types";
import { API_BASE_URL, CheckoutSession, fetchSession, fetchInternationalMethods, cancelPaymentIntent, CustomerContact, confirmPaymentIntent, type ApiError } from "../api";
import { fetchBuyerLegal, legalConfirmFields, legalNoticeHtml, type BuyerLegal } from "../legal-notice";
import { INTERNATIONAL_COUNTRIES, formatDualAmount, formatUsd, tokenForMethod } from "../international";
import { postToParent, observeResize } from "../postmessage";
import { closeSourcePaymentPreview } from "../source-payment-preview";
import { type DomesticMethodType, state } from "../state";
import { app } from "../ui/app";
import { escapeHtml, formatAmount, initials } from "../ui/html";
import { checkoutRecipientDetails, isStoreCheckout, renderSuccess, contactBlockHtml, backToStoreHtml, renderFailed, closePendingIntlPopup, renderRequiresAction } from "./payment-result";
import { customerContact, contactFieldErrors, EMAIL_PATTERN, PHONE_PATTERN } from "./customer-contact";
import { ICON_LOCK, ICON_X } from "../ui/icons";

export const DOMESTIC_METHOD_TYPES: DomesticMethodType[] = [
  PaymentMethodType.CARD,
  PaymentMethodType.TIGO_MONEY,
  PaymentMethodType.BANK_TRANSFER,
  PaymentMethodType.QR,
];

export const TEST_TOKENS: Record<DomesticMethodType, { label: string; value: string }[]> = {
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

export const TAB_LABELS: Record<DomesticMethodType, string> = {
  [PaymentMethodType.CARD]: "Tarjeta",
  [PaymentMethodType.TIGO_MONEY]: "Tigo Money",
  [PaymentMethodType.BANK_TRANSFER]: "Transferencia",
  [PaymentMethodType.QR]: "QR",
};

export const TAB_ICONS: Record<DomesticMethodType, string> = {
  [PaymentMethodType.CARD]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
  [PaymentMethodType.TIGO_MONEY]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
  [PaymentMethodType.BANK_TRANSFER]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v9M10 10v9M14 10v9M19 10v9"/><path d="M3 21h18"/></svg>',
  [PaymentMethodType.QR]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2"/></svg>',
};

export const sourcePaymentPreview = new URLSearchParams(window.location.search).get('source_payment_preview') === '1';

export async function enterPaymentFlow(clientSecret: string) {
  markPrivateStorePage();
  document.body.classList.remove("store-page", "product-detail-page", "debt-collection-page", "payment-success-page");
  document.body.classList.add("payment-page");
  let session: CheckoutSession;
  try {
    session = await fetchSession(clientSecret, state.checkoutPublishableKey);
    state.activeOrderTrackingToken = session.trackingToken ?? state.activeOrderTrackingToken;
  } catch (err) {
    app.innerHTML = `<div class="status failed">No se pudo cargar el pago: ${escapeHtml((err as Error).message)}</div>`;
    return;
  }

  applyCheckoutBranding(app, session.branding);
  const recipient = checkoutRecipientDetails(session);
  if (!isStoreCheckout(session) && recipient) {
    customerContact.name = recipient.name ?? "";
    customerContact.document = recipient.document ?? undefined;
    customerContact.email = recipient.email ?? "";
    customerContact.phone = recipient.phone ?? "";
  }

  postToParent("CHECKOUT_READY", {});
  if (session.status === "SUCCEEDED") renderSuccess(session);
  else renderForm(session, clientSecret);
  observeResize(app);
}
// pagosYa's buyer terms shown under Pay; loaded once, only when a payment form renders.
let buyerLegal: BuyerLegal | null = null;
let buyerLegalLoaded = false;
let buyerLegalRequest: Promise<BuyerLegal | null> | null = null;
function loadBuyerLegal(): Promise<BuyerLegal | null> {
  // The notice must never be able to break the payment form, whatever fails.
  buyerLegalRequest ??= Promise.resolve()
    .then(() => fetchBuyerLegal(API_BASE_URL))
    .catch(() => null)
    .then((legal) => {
      buyerLegal = legal;
      buyerLegalLoaded = true;
      return legal;
    });
  return buyerLegalRequest;
}

export function renderForm(session: CheckoutSession, clientSecret: string) {
  const domainPurchase = session.metadata?.platformPurchase === "domain";
  if (domainPurchase) state.selectedType = PaymentMethodType.QR;
  const brand = applyCheckoutBranding(app, session.branding);
  const tokens = TEST_TOKENS[state.selectedType];
  const storeCheckout = isStoreCheckout(session);
  const subscriptionCheckout = storeCheckout && (() => { try { return sessionStorage.getItem("pagosya_subscription_checkout") === "1"; } catch { return false; } })();
  document.body.classList.toggle('store-payment-page', storeCheckout || sourcePaymentPreview);
  const recipient = checkoutRecipientDetails(session);
  const fulfillment = session.metadata?.fulfillment as { method?: string; address?: string; locationName?: string } | undefined;
  const shipping = session.metadata?.shipping as { address?: string } | undefined;
  const confirmedMethod = shipping ? 'delivery' : fulfillment?.method;
  if (state.fulfillmentSessionId !== session.id) {
    state.fulfillmentSessionId = session.id;
    if (confirmedMethod === 'delivery' || confirmedMethod === 'pickup') {
      customerContact.deliveryRequested = confirmedMethod === 'delivery';
      customerContact.deliveryAddress = shipping?.address || fulfillment?.address || '';
    }
  }

  const headerHtml = brand ? `
      <div class="merchant-row">${brand.logoUrl ? `<img class="checkout-store-logo" src="${escapeHtml(brand.logoUrl)}" alt="" referrerpolicy="no-referrer">` : ''}<div class="merchant-name">${escapeHtml(brand.name)}</div></div>
      <p class="checkout-summary-label">Tu pedido</p>
      <div class="amount">${formatAmount(session.amount, session.currency)}</div>
      <div class="description">${escapeHtml(session.description || state.linkHeader?.description || 'Pago a ' + brand.name)}</div>
    ` : state.linkHeader
    ? `
      <div class="merchant-header">${escapeHtml(state.linkHeader.storeName)}</div>
      <div class="amount">${formatAmount(session.amount, session.currency)}</div>
      <div class="description">${escapeHtml(state.linkHeader.description)}</div>
    `
    : `
      <div class="merchant-row">
        <div class="merchant-avatar">${escapeHtml(initials(session.merchantName))}</div>
        <div class="merchant-name">${escapeHtml(session.merchantName)}</div>
      </div>
      <div class="amount">${formatAmount(session.amount, session.currency)}</div>
      <div class="description">${session.description ? escapeHtml(session.description) : "Pago a comercio"}</div>
    `;

  const fieldError = (id: keyof typeof contactFieldErrors) =>
    contactFieldErrors[id] ? `<div class="field-error" id="${id}Error">${escapeHtml(contactFieldErrors[id]!)}</div>` : `<div class="field-error" id="${id}Error"></div>`;
  const invalid = (id: keyof typeof contactFieldErrors) => (contactFieldErrors[id] ? ' aria-invalid="true"' : "");

  app.innerHTML = `
    <div class="payment-summary-panel">${sourcePaymentPreview ? '<p class="checkout-preview-notice" role="status">Vista previa · Sin cobros ni pedidos reales</p>' : ''}${headerHtml}</div>
    <div class="payment-form-panel">${storeCheckout || sourcePaymentPreview ? '<h1 class="payment-page-title">Completa tu pedido</h1>' : ''}<form id="payment-form" novalidate>
      ${storeCheckout
        ? `<div class="field">
            <label for="customerName">Nombre completo</label>
            <input id="customerName" type="text" autocomplete="name" placeholder="Nombre y apellido" value="${escapeHtml(customerContact.name)}" aria-describedby="customerNameError"${invalid("customerName")} />
            ${fieldError("customerName")}
          </div>
          <div class="field">
            <label for="customerEmail">Correo electrónico</label>
            <input id="customerEmail" type="email" autocomplete="email" placeholder="tu@gmail.com" value="${escapeHtml(customerContact.email)}" aria-describedby="customerEmailError"${invalid("customerEmail")}${subscriptionCheckout ? " required" : ""} />
            ${subscriptionCheckout ? '<p class="field-hint">Te enviaremos aquí los enlaces de tus próximas entregas.</p>' : ""}
            ${fieldError("customerEmail")}
          </div>
          <div class="field">
            <label for="customerPhone">Teléfono de contacto</label>
            <input id="customerPhone" type="tel" autocomplete="tel" placeholder="+591 700 00000" value="${escapeHtml(customerContact.phone)}" aria-describedby="customerPhoneError" enterkeyhint="done"${invalid("customerPhone")} />
            ${fieldError("customerPhone")}
            <div class="hint">El comercio usará estos datos para contactarte sobre tu pedido.</div>
          </div>
          <section class="delivery-request${customerContact.deliveryRequested ? " is-open" : ""}" aria-labelledby="delivery-request-title">
        ${confirmedMethod === 'pickup' || confirmedMethod === 'delivery' ? `<div class="delivery-request-toggle"><span><strong id="delivery-request-title">${confirmedMethod === 'pickup' ? 'Recoger en tienda' : 'Entrega a domicilio'}</strong>${fulfillment?.locationName ? `<small>${escapeHtml(fulfillment.locationName)}</small>` : ''}</span></div>` : `<label class="delivery-request-toggle" for="deliveryRequested">
          <span class="delivery-request-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
          <span><strong id="delivery-request-title">Quiero solicitar entrega</strong><small>Comparte una dirección y, si quieres, tu ubicación actual.</small></span>
          <input id="deliveryRequested" type="checkbox" ${customerContact.deliveryRequested ? "checked" : ""}>
        </label>`}
        <div class="delivery-request-fields" ${customerContact.deliveryRequested ? "" : "hidden"}>
          <div class="field">
            <label for="deliveryAddress">Dirección o referencia</label>
            <textarea id="deliveryAddress" rows="2" maxlength="300" autocomplete="street-address" placeholder="Zona, calle, número y una referencia" aria-describedby="deliveryAddressError"${invalid("deliveryAddress")}>${escapeHtml(customerContact.deliveryAddress || "")}</textarea>
            ${fieldError("deliveryAddress")}
          </div>
          <button class="location-capture" id="captureLocation" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>
            <span>${customerContact.customerLatitude !== undefined ? "Actualizar ubicación actual" : "Usar mi ubicación actual"}</span>
          </button>
          <p class="location-status" id="locationStatus" role="status" aria-live="polite">${customerContact.customerLatitude !== undefined && customerContact.customerLongitude !== undefined ? `Ubicación guardada con precisión aproximada de ${Math.round(customerContact.customerLocationAccuracy || 0)} m.` : "Solo la pediremos cuando pulses el botón. Puedes continuar escribiendo únicamente la dirección."}</p>
        </div>
      </section>`
        : `<div class="direct-charge-context" aria-label="Datos del cobro">
            ${recipient?.name ? `<div><span>Destinatario</span><strong>${escapeHtml(recipient.name)}</strong></div>` : ""}
            ${recipient?.document ? `<div><span>Carnet / CI</span><strong>${escapeHtml(recipient.document)}</strong></div>` : ""}
            <p>${recipient?.name ? "El comercio ya completó tus datos." : "El comercio ya preparó este cobro."} Solo elige cómo pagar.</p>
            ${state.internationalMode && !recipient?.email ? `<div class="field">
              <label for="customerEmail">Correo electrónico</label>
              <input id="customerEmail" type="email" autocomplete="email" placeholder="tu@gmail.com" value="${escapeHtml(customerContact.email)}" aria-describedby="customerEmailError"${invalid("customerEmail")} />
              ${fieldError("customerEmail")}
            </div>` : ""}
          </div>`}
      ${session.international?.available && !domainPurchase && !sourcePaymentPreview ? `
        <div class="intl-entry">
          <label class="intl-toggle"><input type="checkbox" id="intlToggle" ${state.internationalMode ? "checked" : ""}> ¿Pagas desde fuera de Bolivia?</label>
          ${state.internationalMode ? `
            <div class="field">
              <label for="intlCountry">País desde el que pagas</label>
              <select id="intlCountry">
                <option value="">Elige tu país</option>
                ${INTERNATIONAL_COUNTRIES.map((c) => `<option value="${c.code}" ${c.code === state.internationalCountry ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
              </select>
            </div>
            ${state.internationalError ? `<p class="intl-error" role="alert">${escapeHtml(state.internationalError)}</p>` : ""}
            ${state.internationalMethods && state.internationalMethods.methods.length === 0 ? `<p class="intl-error" role="alert">No hay métodos de pago disponibles para este país.</p>` : ""}
            ${state.internationalMethods && state.internationalMethods.methods.length > 0 ? `
              <p class="intl-quote">${escapeHtml(formatDualAmount(state.internationalMethods.quote.originalAmount, state.internationalMethods.quote.originalCurrency, state.internationalMethods.quote.amount))}</p>
              <div class="intl-methods" role="radiogroup" aria-label="Método de pago internacional">
                ${state.internationalMethods.methods.map((m) => `
                  <label class="intl-method">
                    <input type="radio" name="intlMethod" value="${escapeHtml(m.id)}" ${m.id === state.internationalMethodId ? "checked" : ""}>
                    ${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="" width="32" height="20" loading="lazy">` : ""}
                    <span>${escapeHtml(m.name)}</span>
                  </label>`).join("")}
              </div>
              <p class="hint">Serás redirigido para completar el pago de forma segura. Allí verás el monto final en tu moneda.</p>` : ""}
          ` : ""}
        </div>` : ""}
      ${state.internationalMode ? "" : `<div class="tabs">
        ${DOMESTIC_METHOD_TYPES
          .filter(type => !domainPurchase || type === PaymentMethodType.QR)
          .map(
            (type) =>
              `<button type="button" class="tab ${type === state.selectedType ? "active" : ""}" data-type="${type}">${TAB_ICONS[type]}<span>${TAB_LABELS[type]}</span></button>`,
          )
          .join("")}
      </div>`}
      ${
        state.internationalMode
          ? ""
          : import.meta.env.DEV && !sourcePaymentPreview
          ? `<div class="field">
              <label for="token">Token de prueba (modo test)</label>
              <select id="token">
                ${tokens.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
              </select>
              <div class="hint">En producción este campo lo reemplaza el rail real (tokenización de tarjeta, deep link Tigo Money, etc).</div>
            </div>`
          : ""
      }
      <button class="primary" type="submit" id="pay"${state.internationalMode && state.internationalMethods && state.internationalMethods.methods.length === 0 ? " disabled" : ""}>${sourcePaymentPreview ? 'Simular pago de' : 'Pagar'} ${state.internationalMode && state.internationalMethods ? formatUsd(state.internationalMethods.quote.amount) : formatAmount(session.amount, session.currency)}</button>
      <div id="legalNoticeSlot">${legalNoticeHtml(buyerLegal)}</div>
      <button class="secondary" type="button" id="cancel">Cancelar pago</button>
    </form></div>
    <div class="secure-note payment-secure-note">${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span></div>
  `;
  // A store-editor payment preview is a simulation and must not reach the API.
  if (!buyerLegalLoaded && !sourcePaymentPreview) {
    void loadBuyerLegal().then((legal) => {
      const slot = app.querySelector<HTMLDivElement>("#legalNoticeSlot");
      if (slot) slot.innerHTML = legalNoticeHtml(legal);
    });
  }

  const nameInput = app.querySelector<HTMLInputElement>("#customerName");
  const emailInput = app.querySelector<HTMLInputElement>("#customerEmail");
  const phoneInput = app.querySelector<HTMLInputElement>("#customerPhone");
  const deliveryToggle = app.querySelector<HTMLInputElement>("#deliveryRequested");
  const addressInput = app.querySelector<HTMLTextAreaElement>("#deliveryAddress");
  nameInput?.addEventListener("input", () => (customerContact.name = nameInput.value));
  emailInput?.addEventListener("input", () => (customerContact.email = emailInput.value));
  phoneInput?.addEventListener("input", () => (customerContact.phone = phoneInput.value));
  deliveryToggle?.addEventListener("change", () => {
    customerContact.deliveryRequested = deliveryToggle.checked;
    contactFieldErrors.deliveryAddress = undefined;
    renderForm(session, clientSecret);
    if (deliveryToggle.checked) requestAnimationFrame(() => app.querySelector<HTMLTextAreaElement>("#deliveryAddress")?.focus());
  });
  addressInput?.addEventListener("input", () => (customerContact.deliveryAddress = addressInput.value));
  app.querySelector<HTMLButtonElement>("#captureLocation")?.addEventListener("click", () => {
    const button = app.querySelector<HTMLButtonElement>("#captureLocation")!;
    const status = app.querySelector<HTMLElement>("#locationStatus")!;
    if (!navigator.geolocation) {
      status.textContent = "Este dispositivo no permite compartir ubicación. Escribe la dirección y una referencia.";
      return;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.querySelector("span")!.textContent = "Buscando ubicación…";
    status.textContent = "Tu navegador puede pedir permiso. pagosYa solo guardará esta ubicación con el pedido.";
    navigator.geolocation.getCurrentPosition((position) => {
      customerContact.customerLatitude = Number(position.coords.latitude.toFixed(7));
      customerContact.customerLongitude = Number(position.coords.longitude.toFixed(7));
      customerContact.customerLocationAccuracy = Math.round(position.coords.accuracy);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.querySelector("span")!.textContent = "Ubicación actual guardada";
      status.textContent = `Ubicación capturada con precisión aproximada de ${customerContact.customerLocationAccuracy} m. Puedes actualizarla antes de pagar.`;
    }, (error) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.querySelector("span")!.textContent = "Intentar compartir ubicación otra vez";
      status.textContent = error.code === error.PERMISSION_DENIED
        ? "No diste permiso para usar tu ubicación. Puedes continuar escribiendo la dirección."
        : "No pudimos obtener una ubicación precisa. Revisa la señal o escribe la dirección.";
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });

  app.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.selectedType = tab.dataset.type as DomesticMethodType;
      renderForm(session, clientSecret);
    });
  });

  app.querySelector<HTMLInputElement>("#intlToggle")?.addEventListener("change", (event) => {
    state.internationalMode = (event.target as HTMLInputElement).checked;
    state.internationalError = null;
    renderForm(session, clientSecret);
  });
  app.querySelector<HTMLSelectElement>("#intlCountry")?.addEventListener("change", async (event) => {
    state.internationalCountry = (event.target as HTMLSelectElement).value;
    state.internationalMethods = null;
    state.internationalMethodId = "";
    state.internationalError = null;
    if (state.internationalCountry) {
      try {
        state.internationalMethods = await fetchInternationalMethods(clientSecret, state.internationalCountry);
        state.internationalMethodId = state.internationalMethods.methods[0]?.id ?? "";
      } catch (err) {
        // A recoverable quote/availability failure shouldn't end the checkout —
        // show it inline next to the country picker so the shopper can retry.
        state.internationalError = (err as Error).message === "intl_fx_rate_unavailable"
          ? "Los pagos internacionales no están disponibles en este momento."
          : (err as Error).message;
      }
    }
    renderForm(session, clientSecret);
  });
  app.querySelectorAll<HTMLInputElement>('input[name="intlMethod"]').forEach((input) =>
    input.addEventListener("change", () => {
      state.internationalMethodId = input.value;
    }),
  );

  app.querySelector<HTMLFormElement>("#payment-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    contactFieldErrors.customerName = undefined;
    contactFieldErrors.customerEmail = undefined;
    contactFieldErrors.customerPhone = undefined;
    contactFieldErrors.deliveryAddress = undefined;

    const name = customerContact.name.trim();
    const email = customerContact.email.trim();
    const phone = customerContact.phone.trim();
    if (storeCheckout && !name) contactFieldErrors.customerName = "Ingresa tu nombre completo.";
    if (storeCheckout && !email) contactFieldErrors.customerEmail = "Ingresa tu correo electrónico.";
    else if (storeCheckout && !EMAIL_PATTERN.test(email)) contactFieldErrors.customerEmail = "Ingresa un correo electrónico válido.";
    if (storeCheckout && !phone) contactFieldErrors.customerPhone = "Ingresa un teléfono de contacto.";
    else if (storeCheckout && !PHONE_PATTERN.test(phone)) contactFieldErrors.customerPhone = "Ingresa un teléfono de contacto válido.";
    if (storeCheckout && customerContact.deliveryRequested && !(customerContact.deliveryAddress || "").trim()) contactFieldErrors.deliveryAddress = "Escribe la dirección o una referencia para la entrega.";
    if (state.internationalMode && !storeCheckout && !email) contactFieldErrors.customerEmail = "Ingresa tu correo para pagar desde el exterior.";

    if (contactFieldErrors.customerName || contactFieldErrors.customerEmail || contactFieldErrors.customerPhone || contactFieldErrors.deliveryAddress) {
      renderForm(session, clientSecret);
      return;
    }

    const tokenEl = app.querySelector<HTMLSelectElement>("#token");
    const token = tokenEl ? tokenEl.value : TEST_TOKENS[state.selectedType][0].value;
    await submitPayment(session, clientSecret, token, {
      name: storeCheckout ? name : recipient?.name ?? "",
      document: storeCheckout ? customerContact.document : recipient?.document ?? undefined,
      email: storeCheckout ? email : (recipient?.email || email),
      phone: storeCheckout ? phone : recipient?.phone ?? "",
      ...(storeCheckout && customerContact.deliveryRequested ? {
        deliveryRequested: true,
        deliveryAddress: (customerContact.deliveryAddress || "").trim(),
        ...(customerContact.customerLatitude !== undefined && customerContact.customerLongitude !== undefined ? {
          customerLatitude: customerContact.customerLatitude,
          customerLongitude: customerContact.customerLongitude,
          customerLocationAccuracy: customerContact.customerLocationAccuracy,
        } : {}),
      } : {}),
    });
  });

  app.querySelector<HTMLButtonElement>("#cancel")!.addEventListener("click", () => cancelPayment(clientSecret));
}

export async function cancelPayment(clientSecret: string) {
  if (sourcePaymentPreview) { closeSourcePaymentPreview(); return; }
  const payButton = app.querySelector<HTMLButtonElement>("#pay");
  const cancelButton = app.querySelector<HTMLButtonElement>("#cancel");
  if (payButton) payButton.disabled = true;
  if (cancelButton) {
    cancelButton.disabled = true;
    cancelButton.textContent = "Cancelando...";
  }

  try {
    const intent = await cancelPaymentIntent(clientSecret);
    app.innerHTML = `
      <div class="payment-outcome-panel">
        <div class="status failed">${ICON_X}<span>Pago cancelado</span></div>
        ${contactBlockHtml("¿Necesitas ayuda?")}
        ${backToStoreHtml()}
      </div>
    `;
    postToParent("PAYMENT_CANCELED", { paymentIntentId: intent.id });
  } catch (err) {
    // The intent may have already moved past a cancelable state (e.g. a
    // confirm that was in flight completed first) — re-fetch and show what
    // actually happened instead of a misleading "canceled" screen.
    try {
      const session = await fetchSession(clientSecret, state.checkoutPublishableKey);
      if (session.status === "SUCCEEDED") renderSuccess(session);
      else renderFailed(session.id, (err as Error).message);
    } catch {
      renderFailed("", (err as Error).message);
    }
  }
}

export async function submitPayment(session: CheckoutSession, clientSecret: string, token: string, customer: CustomerContact) {
  if (sourcePaymentPreview) {
    renderSuccess({ ...session, customerName: customer.name }, true);
    return;
  }

  const selectedIntl = state.internationalMode ? state.internationalMethods?.methods.find((m) => m.id === state.internationalMethodId) : undefined;
  if (state.internationalMode && (!state.internationalCountry || !selectedIntl)) {
    // Recoverable — the shopper just hasn't finished picking a country/method
    // yet (or the list came back empty). Show it inline instead of ending
    // the checkout, and do it before PAYMENT_PROCESSING fires.
    state.internationalError = "Elige tu país y un método de pago.";
    renderForm(session, clientSecret);
    return;
  }

  // Open the dLocal window here — still synchronous from the "submit" event
  // (the form's submit handler never awaits before calling submitPayment,
  // and everything above this line is synchronous too), so it still counts
  // as opened from the shopper's click/tap for Safari's popup blocker. The
  // real redirect URL isn't known until confirmPaymentIntent resolves below,
  // so this opens a blank tab now and renderRequiresAction points it at the
  // real URL once the rail returns one.
  if (state.internationalMode && window.top !== window.self) {
    state.pendingIntlPopup = window.open("about:blank", "_blank");
    // Cut the popup's link back to the checkout before it navigates to a third party.
    if (state.pendingIntlPopup) state.pendingIntlPopup.opener = null;
  }

  const payButton = app.querySelector<HTMLButtonElement>("#pay");
  if (payButton) {
    payButton.disabled = true;
    payButton.textContent = "Procesando...";
  }
  postToParent("PAYMENT_PROCESSING", { paymentIntentId: session.id });

  try {
    // Send exactly the versions the notice under Pay is showing. Never wait for the
    // legal fetch here: if it hasn't landed, no notice was shown and nothing is sent.
    const shownLegal = buyerLegalLoaded ? buyerLegal : null;
    const { paymentIntent, railResult } = await confirmPaymentIntent(
      session.id,
      clientSecret,
      selectedIntl ? tokenForMethod(selectedIntl) : { type: state.selectedType, token },
      customer,
      selectedIntl ? { rail: "dlocal", country: state.internationalCountry } : undefined,
      legalConfirmFields(shownLegal),
    );

    if (paymentIntent.status === "SUCCEEDED") {
      closePendingIntlPopup();
      renderSuccess(paymentIntent);
    } else if (paymentIntent.status === "REQUIRES_ACTION") {
      renderRequiresAction(paymentIntent.id, clientSecret, paymentIntent.railId ?? "", railResult.actionRequired);
    } else {
      closePendingIntlPopup();
      renderFailed(paymentIntent.id, railResult.failureReason ?? "Pago rechazado");
    }
  } catch (err) {
    closePendingIntlPopup();
    // Show the API's own message verbatim only for the merchant-limit
    // refusal — that copy is deliberately neutral and must not be wrapped
    // in extra text. Every other confirm-time error (network failures,
    // other 4xx/5xx) keeps the normal "Pago fallido: " prefix.
    const code = (err as ApiError).code;
    const isLimitRefusal = code === "limit_exceeded" || code === "per_payment_limit_exceeded";
    renderFailed(session.id, (err as Error).message, !isLimitRefusal);
  }
}
