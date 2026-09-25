/**
 * The customer's cobro page (`/d/:token`): the frozen cobro a merchant sent, with
 * Pagar (the existing checkout), the PDF and the store's contact. Same rules as
 * order tracking: no merchant scripts, noindex, every merchant string escaped.
 */
import "./cobro-page.css";
import { API_BASE_URL, assetUrl } from "../api";
import { markPrivateStorePage } from "../store-seo";
import { app } from "../ui/app";
import { ICON_CHECK, ICON_CLOCK, ICON_LOCK, ICON_WHATSAPP, ICON_X } from "../ui/icons";
import { renderProposalView, type ProposalView } from "./proposal-page";
import { renderContractView, type ContractView } from "./contract-page";

type Snapshot = {
  kind: string;
  numberLabel: string;
  title: string;
  currency: string;
  customer: { name: string | null; email: string | null; phone: string | null; document: string | null };
  items: Array<{ description: string; quantity: number; unitAmount: number; amount: number }>;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  dueAt: string | null;
  blocks: Array<{ type: string; title?: string; text?: string; items?: string[] }>;
};

type StoreView = { name: string; logoUrl: string | null; contactEmail?: string | null; contactPhone?: string | null };

export type CobroView =
  | {
      kind: string;
      numberLabel: string;
      /** SENT, VIEWED, OVERDUE, PAID or EXPIRED. */
      status: string;
      version: number;
      sentAt: string | null;
      updatedAfterFirstSend: boolean;
      store: StoreView;
      document: Snapshot;
      dueAt: string | null;
      paidAt: string | null;
      payable: boolean;
      preview: boolean;
    }
  | { kind: string; numberLabel: string; title: string; status: "VOIDED"; voidedAt: string | null; store: StoreView };

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string | number | null | undefined) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);

export function cobroMoney(amount: number, currency: string): string {
  const figure = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100);
  return `${currency === "USD" ? "US$" : "Bs"} ${figure}`;
}

export function cobroDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(new Date(value));
}

const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
};

/** wa.me needs the country code: an 8-digit Bolivian mobile (6…/7…) gets 591, like the dashboard's helper. */
export function whatsAppHref(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (/^[67]\d{7}$/.test(digits)) digits = `591${digits}`;
  return `https://wa.me/${digits}`;
}

