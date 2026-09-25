// Pure helpers for the Contratos view (D3): types, status chips, the editor's parties and
// clauses, pending data, the save and draft payloads, the timeline and the WhatsApp text.
// No DOM here, so node --test covers every rule.
import { parseMoney } from "./cobros.mjs";

/** Added by the server to a clause that repeats an amount the merchant wrote: the send waits for a confirm tap. */
export const CONFIRM_AMOUNT_MARKER = "{{confirmar monto}}";
const PLACEHOLDER = /\{\{[^{}]{1,80}\}\}/g;

export const NOTARY_NOTICE = "Esta firma electrónica simple sirve para acuerdos comerciales privados. Para escrituras públicas, compraventa de inmuebles o vehículos, y ciertos actos laborales o societarios se necesita notario o firma digital: consulta a un abogado o notario.";

export const CONTRACT_TYPES = [
  { id: "servicios", label: "Servicios", title: "Prestación de servicios", hint: "Diseño, consultoría, mantenimiento, eventos…", merchant: "EL PRESTADOR", customer: "EL CLIENTE", notice: "" },
  { id: "compraventa", label: "Compraventa", title: "Compraventa de bienes muebles", hint: "Venta de equipos, mercadería, muebles…", merchant: "EL VENDEDOR", customer: "EL COMPRADOR", notice: "Solo bienes muebles. Para vender inmuebles o vehículos se necesita notario: consulta a un abogado o notario." },
  { id: "alquiler", label: "Alquiler", title: "Alquiler de bienes muebles", hint: "Equipos, maquinaria, sonido, vestidos…", merchant: "EL ARRENDADOR", customer: "EL ARRENDATARIO", notice: "Solo bienes muebles o equipos. Para alquilar un inmueble consulta a un abogado o notario." },
  { id: "confidencialidad", label: "Confidencialidad", title: "Acuerdo de confidencialidad (NDA)", hint: "Proteger información con socios o proveedores", merchant: "LA PARTE REVELADORA", customer: "LA PARTE RECEPTORA", notice: "" },
  { id: "personalizado", label: "Personalizado", title: "Contrato personalizado", hint: "Otro acuerdo comercial entre dos partes", merchant: "PRIMERA PARTE", customer: "SEGUNDA PARTE", notice: "" },
];

/** The first-run guide's examples: each opens the composer prefilled. */
export const CONTRACT_EXAMPLES = [
  { label: "Diseño de logo", contractType: "servicios", objeto: "Diseño de identidad visual para una cafetería: logotipo, paleta de colores y manual de marca, con dos rondas de cambios.", paymentTerms: "50% a la firma y 50% a la entrega", plazo: "30 días calendario" },
  { label: "Venta de muebles de oficina", contractType: "compraventa", objeto: "Venta de 10 escritorios y 10 sillas de oficina usados, en buen estado, con entrega en el domicilio del comprador.", paymentTerms: "Pago total contra entrega", plazo: "Entrega en 5 días hábiles" },
  { label: "Alquiler de equipo de sonido", contractType: "alquiler", objeto: "Alquiler de un equipo de sonido completo (2 parlantes, consola y micrófonos) para un evento de un fin de semana.", paymentTerms: "Pago total al recoger el equipo", plazo: "Del viernes al domingo" },
  { label: "Confidencialidad con un socio", contractType: "confidencialidad", objeto: "Conversaciones para una posible alianza comercial, en las que compartiremos precios, proveedores y planes de negocio.", paymentTerms: "", plazo: "2 años" },
];

export const BOLIVIA_CITIES = ["La Paz", "El Alto", "Cochabamba", "Santa Cruz de la Sierra", "Sucre", "Oruro", "Potosí", "Tarija", "Trinidad", "Cobija"];

export const CONTRACT_STATE_LABEL = {
  draft: "Borrador",
  sent: "Enviado",
  viewed: "Visto",
  signed_you: "Firmado por ti",
  signed_customer: "Firmado por el cliente",
  signed: "Firmado",
  voided: "Anulado",
  expired: "Vencido",
};

/**
 * @param {{ status: string, validUntil?: string | null, signing?: { merchantSigned?: boolean, customerSigned?: boolean } }} doc
 * @param {Date} [now]
 */
export function contractState(doc, now = new Date()) {
  if (doc.status === "DRAFT") return "draft";
  if (doc.status === "SIGNED") return "signed";
  if (doc.status === "VOIDED") return "voided";
  if (doc.status === "EXPIRED" || (doc.validUntil && new Date(doc.validUntil).getTime() < now.getTime())) return "expired";
  if (doc.signing?.customerSigned) return "signed_customer";
  if (doc.signing?.merchantSigned) return "signed_you";
  return doc.status === "VIEWED" ? "viewed" : "sent";
}

