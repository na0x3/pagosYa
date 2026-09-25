/**
 * The customer's contract page (`/d/:token`, kind CONTRACT): the frozen contract read like a
 * document (parties, numbered clauses, signatures), then a guided signature — "He leído",
 * a 6-digit code sent to the customer's email, the full name (typed or drawn) and "Firmar".
 * Same rules as the cobro and proposal pages: no merchant scripts, noindex, every string escaped.
 */
import "./contract-page.css";
import { API_BASE_URL, assetUrl } from "../api";
import { app } from "../ui/app";
import { ICON_CHECK, ICON_CLOCK, ICON_LOCK, ICON_WHATSAPP, ICON_X } from "../ui/icons";
import { cobroDate, whatsAppHref } from "./cobro-page";

type Block = { type: string; title?: string; text?: string; items?: string[] };

type Party = { legalName?: string; name?: string; document: string; address: string; email: string; representative: string; representativeDocument: string };

type ContractSnapshot = {
  contractType: string;
  typeTitle: string;
  city: string;
  signingOrder: "merchant_first" | "customer_first";
  roles: { merchant: string; customer: string };
  merchantParty: Party & { legalName: string };
  customerParty: Party & { name: string };
  preamble: string;
  partes: string;
  domicilios: string;
  closing: string;
};

type Snapshot = {
  kind: string;
  numberLabel: string;
  title: string;
  customer: { name: string | null; email: string | null; phone: string | null; document: string | null };
  validUntil: string | null;
  blocks: Block[];
  contract?: ContractSnapshot;
};

type StoreView = { name: string; logoUrl: string | null; contactEmail?: string | null; contactPhone?: string | null };

type SignatureView = { role: "MERCHANT" | "CUSTOMER"; name: string; method: "TYPED" | "DRAWN"; signedAt: string; imageUrl: string | null };

export type ContractView =
  | {
      kind: "CONTRACT";
      numberLabel: string;
      /** SENT, VIEWED, SIGNED or EXPIRED. */
      status: string;
      version: number;
      sha256?: string;
      sentAt: string | null;
      updatedAfterFirstSend: boolean;
      store: StoreView;
      document: Snapshot;
      preview: boolean;
      validUntil: string | null;
      signing: {
        order: string;
        waitingFor: "merchant" | "customer" | null;
        signable: boolean;
        codeSentTo: string | null;
        verified: boolean;
        signatures: SignatureView[];
      };
    }
  | { kind: "CONTRACT"; numberLabel: string; title: string; status: "VOIDED"; voidedAt: string | null; store: StoreView };

type OpenView = Extract<ContractView, { document: Snapshot }>;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string | number | null | undefined) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DRAWING = 60_000;

export const SIGNATURE_NOTICE =
  "Esta firma electrónica simple sirve para acuerdos comerciales privados. Para escrituras públicas, compraventa de inmuebles o vehículos, y ciertos actos laborales o societarios se necesita notario o firma digital: consulta a un abogado o notario.";

const ORDINALS = ["PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA"];
export function clauseOrdinal(position: number): string {
  if (position >= 1 && position <= 10) return ORDINALS[position - 1];
  if (position > 10 && position < 20) return `DÉCIMA ${ORDINALS[position - 11]}`;
  if (position === 20) return "VIGÉSIMA";
  return `CLÁUSULA ${position}`;
}

const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
};

const time = (value: string) =>
  new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(value));

function daysLeft(validUntil: string): string {
  const days = Math.floor((new Date(validUntil).getTime() - Date.now()) / DAY_MS);
  if (days <= 0) return "vence hoy";
  return days === 1 ? "queda 1 día" : `quedan ${days} días`;
}

const merchantName = (view: OpenView) => view.document.contract?.merchantParty.legalName || view.store.name;
const customerName = (view: OpenView) => view.document.contract?.customerParty.name || view.document.customer.name || "";
const signatureOf = (view: OpenView, role: "MERCHANT" | "CUSTOMER") => view.signing.signatures.find((signature) => signature.role === role) ?? null;

