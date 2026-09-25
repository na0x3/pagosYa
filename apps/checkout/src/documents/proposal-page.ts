/**
 * The customer's proposal page (`/d/:token`, kind PROPOSAL): the frozen proposal a merchant
 * sent, read like a document — sections, the investment, how long it is valid — with
 * "Aceptar propuesta" (name + email, recorded with the exact version) and "Pedir cambios".
 * Same rules as the cobro page: no merchant scripts, noindex, every string escaped.
 */
import "./proposal-page.css";
import { API_BASE_URL, assetUrl } from "../api";
import { app } from "../ui/app";
import { ICON_CHECK, ICON_CLOCK, ICON_LOCK, ICON_WHATSAPP, ICON_X } from "../ui/icons";
import { cobroDate, cobroMoney, whatsAppHref } from "./cobro-page";

type Block = { type: string; title?: string; text?: string; items?: string[] };

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
  validUntil: string | null;
  blocks: Block[];
};

type StoreView = { name: string; logoUrl: string | null; contactEmail?: string | null; contactPhone?: string | null };

export type ProposalView =
  | {
      kind: "PROPOSAL";
      numberLabel: string;
      /** SENT, VIEWED, CHANGES_REQUESTED, ACCEPTED or EXPIRED. */
      status: string;
      version: number;
      sha256?: string;
      sentAt: string | null;
      updatedAfterFirstSend: boolean;
      store: StoreView;
      document: Snapshot;
      preview: boolean;
      validUntil: string | null;
      acceptable: boolean;
      acceptance: { name: string; at: string } | null;
      changesRequestedAt: string | null;
    }
  | { kind: "PROPOSAL"; numberLabel: string; title: string; status: "VOIDED"; voidedAt: string | null; store: StoreView };

type OpenView = Extract<ProposalView, { document: Snapshot }>;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string | number | null | undefined) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
};

/** "quedan 9 días", "queda 1 día", "vence hoy" — whole days left before the end of validity. */
export function validityLeft(validUntil: string, now = Date.now()): string {
  const days = Math.floor((new Date(validUntil).getTime() - now) / DAY_MS);
  if (days <= 0) return "vence hoy";
  return days === 1 ? "queda 1 día" : `quedan ${days} días`;
}