/** One line for the card and the detail: who has to sign next. */
export function signingLine(doc) {
  if (doc.status === "DRAFT") return "Borrador sin enviar";
  if (doc.status === "SIGNED") return "Firmado por ambas partes";
  if (doc.status === "VOIDED") return "Anulado";
  if (doc.status === "EXPIRED") return "Venció sin todas las firmas";
  const next = doc.signing?.waitingFor;
  if (next === "merchant") return "Te toca firmar";
  if (next === "customer") return `Esperando la firma de ${doc.customer?.name || "tu cliente"}`;
  return "";
}

const blankMeta = () => ({
  contractType: "personalizado",
  city: "",
  signingOrder: "merchant_first",
  merchantParty: { legalName: "", document: "", representative: "", representativeDocument: "", address: "", email: "" },
  customerParty: { address: "", representative: "", representativeDocument: "" },
});

/** The editor's state from a document: the contract block (parties, city, order) and the clauses. */
export function editorFromDocument(doc) {
  const content = Array.isArray(doc.content) ? doc.content : [];
  const block = content.find((entry) => entry?.type === "contract");
  const base = blankMeta();
  const raw = block?.contract || {};
  const meta = {
    ...base,
    ...raw,
    merchantParty: { ...base.merchantParty, ...(raw.merchantParty || {}) },
    customerParty: { ...base.customerParty, ...(raw.customerParty || {}) },
  };
  return {
    id: doc.id,
    numberLabel: doc.numberLabel,
    status: doc.status,
    editTag: doc.editTag || null,
    currentVersion: doc.currentVersion || 0,
    title: doc.title || "",
    validUntil: doc.validUntil || null,
    customer: { name: doc.customer?.name || "", email: doc.customer?.email || "", phone: doc.customer?.phone || "", document: doc.customer?.document || "" },
    meta,
    clauses: content.filter((entry) => entry?.type !== "contract").map((entry) => ({ title: entry.title || "", text: [entry.text || "", ...(entry.items || [])].filter(Boolean).join("\n") })),
  };
}

/** What PATCH saves: the meta block first, then the clauses; cleared customer fields become null. */
export function contractPayload(editor) {
  const orNull = (value) => (String(value ?? "").trim() ? String(value).trim() : null);
  return {
    title: editor.title.trim() || "Contrato",
    customerName: orNull(editor.customer.name),
    customerEmail: orNull(editor.customer.email)?.toLowerCase() ?? null,
    customerPhone: orNull(editor.customer.phone),
    customerDocument: orNull(editor.customer.document),
    content: [{ type: "contract", contract: editor.meta }, ...editor.clauses.map((clause) => ({ type: "clause", title: clause.title, text: clause.text }))],
    ...(editor.validUntil && { validUntil: editor.validUntil }),
  };
}

/** Everything that blocks the send, in the order it appears on screen. */
export function contractPending(editor) {
  /** @type {Array<{ label: string, where: string, token?: string }>} */
  const rows = [];
  const m = editor.meta.merchantParty;
  if (!m.legalName.trim()) rows.push({ label: "Tu nombre o razón social", where: "merchant:legalName" });
  if (!m.document.trim()) rows.push({ label: "Tu NIT o CI", where: "merchant:document" });
  if (!m.address.trim()) rows.push({ label: "Tu domicilio (comercio)", where: "merchant:address" });
  if (!m.email.trim()) rows.push({ label: "Tu correo (comercio)", where: "merchant:email" });
  if (!editor.customer.name.trim()) rows.push({ label: "Nombre del cliente", where: "customer:name" });
  if (!editor.customer.document.trim()) rows.push({ label: "CI o NIT del cliente", where: "customer:document" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editor.customer.email.trim())) rows.push({ label: "Correo del cliente (ahí le llega el código para firmar)", where: "customer:email" });
  if (!editor.meta.customerParty.address.trim()) rows.push({ label: "Domicilio del cliente", where: "customer:address" });
  if (!editor.meta.city.trim()) rows.push({ label: "Ciudad del contrato", where: "city" });
  if (!editor.title.trim()) rows.push({ label: "Título del contrato", where: "title" });
  editor.clauses.forEach((clause, index) => {
    const name = clause.title.trim() || `Cláusula ${index + 1}`;
    for (const token of new Set([...(clause.title + " " + clause.text).matchAll(PLACEHOLDER)].map((match) => match[0]))) {
      rows.push(token === CONFIRM_AMOUNT_MARKER
        ? { label: `Confirma el monto de «${name}»`, where: `clause:${index}`, token }
        : { label: `«${name}»: completa ${token}`, where: `clause:${index}`, token });
    }
  });
  return rows;
}