function brandHtml(store: StoreView, numberLabel: string): string {
  const logo = assetUrl(store.logoUrl);
  // Only our own uploads or https images; anything else falls back to initials.
  const safeLogo = logo && /^(?:https:\/\/|http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(logo) ? logo : null;
  return `<header class="cobro-brand">
    <span class="cobro-logo" aria-hidden="true">${safeLogo ? `<img src="${esc(safeLogo)}" alt="">` : esc(initials(store.name))}</span>
    <span class="cobro-brand-copy"><small>Cobro de</small><strong>${esc(store.name)}</strong></span>
    <span class="cobro-number">${esc(numberLabel)}</span>
  </header>`;
}

function statusHtml(view: Extract<CobroView, { document: Snapshot }>): string {
  if (view.status === "PAID") {
    return `<p class="cobro-status is-paid">${ICON_CHECK}<span><strong>Pagado</strong>${view.paidAt ? ` el ${esc(cobroDate(view.paidAt))}` : ""}</span></p>`;
  }
  if (view.status === "EXPIRED") return `<p class="cobro-status is-closed">${ICON_X}<span><strong>Vencido</strong> · ya no se puede pagar en línea</span></p>`;
  if (view.status === "OVERDUE" || (view.dueAt && new Date(view.dueAt).getTime() < Date.now())) {
    return `<p class="cobro-status is-overdue">${ICON_CLOCK}<span><strong>Por pagar</strong> · Venció el ${esc(cobroDate(view.dueAt))}</span></p>`;
  }
  return `<p class="cobro-status is-open">${ICON_CLOCK}<span><strong>Por pagar</strong>${view.dueAt ? ` · Vence el ${esc(cobroDate(view.dueAt))}` : ""}</span></p>`;
}

function contactHtml(store: StoreView): string {
  const links = [
    store.contactPhone ? `<a href="${esc(whatsAppHref(store.contactPhone))}" target="_blank" rel="noopener noreferrer">${ICON_WHATSAPP}WhatsApp</a>` : "",
    store.contactEmail ? `<a href="mailto:${esc(store.contactEmail)}">Correo</a>` : "",
  ].filter(Boolean);
  if (!links.length) return "";
  return `<div class="cobro-contact"><span>¿Dudas sobre este cobro? Escríbele a ${esc(store.name)}.</span><div>${links.join("")}</div></div>`;
}

function blocksHtml(blocks: Snapshot["blocks"]): string {
  const rendered = blocks.map((block) => {
    const title = block.title ? `<h3>${esc(block.title)}</h3>` : "";
    const text = block.text ? `<p>${esc(block.text)}</p>` : "";
    const list = block.items?.length ? `<ul>${block.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
    return title + text + list;
  }).join("");
  return rendered ? `<section class="cobro-note" aria-label="Nota">${rendered}</section>` : "";
}

export function cobroPageHtml(view: CobroView, token: string): string {
  const pdfUrl = `${API_BASE_URL}/documents/public/${encodeURIComponent(token)}/pdf`;
  if (view.status === "VOIDED" || !("document" in view)) {
    const voided = view as Extract<CobroView, { status: "VOIDED" }>;
    return `<main class="cobro-shell" data-cobro-page>
      ${brandHtml(voided.store, voided.numberLabel)}
      <section class="cobro-card cobro-voided">
        <p class="cobro-status is-closed">${ICON_X}<span><strong>Anulado</strong>${voided.voidedAt ? ` el ${esc(cobroDate(voided.voidedAt))}` : ""}</span></p>
        <h1>${esc(voided.title)}</h1>
        <p>Este cobro ya no está vigente y no se puede pagar. Si crees que es un error, escríbele a ${esc(voided.store.name)}.</p>
      </section>
      <p class="cobro-security">${ICON_LOCK}<span>Enlace privado de ${esc(voided.store.name)} · cobro procesado por pagosYa</span></p>
    </main>`;
  }
  const doc = view.document;
  const total = cobroMoney(doc.totalAmount, doc.currency);
  const payButton = view.payable
    ? `<button type="button" class="cobro-pay" data-cobro-pay${view.preview ? " disabled" : ""}>Pagar ${esc(total)}</button>
       <p class="cobro-pay-hint">${view.preview ? "En la vista previa el botón no cobra." : "Con QR o tarjeta · pago seguro con pagosYa"}</p>
       <p class="cobro-pay-error" role="alert" data-cobro-pay-error hidden></p>`
    : view.status === "PAID"
      ? `<p class="cobro-thanks">¡Gracias! Este cobro ya está pagado. Tu comprobante llegó al correo que usaste al pagar.</p>`
      : "";
  const rows = doc.items.map((item) => `<li class="cobro-item">
      <span class="cobro-item-qty">${esc(item.quantity)}×</span>
      <span class="cobro-item-name">${esc(item.description)}<small>${esc(cobroMoney(item.unitAmount, doc.currency))} c/u</small></span>
      <strong>${esc(cobroMoney(item.amount, doc.currency))}</strong>
    </li>`).join("");
  const discount = doc.discountAmount > 0
    ? `<div><span>Subtotal</span><span>${esc(cobroMoney(doc.subtotalAmount, doc.currency))}</span></div>
       <div><span>Descuento</span><span>− ${esc(cobroMoney(doc.discountAmount, doc.currency))}</span></div>`
    : "";
  return `<main class="cobro-shell" data-cobro-page>
    ${view.preview ? `<p class="cobro-preview-banner" role="note"><strong>Vista previa</strong> · Así verá tu cliente este cobro. Abrirlo aquí no cuenta como visto.</p>` : ""}
    ${brandHtml(view.store, view.numberLabel)}
    <section class="cobro-card cobro-hero" aria-labelledby="cobro-title">
      ${statusHtml(view)}
      <h1 id="cobro-title">${esc(doc.title)}</h1>
      ${doc.customer.name ? `<p class="cobro-for">Para <strong>${esc(doc.customer.name)}</strong>${doc.customer.document ? ` · NIT/CI ${esc(doc.customer.document)}` : ""}</p>` : ""}
      <p class="cobro-total"><small>${view.status === "PAID" ? "Total pagado" : "Total a pagar"}</small><strong>${esc(total)}</strong></p>
      ${payButton}
    </section>
    ${view.updatedAfterFirstSend ? `<p class="cobro-updated">${esc(view.store.name)} actualizó este cobro; ves la versión más reciente.</p>` : ""}
    <section class="cobro-card" aria-labelledby="cobro-detail-title">
      <h2 id="cobro-detail-title">Detalle</h2>
      <ul class="cobro-items">${rows}</ul>
      <div class="cobro-totals">${discount}<div class="is-total"><span>Total</span><strong>${esc(total)}</strong></div></div>
    </section>
    ${blocksHtml(doc.blocks)}
    <div class="cobro-actions">
      <a class="cobro-pdf" data-cobro-pdf href="${esc(pdfUrl)}" target="_blank" rel="noopener">Descargar PDF</a>
    </div>
    ${contactHtml(view.store)}
    <p class="cobro-security">${ICON_LOCK}<span>Enlace privado · ${esc(view.numberLabel)} · versión ${esc(view.version)}. Solo quien tiene este enlace puede ver el cobro.</span></p>
  </main>`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function bindPay(token: string): void {
  const button = app.querySelector<HTMLButtonElement>("[data-cobro-pay]");
  const error = app.querySelector<HTMLElement>("[data-cobro-pay-error]");
  if (!button || button.disabled) return;
  const label = button.textContent ?? "Pagar";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Preparando el pago…";
    if (error) error.hidden = true;
    try {
      const response = await fetch(`${API_BASE_URL}/documents/public/${encodeURIComponent(token)}/pay`, { method: "POST", credentials: "omit", cache: "no-store" });
      const body = await readJson(response);
      if (!response.ok || typeof body.checkoutUrl !== "string") throw new Error(typeof body.message === "string" ? body.message : "No pudimos preparar el pago. Intenta de nuevo.");
      window.location.assign(body.checkoutUrl);
    } catch (failure) {
      button.disabled = false;
      button.textContent = label;
      if (error) {
        error.hidden = false;
        error.textContent = (failure as Error).message;
      }
    }
  });
}

export async function renderCobroPage(token: string): Promise<void> {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page", "debt-collection-page", "order-tracking-page", "proposal-document-page", "contract-document-page");
  document.body.classList.add("cobro-document-page");
  document.title = "Cobro — pagosYa";
  markPrivateStorePage();
  app.innerHTML = `<main class="cobro-shell cobro-loading" data-cobro-loading aria-busy="true"><span>Abriendo tu documento…</span></main>`;
  const preview = new URLSearchParams(window.location.search).get("preview");
  try {
    const response = await fetch(`${API_BASE_URL}/documents/public/${encodeURIComponent(token)}${preview ? `?preview=${encodeURIComponent(preview)}` : ""}`, { cache: "no-store", credentials: "omit" });
    const body = await readJson(response);
    if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "No pudimos abrir este cobro.");
    // The same link serves every document kind: a proposal (D2) has its own page.
    if (body.kind === "PROPOSAL") {
      renderProposalView(body as unknown as ProposalView, token);
      return;
    }
    // …and so does a contract (D3).
    if (body.kind === "CONTRACT") {
      renderContractView(body as unknown as ContractView, token);
      return;
    }
    const view = body as unknown as CobroView;
    document.title = `${view.numberLabel} · ${view.store.name}`;
    app.innerHTML = cobroPageHtml(view, token);
    bindPay(token);
  } catch (failure) {
    app.innerHTML = `<main class="cobro-shell" data-cobro-page>
      <section class="cobro-card cobro-error">
        <p class="cobro-status is-closed">${ICON_X}<span><strong>${esc((failure as Error).message)}</strong></span></p>
        <p>Revisa que hayas abierto el enlace completo que te enviaron. Si el problema sigue, pídele al comercio que te lo reenvíe.</p>
        <button type="button" class="cobro-retry" data-cobro-retry>Intentar de nuevo</button>
      </section>
    </main>`;
    app.querySelector<HTMLButtonElement>("[data-cobro-retry]")?.addEventListener("click", () => void renderCobroPage(token));
  }
}