function brandHtml(store: StoreView, numberLabel: string): string {
  const logo = assetUrl(store.logoUrl);
  const safeLogo = logo && /^(?:https:\/\/|http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(logo) ? logo : null;
  return `<header class="proposal-brand">
    <span class="proposal-logo" aria-hidden="true">${safeLogo ? `<img src="${esc(safeLogo)}" alt="">` : esc(initials(store.name))}</span>
    <span class="proposal-brand-copy"><small>Propuesta de</small><strong>${esc(store.name)}</strong></span>
    <span class="proposal-number">${esc(numberLabel)}</span>
  </header>`;
}

function statusHtml(view: OpenView): string {
  if (view.status === "ACCEPTED" && view.acceptance) {
    return `<p class="proposal-status is-accepted" data-proposal-status>${ICON_CHECK}<span><strong>Aceptada</strong> por ${esc(view.acceptance.name)} el ${esc(cobroDate(view.acceptance.at))}</span></p>`;
  }
  if (view.status === "EXPIRED") {
    return `<p class="proposal-status is-closed" data-proposal-status>${ICON_X}<span><strong>Vencida</strong>${view.validUntil ? ` el ${esc(cobroDate(view.validUntil))}` : ""}</span></p>`;
  }
  if (view.status === "CHANGES_REQUESTED") {
    return `<p class="proposal-status is-changes" data-proposal-status>${ICON_CLOCK}<span><strong>Cambios pedidos</strong> · ${esc(view.store.name)} está revisando tu mensaje</span></p>`;
  }
  return `<p class="proposal-status is-open" data-proposal-status>${ICON_CLOCK}<span><strong>Esperando tu respuesta</strong></span></p>`;
}

function validityHtml(view: OpenView): string {
  if (!view.validUntil || !view.acceptable) return "";
  const end = new Date(view.validUntil).getTime();
  const start = view.sentAt ? new Date(view.sentAt).getTime() : end - 15 * DAY_MS;
  const left = Math.max(0, Math.min(1, (end - Date.now()) / Math.max(1, end - start)));
  const soon = end - Date.now() < 3 * DAY_MS;
  return `<div class="proposal-validity${soon ? " is-soon" : ""}">
      <p data-proposal-validity>Válida hasta el ${esc(cobroDate(view.validUntil))} · ${esc(validityLeft(view.validUntil))}</p>
      <span class="proposal-meter" aria-hidden="true"><span style="width:${Math.round(left * 100)}%"></span></span>
    </div>`;
}

function itemsHtml(doc: Snapshot): string {
  if (!doc.items.length) return "";
  const rows = doc.items.map((item) => `<li class="proposal-item">
      <span class="proposal-item-name">${esc(item.description)}<small>${esc(item.quantity)} × ${esc(cobroMoney(item.unitAmount, doc.currency))}</small></span>
      <strong>${esc(cobroMoney(item.amount, doc.currency))}</strong>
    </li>`).join("");
  const discount = doc.discountAmount > 0
    ? `<div><span>Subtotal</span><span>${esc(cobroMoney(doc.subtotalAmount, doc.currency))}</span></div>
       <div><span>Descuento</span><span>− ${esc(cobroMoney(doc.discountAmount, doc.currency))}</span></div>`
    : "";
  return `<ul class="proposal-items">${rows}</ul>
    <div class="proposal-totals">${discount}<div class="is-total"><span>Inversión total</span><strong>${esc(cobroMoney(doc.totalAmount, doc.currency))}</strong></div></div>`;
}

function blockBodyHtml(block: Block): string {
  const text = block.text ? `<p>${esc(block.text)}</p>` : "";
  if (!block.items?.length) return text;
  if (/cronograma|plazos|calendario/i.test(block.title ?? "")) {
    const steps = block.items.map((line) => {
      const [when, ...rest] = line.split(" — ");
      return rest.length
        ? `<li><span class="proposal-when">${esc(when)}</span><span>${esc(rest.join(" — "))}</span></li>`
        : `<li><span>${esc(line)}</span></li>`;
    }).join("");
    return `${text}<ol class="proposal-timeline">${steps}</ol>`;
  }
  return `${text}<ul class="proposal-list">${block.items.map((item) => `<li>${ICON_CHECK}<span>${esc(item)}</span></li>`).join("")}</ul>`;
}

/** The document body: every block as a numbered section; the items sit under "Inversión". */
function sectionsHtml(doc: Snapshot): string {
  const investmentIndex = doc.blocks.findIndex((block) => /inversi/i.test(block.title ?? ""));
  const sections = doc.blocks.map((block, index) => ({ block, withItems: index === investmentIndex }));
  if (investmentIndex < 0 && doc.items.length) sections.push({ block: { type: "paragraph", title: "Inversión" }, withItems: true });
  return sections.map(({ block, withItems }, index) => `<section class="proposal-section is-${esc(block.type)}"${withItems ? " data-proposal-investment" : ""}>
      <p class="proposal-section-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</p>
      ${block.title ? `<h2>${esc(block.title)}</h2>` : ""}
      ${blockBodyHtml(block)}
      ${withItems ? itemsHtml(doc) : ""}
    </section>`).join("");
}

function contactHtml(store: StoreView): string {
  const links = [
    store.contactPhone ? `<a href="${esc(whatsAppHref(store.contactPhone))}" target="_blank" rel="noopener noreferrer">${ICON_WHATSAPP}WhatsApp</a>` : "",
    store.contactEmail ? `<a href="mailto:${esc(store.contactEmail)}">Correo</a>` : "",
  ].filter(Boolean);
  if (!links.length) return "";
  return `<div class="proposal-contact"><span>¿Preguntas? Escríbele a ${esc(store.name)}.</span><div>${links.join("")}</div></div>`;
}

/** The decision: accept, ask for changes, or — when it is closed — why and what to do. */
function decisionHtml(view: OpenView): string {
  if (view.status === "ACCEPTED") {
    return `<section class="proposal-card proposal-accepted" data-proposal-accepted aria-live="polite">
      <span class="proposal-accepted-mark" aria-hidden="true">${ICON_CHECK}</span>
      <h2>¡Propuesta aceptada!</h2>
      <p>${view.acceptance ? `${esc(view.acceptance.name)} la aceptó el ${esc(cobroDate(view.acceptance.at))}. ` : ""}Le avisamos a ${esc(view.store.name)}: te contactará para los siguientes pasos y, cuando corresponda, te enviará el cobro.</p>
    </section>`;
  }
  if (!view.acceptable) {
    return `<section class="proposal-card proposal-closed">
      <h2>Esta propuesta ya no está vigente</h2>
      <p>Pídele a ${esc(view.store.name)} una propuesta actualizada.</p>
    </section>`;
  }
  const disabled = view.preview ? " disabled" : "";
  const total = view.document.totalAmount > 0 ? cobroMoney(view.document.totalAmount, view.document.currency) : null;
  return `<section class="proposal-card proposal-decision" id="responder" aria-labelledby="proposalDecisionTitle">
    <h2 id="proposalDecisionTitle">¿Qué te parece?</h2>
    <p class="proposal-muted">Aceptar no te cobra nada: ${esc(view.store.name)} recibe tu respuesta y te envía los siguientes pasos.</p>
    <div class="proposal-actions">
      <button type="button" class="proposal-accept" data-proposal-accept-open${disabled}>Aceptar propuesta${total ? ` · ${esc(total)}` : ""}</button>
      <button type="button" class="proposal-secondary" data-proposal-changes-open${disabled}>Pedir cambios</button>
    </div>
    ${view.preview ? `<p class="proposal-muted">En la vista previa los botones no responden.</p>` : ""}
    <form class="proposal-form" data-proposal-accept-form hidden novalidate>
      <h3>Acepta con tu nombre</h3>
      <label for="proposalAcceptName">Tu nombre completo</label>
      <input id="proposalAcceptName" name="name" autocomplete="name" maxlength="120" required>
      <label for="proposalAcceptEmail">Tu correo</label>
      <input id="proposalAcceptEmail" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required value="${esc(view.document.customer.email ?? "")}">
      <p class="proposal-consent">Al aceptar confirmas que leíste la versión ${esc(view.version)} de esta propuesta. Guardamos tu nombre, tu correo, la fecha y los datos de tu conexión como constancia.</p>
      <p class="proposal-form-error" role="alert" data-proposal-form-error></p>
      <button type="submit" class="proposal-accept" data-proposal-accept-submit>Aceptar y confirmar</button>
    </form>
    <form class="proposal-form" data-proposal-changes-form hidden novalidate>
      <h3>¿Qué te gustaría cambiar?</h3>
      <label for="proposalChangesMessage">Tu mensaje</label>
      <textarea id="proposalChangesMessage" name="message" rows="4" maxlength="2000" required placeholder="Ej.: ¿Pueden incluir el envío? ¿Se puede entregar antes?"></textarea>
      <div class="proposal-two">
        <div><label for="proposalChangesName">Tu nombre</label><input id="proposalChangesName" name="name" autocomplete="name" maxlength="120"></div>
        <div><label for="proposalChangesEmail">Tu correo (para responderte)</label><input id="proposalChangesEmail" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required value="${esc(view.document.customer.email ?? "")}"></div>
      </div>
      <p class="proposal-form-error" role="alert" data-proposal-form-error></p>
      <button type="submit" class="proposal-secondary is-strong" data-proposal-changes-submit>Enviar pedido de cambios</button>
    </form>
  </section>`;
}

export function proposalPageHtml(view: ProposalView, token: string): string {
  if (view.status === "VOIDED" || !("document" in view)) {
    const voided = view as Extract<ProposalView, { status: "VOIDED" }>;
    return `<main class="proposal-shell" data-proposal-page>
      ${brandHtml(voided.store, voided.numberLabel)}
      <section class="proposal-card proposal-hero">
        <p class="proposal-status is-closed" data-proposal-status>${ICON_X}<span><strong>Anulada</strong>${voided.voidedAt ? ` el ${esc(cobroDate(voided.voidedAt))}` : ""}</span></p>
        <h1>${esc(voided.title)}</h1>
        <p class="proposal-muted">Esta propuesta ya no está vigente. Si tienes dudas, escríbele a ${esc(voided.store.name)}.</p>
      </section>
      <p class="proposal-security">${ICON_LOCK}<span>Enlace privado de ${esc(voided.store.name)} · con pagosYa</span></p>
    </main>`;
  }
  const doc = view.document;
  const pdfUrl = `${API_BASE_URL}/documents/public/${encodeURIComponent(token)}/pdf`;
  const total = doc.totalAmount > 0 ? cobroMoney(doc.totalAmount, doc.currency) : null;
  const sticky = view.acceptable && !view.preview
    ? `<div class="proposal-sticky" data-proposal-sticky>
        <span>${total ? `<small>Inversión</small><strong>${esc(total)}</strong>` : `<strong>${esc(doc.title)}</strong>`}</span>
        <button type="button" class="proposal-accept" data-proposal-accept-open>Aceptar</button>
      </div>`
    : "";
  return `<main class="proposal-shell${sticky ? " has-sticky" : ""}" data-proposal-page>
    ${view.preview ? `<p class="proposal-preview-banner" role="note"><strong>Vista previa</strong> · Así verá tu cliente esta propuesta. Abrirla aquí no cuenta como vista.</p>` : ""}
    ${brandHtml(view.store, view.numberLabel)}
    <section class="proposal-card proposal-hero" aria-labelledby="proposal-title">
      ${statusHtml(view)}
      <h1 id="proposal-title">${esc(doc.title)}</h1>
      ${doc.customer.name ? `<p class="proposal-for">Para <strong>${esc(doc.customer.name)}</strong></p>` : ""}
      ${total ? `<p class="proposal-total"><small>Inversión total</small><strong>${esc(total)}</strong></p>` : ""}
      ${validityHtml(view)}
      ${view.acceptable ? `<a class="proposal-jump" href="#responder" data-proposal-jump>Leer y responder ↓</a>` : ""}
    </section>
    ${view.updatedAfterFirstSend ? `<p class="proposal-updated">${esc(view.store.name)} actualizó esta propuesta; ves la versión más reciente.</p>` : ""}
    <article class="proposal-card proposal-document" aria-label="Propuesta">${sectionsHtml(doc)}</article>
    ${decisionHtml(view)}
    <div class="proposal-links">
      <a class="proposal-secondary" data-proposal-pdf href="${esc(pdfUrl)}" target="_blank" rel="noopener">Descargar PDF</a>
    </div>
    ${contactHtml(view.store)}
    <p class="proposal-security">${ICON_LOCK}<span>Enlace privado · ${esc(view.numberLabel)} · versión ${esc(view.version)}${view.sha256 ? ` · huella ${esc(view.sha256.slice(0, 12))}` : ""}. Solo quien tiene este enlace puede verla.</span></p>
    ${sticky}
  </main>`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function post(token: string, action: "accept" | "changes", body: unknown) {
  const response = await fetch(`${API_BASE_URL}/documents/public/${encodeURIComponent(token)}/${action}`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (!response.ok) {
    const message = Array.isArray(json.message) ? "Revisa los datos e intenta de nuevo." : typeof json.message === "string" ? json.message : "No pudimos enviar tu respuesta. Intenta de nuevo.";
    throw new Error(message);
  }
  return json;
}

function bind(view: OpenView, token: string): void {
  const acceptForm = app.querySelector<HTMLFormElement>("[data-proposal-accept-form]");
  const changesForm = app.querySelector<HTMLFormElement>("[data-proposal-changes-form]");
  const open = (form: HTMLFormElement | null, other: HTMLFormElement | null) => {
    if (!form) return;
    if (other) other.hidden = true;
    form.hidden = false;
    // The sticky "Aceptar" bar would cover the form's own button.
    app.querySelector("[data-proposal-page]")?.classList.add("is-answering");
    form.scrollIntoView?.({ behavior: "smooth", block: "center" });
    form.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  };
  app.querySelectorAll<HTMLButtonElement>("[data-proposal-accept-open]").forEach((button) => button.addEventListener("click", () => open(acceptForm, changesForm)));
  app.querySelectorAll<HTMLButtonElement>("[data-proposal-changes-open]").forEach((button) => button.addEventListener("click", () => open(changesForm, acceptForm)));
  // The sticky bar steps aside while the decision card is on screen.
  const decision = app.querySelector("#responder");
  const shell = app.querySelector("[data-proposal-page]");
  if (decision && shell && typeof IntersectionObserver === "function") {
    new IntersectionObserver((entries) => shell.classList.toggle("decision-visible", entries.some((entry) => entry.isIntersecting))).observe(decision);
  }
  app.querySelector("[data-proposal-jump]")?.addEventListener("click", (event) => {
    event.preventDefault();
    app.querySelector("#responder")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  });

  const fail = (form: HTMLFormElement, message: string, field?: string) => {
    const error = form.querySelector<HTMLElement>("[data-proposal-form-error]")!;
    error.textContent = message;
    if (field) form.querySelector<HTMLElement>(field)?.focus();
  };

  acceptForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (view.preview) return;
    const name = acceptForm.querySelector<HTMLInputElement>("#proposalAcceptName")!.value.trim();
    const email = acceptForm.querySelector<HTMLInputElement>("#proposalAcceptEmail")!.value.trim();
    if (name.length < 2) return fail(acceptForm, "Escribe tu nombre completo para aceptar.", "#proposalAcceptName");
    if (!EMAIL.test(email)) return fail(acceptForm, "Revisa tu correo.", "#proposalAcceptEmail");
    const submit = acceptForm.querySelector<HTMLButtonElement>("[data-proposal-accept-submit]")!;
    submit.disabled = true;
    submit.textContent = "Aceptando…";
    fail(acceptForm, "");
    try {
      const result = await post(token, "accept", { name, email, version: view.version });
      const acceptance = (result.acceptance as { name: string; at: string } | undefined) ?? { name, at: new Date().toISOString() };
      const next: OpenView = { ...view, status: "ACCEPTED", acceptable: false, acceptance };
      render(next, token);
      app.querySelector("[data-proposal-accepted]")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    } catch (failure) {
      submit.disabled = false;
      submit.textContent = "Aceptar y confirmar";
      fail(acceptForm, (failure as Error).message);
    }
  });

  changesForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (view.preview) return;
    const message = changesForm.querySelector<HTMLTextAreaElement>("#proposalChangesMessage")!.value.trim();
    const name = changesForm.querySelector<HTMLInputElement>("#proposalChangesName")!.value.trim();
    const email = changesForm.querySelector<HTMLInputElement>("#proposalChangesEmail")!.value.trim();
    if (message.length < 3) return fail(changesForm, "Cuéntale al comercio qué te gustaría cambiar.", "#proposalChangesMessage");
    if (!EMAIL.test(email)) return fail(changesForm, "Escribe tu correo para que te puedan responder.", "#proposalChangesEmail");
    const submit = changesForm.querySelector<HTMLButtonElement>("[data-proposal-changes-submit]")!;
    submit.disabled = true;
    submit.textContent = "Enviando…";
    fail(changesForm, "");
    try {
      await post(token, "changes", { ...(name && { name }), email, message });
      const status = app.querySelector("[data-proposal-status]");
      if (status) status.outerHTML = statusHtml({ ...view, status: "CHANGES_REQUESTED" });
      changesForm.outerHTML = `<div class="proposal-sent" data-proposal-changes-sent role="status">${ICON_CHECK}<p><strong>Enviamos tu mensaje a ${esc(view.store.name)}.</strong> Te responderá a ${esc(email)}. Mientras tanto, esta propuesta sigue disponible para aceptarla.</p></div>`;
    } catch (failure) {
      submit.disabled = false;
      submit.textContent = "Enviar pedido de cambios";
      fail(changesForm, (failure as Error).message);
    }
  });
}

function render(view: ProposalView, token: string): void {
  app.innerHTML = proposalPageHtml(view, token);
  if ("document" in view) bind(view, token);
}

/** Called by the /d/:token page once the view says it is a proposal. */
export function renderProposalView(view: ProposalView, token: string): void {
  document.body.classList.remove("cobro-document-page");
  document.body.classList.add("proposal-document-page");
  document.title = `${view.numberLabel} · Propuesta de ${view.store.name}`;
  render(view, token);
}