export function pendingSummary(rows) {
  return rows.length === 1 ? "Falta 1 dato" : `Faltan ${rows.length} datos`;
}

export function confirmAmount(text) {
  return String(text).split(CONFIRM_AMOUNT_MARKER).join("").replace(/[ \t]+$/gm, "").trim();
}

export function moveClause(clauses, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= clauses.length) return [...clauses];
  const next = [...clauses];
  const [clause] = next.splice(index, 1);
  next.splice(to, 0, clause);
  return next;
}

/** POST contracts/draft: the typed price in centavos, and only the fields the merchant filled. */
export function draftPayload(composer, { ai }) {
  const trimmed = (value) => String(value ?? "").trim();
  const price = trimmed(composer.price) ? parseMoney(composer.price) : null;
  const optional = { paymentTerms: composer.paymentTerms, plazo: composer.plazo, extra: composer.extra, customerName: composer.customerName, customerDocument: composer.customerDocument, customerPhone: composer.customerPhone, customerAddress: composer.customerAddress };
  const payload = { contractType: composer.contractType, objeto: trimmed(composer.objeto) };
  if (price && price > 0) payload.priceAmount = price;
  for (const [key, value] of Object.entries(optional)) if (trimmed(value)) payload[key] = trimmed(value);
  if (trimmed(composer.customerEmail)) payload.customerEmail = trimmed(composer.customerEmail).toLowerCase();
  if (trimmed(composer.city)) payload.city = trimmed(composer.city);
  payload.signingOrder = composer.signingOrder === "customer_first" ? "customer_first" : "merchant_first";
  if (composer.fromProposalId) payload.fromProposalId = composer.fromProposalId;
  payload.ai = ai;
  // Key order for readability in requests: fields first, then flags.
  const { signingOrder, ai: flag, fromProposalId, ...rest } = payload;
  return { ...rest, signingOrder, ...(fromProposalId && { fromProposalId }), ai: flag };
}

export function contractTimeline(events) {
  /** @type {Array<{ id: string, at: string, label: string, tone: "good" | "warning" | "bad" | "neutral" }>} */
  const entries = [];
  for (const event of events || []) {
    const data = event.data || {};
    /** @type {[string, "good" | "warning" | "bad" | "neutral"] | null} */
    let entry = null;
    switch (event.type) {
      case "created": entry = [data.fromProposal ? "Creaste el contrato desde una propuesta aceptada" : "Creaste el contrato", "neutral"]; break;
      case "ai_drafted": entry = [data.model ? "YAPI redactó las cláusulas" : "Empezaste con la plantilla", "neutral"]; break;
      case "sent": entry = [data.resend ? "Reenviado" : (event.version || 1) > 1 ? `Enviaste la versión ${event.version}` : "Contrato enviado", "neutral"]; break;
      case "shared": entry = [data.channel === "whatsapp" ? "Compartido por WhatsApp" : "Enlace copiado", "neutral"]; break;
      case "emailed": entry = [`Correo enviado a ${data.to || "tu cliente"}`, "neutral"]; break;
      case "email_failed": entry = ["No se pudo enviar un correo", "bad"]; break;
      case "viewed": entry = ["Tu cliente lo abrió", "neutral"]; break;
      case "sign_code_sent": entry = [`Se envió el código de firma a ${data.to || "tu cliente"}`, "neutral"]; break;
      case "sign_code_verified": entry = ["Tu cliente confirmó su correo", "neutral"]; break;
      case "signed": entry = [data.role === "MERCHANT" ? `Firmaste${data.name ? ` (${data.name})` : ""}` : `${data.name || "Tu cliente"} firmó`, "good"]; break;
      case "fully_signed": entry = ["Firmado por ambas partes", "good"]; break;
      case "signed_copy": entry = [`Copia firmada enviada a ${data.to || ""}`.trim(), "neutral"]; break;
      case "expired": entry = ["Venció sin todas las firmas", "warning"]; break;
      case "voided": entry = [data.reason ? `Anulado: ${data.reason}` : "Anulado", "bad"]; break;
      default: entry = null;
    }
    if (entry) entries.push({ id: event.id, at: event.at, label: entry[0], tone: entry[1] });
  }
  return entries;
}

/** @param {{ customerName: string | null, storeName: string, numberLabel: string, title: string, url: string }} input */
export function whatsAppContractMessage(input) {
  const hello = input.customerName ? `Hola ${input.customerName}` : "Hola";
  return `${hello}, te comparto el contrato ${input.numberLabel} «${input.title}» de ${input.storeName} para revisar y firmar en línea. Te llegará un código a tu correo para confirmar tu firma: ${input.url}`;
}