function brandHtml(store: StoreView, numberLabel: string): string {
  const logo = assetUrl(store.logoUrl);
  const safeLogo = logo && /^(?:https:\/\/|http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(logo) ? logo : null;
  return `<header class="contract-brand">
    <span class="contract-logo" aria-hidden="true">${safeLogo ? `<img src="${esc(safeLogo)}" alt="">` : esc(initials(store.name))}</span>
    <span class="contract-brand-copy"><small>Contrato de</small><strong>${esc(store.name)}</strong></span>
    <span class="contract-number">${esc(numberLabel)}</span>
  </header>`;
}

function statusHtml(view: OpenView): string {
  if (view.status === "SIGNED") return `<p class="contract-status is-signed" data-contract-status>${ICON_CHECK}<span><strong>Firmado por ambas partes</strong></span></p>`;
  if (view.status === "EXPIRED") return `<p class="contract-status is-closed" data-contract-status>${ICON_X}<span><strong>Venció el plazo para firmar</strong></span></p>`;
  if (signatureOf(view, "CUSTOMER")) return `<p class="contract-status is-progress" data-contract-status>${ICON_CHECK}<span><strong>Ya firmaste</strong> · falta la firma de ${esc(merchantName(view))}</span></p>`;
  if (view.signing.waitingFor === "merchant") return `<p class="contract-status is-waiting" data-contract-status>${ICON_CLOCK}<span><strong>Esperando la firma de ${esc(merchantName(view))}</strong></span></p>`;
  return `<p class="contract-status is-open" data-contract-status>${ICON_CLOCK}<span><strong>Esperando tu firma</strong></span></p>`;
}

/** Leer → Código → Firmar, with the current step lit. */
function stepsHtml(view: OpenView, step: 1 | 2 | 3 | 4): string {
  if (!view.signing.signable && step < 4) return "";
  const names = ["Leer", "Código", "Firmar"];
  return `<ol class="contract-steps" aria-label="Pasos para firmar" data-contract-steps>${names.map((name, index) => {
    const state = index + 1 < step ? "is-done" : index + 1 === step ? "is-current" : "";
    return `<li class="${state}"${index + 1 === step ? ' aria-current="step"' : ""}><span>${index + 1 < step ? ICON_CHECK : index + 1}</span>${name}</li>`;
  }).join("")}</ol>`;
}

function partyLine(label: string, party: Party & { legalName?: string; name?: string }) {
  return `<div class="contract-party"><small>${esc(label)}</small><strong>${esc(party.legalName ?? party.name ?? "")}</strong><span>CI/NIT ${esc(party.document)}</span></div>`;
}

function paragraphs(text: string) {
  return text.split(/\n+/).map((line) => `<p>${esc(line)}</p>`).join("");
}

function documentHtml(view: OpenView): string {
  const doc = view.document;
  const contract = doc.contract;
  if (!contract) return "";
  const clauses = [
    { title: "Partes", text: contract.partes },
    ...doc.blocks.map((block) => ({ title: block.title ?? "", text: [block.text ?? "", ...(block.items ?? []).map((item) => `• ${item}`)].filter(Boolean).join("\n") })),
    { title: "Domicilios y firma electrónica", text: contract.domicilios },
  ];
  const signatureBox = (role: "MERCHANT" | "CUSTOMER") => {
    const signature = signatureOf(view, role);
    const party = role === "MERCHANT" ? contract.merchantParty.legalName : contract.customerParty.name;
    const label = role === "MERCHANT" ? contract.roles.merchant : contract.roles.customer;
    const mark = signature
      ? signature.imageUrl && /^data:image\/png;base64,/.test(signature.imageUrl)
        ? `<img class="contract-sign-image" src="${esc(signature.imageUrl)}" alt="Firma de ${esc(signature.name)}">`
        : `<span class="contract-sign-typed">${esc(signature.name)}</span>`
      : `<span class="contract-sign-pending">Pendiente de firma</span>`;
    return `<div class="contract-signature${signature ? " is-signed" : ""}" data-contract-signature="${role.toLowerCase()}">
      <div class="contract-sign-mark">${mark}</div>
      <strong>${esc(party)}</strong>
      <small>${esc(label)}</small>
      ${signature ? `<small class="contract-sign-when">Firmó el ${esc(time(signature.signedAt))}</small>` : ""}
    </div>`;
  };
  return `<article class="contract-card contract-paper" aria-label="Contrato" data-contract-document>
    <h2 class="contract-paper-title">${esc(doc.title)}</h2>
    ${contract.typeTitle.toLowerCase() !== doc.title.toLowerCase() ? `<p class="contract-paper-type">${esc(contract.typeTitle)}</p>` : ""}
    <p class="contract-preamble">${esc(contract.preamble)}</p>
    ${clauses.map((clause, index) => `<section class="contract-clause">
      <h3><span>${esc(clauseOrdinal(index + 1))}.-</span> ${esc(clause.title)}</h3>
      ${paragraphs(clause.text)}
    </section>`).join("")}
    <p class="contract-closing">${esc(contract.closing)}</p>
    <div class="contract-signatures">${signatureBox("MERCHANT")}${signatureBox("CUSTOMER")}</div>
    <span class="contract-end" data-contract-end aria-hidden="true"></span>
  </article>`;
}

/** The signing card: steps 1–3, or why there is nothing to sign right now. */
function signHtml(view: OpenView): string {
  const pdfUrl = (download: boolean) => `${API_BASE_URL}/documents/public/${encodeURIComponent(currentToken)}/pdf${download ? "?download=1" : ""}`;
  if (view.status === "SIGNED") {
    return `<section class="contract-card contract-done" id="firmar" data-contract-signed aria-live="polite">
      <span class="contract-done-mark" aria-hidden="true">${ICON_CHECK}</span>
      <h2>¡Contrato firmado!</h2>
      <p>Las dos partes firmaron la versión ${esc(view.version)}. Te enviamos la copia firmada a tu correo, con el registro de firma electrónica.</p>
      <a class="contract-primary" href="${esc(pdfUrl(true))}" data-contract-signed-pdf>Descargar contrato firmado (PDF)</a>
    </section>`;
  }
  if (view.status === "EXPIRED") {
    return `<section class="contract-card contract-closed" id="firmar"><h2>El plazo para firmar venció</h2><p>Pídele a ${esc(view.store.name)} que te envíe el contrato de nuevo.</p></section>`;
  }
  if (signatureOf(view, "CUSTOMER")) {
    return `<section class="contract-card contract-done is-partial" id="firmar" data-contract-customer-signed aria-live="polite">
      <span class="contract-done-mark" aria-hidden="true">${ICON_CHECK}</span>
      <h2>¡Listo, firmaste!</h2>
      <p>Falta la firma de ${esc(merchantName(view))}. Cuando firme, te enviaremos por correo la copia firmada por ambas partes.</p>
    </section>`;
  }
  if (view.signing.waitingFor === "merchant") {
    return `<section class="contract-card contract-closed" id="firmar" data-contract-waiting>
      <h2>Todavía no puedes firmar</h2>
      <p>${esc(merchantName(view))} firma primero. Vuelve a abrir este enlace en un rato; mientras tanto puedes leer el contrato con calma.</p>
    </section>`;
  }
  const disabled = view.preview ? " disabled" : "";
  const name = customerName(view);
  return `<section class="contract-card contract-sign" id="firmar" aria-labelledby="contractSignTitle" data-contract-sign>
    <h2 id="contractSignTitle">Firma el contrato</h2>
    ${stepsHtml(view, view.signing.verified ? 3 : 1)}
    ${view.preview ? `<p class="contract-muted">En la vista previa los botones no responden.</p>` : ""}
    <div class="contract-step" data-contract-step="read"${view.signing.verified ? " hidden" : ""}>
      <label class="contract-check"><input type="checkbox" data-contract-read${disabled}><span>He leído el contrato completo y estoy de acuerdo con su contenido.</span></label>
      <p class="contract-muted">Para firmar te enviaremos un código de 6 dígitos a <strong>${esc(view.signing.codeSentTo ?? "tu correo")}</strong>.</p>
      <p class="contract-error" role="alert" data-contract-error></p>
      <button type="button" class="contract-primary" data-contract-send-code disabled>Enviarme el código</button>
    </div>
    <form class="contract-step" data-contract-step="code" hidden novalidate>
      <p class="contract-lead">Te enviamos un código a <strong>${esc(view.signing.codeSentTo ?? "tu correo")}</strong>. Vence en 10 minutos.</p>
      <label for="contractCode">Código de 6 dígitos</label>
      <input id="contractCode" class="contract-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="••••••" required>
      <p class="contract-error" role="alert" data-contract-error></p>
      <button type="submit" class="contract-primary" data-contract-verify>Confirmar código</button>
      <button type="button" class="contract-link" data-contract-resend disabled>Reenviar código</button>
    </form>
    <form class="contract-step" data-contract-step="sign"${view.signing.verified ? "" : " hidden"} novalidate>
      <p class="contract-lead">${ICON_CHECK} Correo confirmado. Último paso: tu firma.</p>
      <label for="contractName">Tu nombre completo</label>
      <input id="contractName" name="name" autocomplete="name" maxlength="120" required value="${esc(name)}"${disabled}>
      <div class="contract-tabs" role="tablist" aria-label="Cómo firmar">
        <button type="button" role="tab" aria-selected="true" data-contract-method="TYPED">Escribir</button>
        <button type="button" role="tab" aria-selected="false" data-contract-method="DRAWN">Dibujar</button>
      </div>
      <div class="contract-typed" data-contract-typed><span data-contract-typed-preview>${esc(name) || "Tu firma"}</span></div>
      <div class="contract-draw" data-contract-draw hidden>
        <canvas width="560" height="180" data-contract-canvas aria-label="Dibuja tu firma con el dedo o el mouse"></canvas>
        <button type="button" class="contract-link" data-contract-clear>Borrar</button>
      </div>
      <p class="contract-consent">Al firmar aceptas este contrato con firma electrónica simple. Guardamos tu nombre, tu correo confirmado, la fecha y hora, tu IP y tu dispositivo, y la huella de la versión ${esc(view.version)} que leíste, como constancia.</p>
      <p class="contract-error" role="alert" data-contract-error></p>
      <button type="submit" class="contract-primary is-sign" data-contract-submit${disabled}>Firmar contrato</button>
    </form>
  </section>`;
}

function contactHtml(store: StoreView): string {
  const links = [
    store.contactPhone ? `<a href="${esc(whatsAppHref(store.contactPhone))}" target="_blank" rel="noopener noreferrer">${ICON_WHATSAPP}WhatsApp</a>` : "",
    store.contactEmail ? `<a href="mailto:${esc(store.contactEmail)}">Correo</a>` : "",
  ].filter(Boolean);
  if (!links.length) return "";
  return `<div class="contract-contact"><span>¿Dudas sobre una cláusula? Escríbele a ${esc(store.name)} antes de firmar.</span><div>${links.join("")}</div></div>`;
}

let currentToken = "";

export function contractPageHtml(view: ContractView, token: string): string {
  currentToken = token;
  if (view.status === "VOIDED" || !("document" in view)) {
    const voided = view as Extract<ContractView, { status: "VOIDED" }>;
    return `<main class="contract-shell" data-contract-page>
      ${brandHtml(voided.store, voided.numberLabel)}
      <section class="contract-card contract-hero">
        <p class="contract-status is-closed" data-contract-status>${ICON_X}<span><strong>Anulado</strong>${voided.voidedAt ? ` el ${esc(cobroDate(voided.voidedAt))}` : ""}</span></p>
        <h1>${esc(voided.title)}</h1>
        <p class="contract-muted">Este contrato fue anulado y ya no se puede firmar. Si tienes dudas, escríbele a ${esc(voided.store.name)}.</p>
      </section>
      <p class="contract-security">${ICON_LOCK}<span>Enlace privado de ${esc(voided.store.name)} · con pagosYa</span></p>
    </main>`;
  }
  const doc = view.document;
  const contract = doc.contract;
  const sticky = view.signing.signable && !view.preview && !signatureOf(view, "CUSTOMER")
    ? `<div class="contract-sticky" data-contract-sticky><span><small>${esc(doc.numberLabel)}</small><strong>${esc(doc.title)}</strong></span><a class="contract-primary" href="#firmar" data-contract-jump>Firmar</a></div>`
    : "";
  const deadline = view.validUntil && (view.status === "SENT" || view.status === "VIEWED")
    ? `<p class="contract-deadline" data-contract-deadline>${ICON_CLOCK}<span>Firmar antes del ${esc(cobroDate(view.validUntil))} · ${esc(daysLeft(view.validUntil))}</span></p>`
    : "";
  return `<main class="contract-shell${sticky ? " has-sticky" : ""}" data-contract-page>
    ${view.preview ? `<p class="contract-preview-banner" role="note"><strong>Vista previa</strong> · Así verá tu cliente este contrato. Abrirlo aquí no cuenta como vista y no permite firmar.</p>` : ""}
    ${brandHtml(view.store, view.numberLabel)}
    <section class="contract-card contract-hero" aria-labelledby="contract-title">
      ${statusHtml(view)}
      <h1 id="contract-title">${esc(doc.title)}</h1>
      ${contract ? `<div class="contract-parties">${partyLine(contract.roles.merchant, contract.merchantParty)}${partyLine(contract.roles.customer, contract.customerParty)}</div>` : ""}
      ${deadline}
      ${view.signing.signable ? `<a class="contract-jump" href="#firmar" data-contract-jump>Leer y firmar ↓</a>` : ""}
    </section>
    ${view.updatedAfterFirstSend ? `<p class="contract-updated">${esc(view.store.name)} actualizó este contrato; ves la versión más reciente (${esc(view.version)}).</p>` : ""}
    <aside class="contract-notice" data-contract-notice><strong>Firma electrónica simple.</strong> ${esc(SIGNATURE_NOTICE)}</aside>
    ${documentHtml(view)}
    ${signHtml(view)}
    <div class="contract-links">
      <a class="contract-secondary" data-contract-pdf href="${esc(`${API_BASE_URL}/documents/public/${encodeURIComponent(token)}/pdf`)}" target="_blank" rel="noopener">Ver PDF</a>
    </div>
    ${contactHtml(view.store)}
    <p class="contract-security">${ICON_LOCK}<span>Enlace privado · ${esc(view.numberLabel)} · versión ${esc(view.version)}${view.sha256 ? ` · huella ${esc(view.sha256.slice(0, 12))}` : ""}. Solo quien tiene este enlace puede verlo.</span></p>
    ${sticky}
  </main>`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

class ContractError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function post(token: string, path: string, body: unknown) {
  const response = await fetch(`${API_BASE_URL}/documents/public/${encodeURIComponent(token)}/${path}`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (!response.ok) {
    const message = Array.isArray(json.message) ? "Revisa los datos e intenta de nuevo." : typeof json.message === "string" ? json.message : "No pudimos completar este paso. Intenta de nuevo.";
    throw new ContractError(message, response.status);
  }
  return json;
}

/** A pointer-drawn signature on a canvas; returns a PNG data URL or null when empty. */
function bindCanvas(canvas: HTMLCanvasElement) {
  // The 2D context is taken on the first stroke (jsdom and very old browsers have none).
  let context: CanvasRenderingContext2D | null = null;
  const ink = () => {
    if (!context) {
      context = canvas.getContext?.("2d") ?? null;
      if (context) {
        context.lineWidth = 2.6;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#0f2a4a";
      }
    }
    return context;
  };
  let drawn = false;
  let drawing = false;
  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width, y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height };
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (!ink()) return;
    drawing = true;
    canvas.setPointerCapture?.(event.pointerId);
    const { x, y } = point(event);
    context!.beginPath();
    context!.moveTo(x, y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing || !context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    drawn = true;
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  return {
    clear() {
      context?.clearRect(0, 0, canvas.width, canvas.height);
      drawn = false;
    },
    image(): string | null {
      return drawn ? canvas.toDataURL("image/png") : null;
    },
  };
}

function bind(view: OpenView, token: string): void {
  const card = app.querySelector<HTMLElement>("[data-contract-sign]");
  app.querySelectorAll<HTMLAnchorElement>("[data-contract-jump]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    app.querySelector("#firmar")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }));
  // The sticky "Firmar" bar steps aside while the signing card is on screen.
  const shell = app.querySelector("[data-contract-page]");
  if (card && shell && typeof IntersectionObserver === "function") {
    new IntersectionObserver((entries) => shell.classList.toggle("sign-visible", entries.some((entry) => entry.isIntersecting))).observe(card);
  }
  if (!card || view.preview) return;

  const step = (name: string) => card.querySelector<HTMLElement>(`[data-contract-step="${name}"]`)!;
  const show = (name: "read" | "code" | "sign", current: 1 | 2 | 3) => {
    for (const other of ["read", "code", "sign"]) step(other).hidden = other !== name;
    const steps = card.querySelector("[data-contract-steps]");
    if (steps) steps.outerHTML = stepsHtml(view, current);
    step(name).querySelector<HTMLElement>("input:not([type=checkbox])")?.focus({ preventScroll: true });
  };
  const fail = (name: string, message: string) => {
    const error = step(name).querySelector<HTMLElement>("[data-contract-error]")!;
    error.textContent = message;
  };
  /** 409: the merchant changed the contract (or it closed) — the signer must reload and read again. */
  const conflict = (name: string, failure: unknown) => {
    fail(name, (failure as Error).message);
    if ((failure as ContractError).status === 409 && !step(name).querySelector("[data-contract-reload]")) {
      const reload = document.createElement("button");
      reload.type = "button";
      reload.className = "contract-secondary";
      reload.dataset.contractReload = "";
      reload.textContent = "Volver a cargar el contrato";
      reload.addEventListener("click", () => window.location.reload());
      step(name).appendChild(reload);
    }
  };

  // Step 1: read, then send the code.
  const read = card.querySelector<HTMLInputElement>("[data-contract-read]")!;
  const sendButton = card.querySelector<HTMLButtonElement>("[data-contract-send-code]")!;
  read.addEventListener("change", () => { sendButton.disabled = !read.checked; });
  const resend = card.querySelector<HTMLButtonElement>("[data-contract-resend]")!;
  let timer: ReturnType<typeof setInterval> | undefined;
  const cooldown = (seconds: number) => {
    let left = seconds;
    resend.disabled = true;
    resend.textContent = `Reenviar código (${left} s)`;
    clearInterval(timer);
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        resend.disabled = false;
        resend.textContent = "Reenviar código";
      } else resend.textContent = `Reenviar código (${left} s)`;
    }, 1000);
  };
  const requestCode = async (from: "read" | "code", button: HTMLButtonElement) => {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Enviando…";
    fail(from, "");
    try {
      const result = await post(token, "sign/code", { version: view.version });
      button.textContent = label;
      show("code", 2);
      cooldown(Number(result.resendAfterSeconds) || 60);
    } catch (failure) {
      button.disabled = false;
      button.textContent = label;
      conflict(from, failure);
    }
  };
  sendButton.addEventListener("click", () => void requestCode("read", sendButton));
  resend.addEventListener("click", () => void requestCode("code", resend));

  // Step 2: the code.
  const codeForm = step("code") as HTMLFormElement;
  const codeInput = codeForm.querySelector<HTMLInputElement>("#contractCode")!;
  codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6); });
  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = codeInput.value.replace(/\D/g, "");
    if (code.length !== 6) return fail("code", "Escribe los 6 dígitos del código.");
    const button = codeForm.querySelector<HTMLButtonElement>("[data-contract-verify]")!;
    button.disabled = true;
    button.textContent = "Confirmando…";
    fail("code", "");
    try {
      await post(token, "sign/verify", { version: view.version, code });
      clearInterval(timer);
      show("sign", 3);
    } catch (failure) {
      conflict("code", failure);
      codeInput.select?.();
    } finally {
      button.disabled = false;
      button.textContent = "Confirmar código";
    }
  });

  // Step 3: the signature.
  const signForm = step("sign") as HTMLFormElement;
  const nameInput = signForm.querySelector<HTMLInputElement>("#contractName")!;
  const preview = signForm.querySelector<HTMLElement>("[data-contract-typed-preview]")!;
  nameInput.addEventListener("input", () => { preview.textContent = nameInput.value.trim() || "Tu firma"; });
  const canvas = bindCanvas(signForm.querySelector<HTMLCanvasElement>("[data-contract-canvas]")!);
  let method: "TYPED" | "DRAWN" = "TYPED";
  signForm.querySelectorAll<HTMLButtonElement>("[data-contract-method]").forEach((tab) => tab.addEventListener("click", () => {
    method = tab.dataset.contractMethod as "TYPED" | "DRAWN";
    signForm.querySelectorAll<HTMLButtonElement>("[data-contract-method]").forEach((other) => other.setAttribute("aria-selected", String(other === tab)));
    signForm.querySelector<HTMLElement>("[data-contract-typed]")!.hidden = method !== "TYPED";
    signForm.querySelector<HTMLElement>("[data-contract-draw]")!.hidden = method !== "DRAWN";
  }));
  signForm.querySelector("[data-contract-clear]")?.addEventListener("click", () => canvas.clear());
  signForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.replace(/\s+/g, " ").trim();
    if (name.length < 3) {
      nameInput.focus();
      return fail("sign", "Escribe tu nombre completo para firmar.");
    }
    const image = method === "DRAWN" ? canvas.image() : null;
    if (method === "DRAWN" && !image) return fail("sign", "Dibuja tu firma en el recuadro, o elige «Escribir».");
    if (image && image.length > MAX_DRAWING) return fail("sign", "Tu firma dibujada es muy grande. Bórrala y dibújala más simple.");
    const button = signForm.querySelector<HTMLButtonElement>("[data-contract-submit]")!;
    button.disabled = true;
    button.textContent = "Firmando…";
    fail("sign", "");
    try {
      const result = await post(token, "sign", { version: view.version, name, method, ...(image && { image }), readConfirmed: true });
      const signature: SignatureView = { role: "CUSTOMER", name, method, signedAt: new Date().toISOString(), imageUrl: image };
      const next: OpenView = {
        ...view,
        status: String(result.status ?? view.status),
        signing: { ...view.signing, signable: false, waitingFor: result.status === "SIGNED" ? null : "merchant", signatures: [...view.signing.signatures.filter((entry) => entry.role !== "CUSTOMER"), signature] },
      };
      render(next, token);
      app.querySelector("#firmar")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    } catch (failure) {
      button.disabled = false;
      button.textContent = "Firmar contrato";
      conflict("sign", failure);
    }
  });
}

function render(view: ContractView, token: string): void {
  app.innerHTML = contractPageHtml(view, token);
  if ("document" in view) bind(view, token);
}

/** Called by the /d/:token page once the view says it is a contract. */
export function renderContractView(view: ContractView, token: string): void {
  document.body.classList.remove("cobro-document-page", "proposal-document-page");
  document.body.classList.add("contract-document-page");
  document.title = `${view.numberLabel} · Contrato de ${view.store.name}`;
  render(view, token);
}
