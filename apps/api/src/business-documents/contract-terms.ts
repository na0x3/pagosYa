import type { DocumentBlock } from "./business-document-snapshot";

/**
 * D3 contract rules that need no AI: the five types, their role labels and clause outline,
 * the contract data (issuer, parties, city, signing order) kept in a leading `contract` block,
 * and the server-written texts (comparecencia, domicilios, cierre) built only from that data —
 * missing data becomes a {{placeholder}} that blocks the send, never an invented value.
 */

export const CONTRACT_TYPES = ["servicios", "compraventa", "alquiler", "confidencialidad", "personalizado"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const SIGNING_ORDERS = ["merchant_first", "customer_first"] as const;
export type SigningOrder = (typeof SIGNING_ORDERS)[number];

export type MerchantParty = { legalName: string; document: string; representative: string; representativeDocument: string; address: string; email: string };
export type CustomerPartyExtra = { address: string; representative: string; representativeDocument: string };

/** Stored in D0 `content` as `{ type: "contract", contract: ContractMeta }` (first block). */
export type ContractMeta = {
  contractType: ContractType;
  city: string;
  signingOrder: SigningOrder;
  merchantParty: MerchantParty;
  customerParty: CustomerPartyExtra;
};

/** What the signed version freezes (hashed with the rest of the snapshot). */
export type ContractSnapshot = {
  contractType: ContractType;
  typeTitle: string;
  city: string;
  signingOrder: SigningOrder;
  roles: { merchant: string; customer: string };
  merchantParty: MerchantParty;
  customerParty: CustomerPartyExtra & { name: string; document: string; email: string };
  preamble: string;
  partes: string;
  domicilios: string;
  closing: string;
};

export const CONTRACT_TYPE_INFO: Record<ContractType, { title: string; label: string; merchant: string; customer: string }> = {
  servicios: { title: "Contrato de prestación de servicios", label: "Servicios", merchant: "EL PRESTADOR", customer: "EL CLIENTE" },
  compraventa: { title: "Contrato de compraventa de bienes muebles", label: "Compraventa", merchant: "EL VENDEDOR", customer: "EL COMPRADOR" },
  alquiler: { title: "Contrato de alquiler de bienes muebles", label: "Alquiler", merchant: "EL ARRENDADOR", customer: "EL ARRENDATARIO" },
  confidencialidad: { title: "Acuerdo de confidencialidad", label: "Confidencialidad", merchant: "LA PARTE REVELADORA", customer: "LA PARTE RECEPTORA" },
  personalizado: { title: "Contrato", label: "Personalizado", merchant: "PRIMERA PARTE", customer: "SEGUNDA PARTE" },
};

export type OutlineClause = { key: string; title: string };

/** The clauses YAPI (or the template) writes, in order. Partes and Domicilios are the server's. */
export const CONTRACT_OUTLINE: Record<ContractType, OutlineClause[]> = {
  servicios: [
    { key: "objeto", title: "Objeto" },
    { key: "precio", title: "Precio y forma de pago" },
    { key: "plazo", title: "Plazo" },
    { key: "obligaciones_comercio", title: "Obligaciones de EL PRESTADOR" },
    { key: "obligaciones_cliente", title: "Obligaciones de EL CLIENTE" },
    { key: "confidencialidad", title: "Confidencialidad" },
    { key: "resolucion", title: "Resolución" },
    { key: "jurisdiccion", title: "Jurisdicción y ley aplicable" },
  ],
  compraventa: [
    { key: "objeto", title: "Objeto" },
    { key: "precio", title: "Precio y forma de pago" },
    { key: "entrega", title: "Entrega y transferencia" },
    { key: "garantia", title: "Estado del bien y garantía" },
    { key: "obligaciones", title: "Obligaciones de las partes" },
    { key: "resolucion", title: "Resolución" },
    { key: "jurisdiccion", title: "Jurisdicción y ley aplicable" },
  ],
  alquiler: [
    { key: "objeto", title: "Objeto" },
    { key: "precio", title: "Canon de alquiler y forma de pago" },
    { key: "plazo", title: "Plazo" },
    { key: "uso", title: "Uso y conservación" },
    { key: "garantia", title: "Garantía" },
    { key: "devolucion", title: "Devolución" },
    { key: "resolucion", title: "Resolución" },
    { key: "jurisdiccion", title: "Jurisdicción y ley aplicable" },
  ],
  confidencialidad: [
    { key: "objeto", title: "Objeto" },
    { key: "informacion", title: "Información confidencial" },
    { key: "obligaciones", title: "Obligaciones de LA PARTE RECEPTORA" },
    { key: "excepciones", title: "Excepciones" },
    { key: "plazo", title: "Vigencia" },
    { key: "devolucion", title: "Devolución de la información" },
    { key: "incumplimiento", title: "Incumplimiento" },
    { key: "jurisdiccion", title: "Jurisdicción y ley aplicable" },
  ],
  personalizado: [
    { key: "objeto", title: "Objeto" },
    { key: "precio", title: "Precio y forma de pago" },
    { key: "plazo", title: "Plazo" },
    { key: "obligaciones", title: "Obligaciones de las partes" },
    { key: "resolucion", title: "Resolución" },
    { key: "jurisdiccion", title: "Jurisdicción y ley aplicable" },
  ],
};

const LIMITS = { city: 60, legalName: 160, document: 40, representative: 120, representativeDocument: 40, address: 240, email: 254 };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function defaultContractMeta(): ContractMeta {
  return {
    contractType: "personalizado",
    city: "",
    signingOrder: "merchant_first",
    merchantParty: { legalName: "", document: "", representative: "", representativeDocument: "", address: "", email: "" },
    customerParty: { address: "", representative: "", representativeDocument: "" },
  };
}

/** Only known fields, trimmed and capped; unknown type/order fall back to the defaults. */
export function cleanContractMeta(raw: unknown): ContractMeta {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const merchant = (value.merchantParty && typeof value.merchantParty === "object" ? value.merchantParty : {}) as Record<string, unknown>;
  const customer = (value.customerParty && typeof value.customerParty === "object" ? value.customerParty : {}) as Record<string, unknown>;
  return {
    contractType: CONTRACT_TYPES.includes(value.contractType as ContractType) ? (value.contractType as ContractType) : "personalizado",
    city: text(value.city, LIMITS.city),
    signingOrder: SIGNING_ORDERS.includes(value.signingOrder as SigningOrder) ? (value.signingOrder as SigningOrder) : "merchant_first",
    merchantParty: {
      legalName: text(merchant.legalName, LIMITS.legalName),
      document: text(merchant.document, LIMITS.document),
      representative: text(merchant.representative, LIMITS.representative),
      representativeDocument: text(merchant.representativeDocument, LIMITS.representativeDocument),
      address: text(merchant.address, LIMITS.address),
      email: text(merchant.email, LIMITS.email).toLowerCase(),
    },
    customerParty: {
      address: text(customer.address, LIMITS.address),
      representative: text(customer.representative, LIMITS.representative),
      representativeDocument: text(customer.representativeDocument, LIMITS.representativeDocument),
    },
  };
}

export function contractMetaBlock(meta: ContractMeta): DocumentBlock {
  return { type: "contract", contract: meta };
}

/** The meta (cleaned; defaults when absent) and the clause blocks of a contract's content. */
export function splitContractContent(content: unknown): { meta: ContractMeta; clauses: DocumentBlock[] } {
  const blocks = Array.isArray(content) ? (content as DocumentBlock[]) : [];
  const metaBlock = blocks.find((block) => block?.type === "contract");
  return { meta: metaBlock ? cleanContractMeta(metaBlock.contract) : defaultContractMeta(), clauses: blocks.filter((block) => block?.type !== "contract") };
}

/** Issuer data the platform already has: invoicing profile → approved KYC → store name. Address has no source. */
export function prefillMerchantParty(input: {
  invoicing: { razonSocial: string; nit: string } | null;
  kyc: { legalName: string; taxId: string | null; legalRepName: string | null; legalRepDocumentId: string | null } | null;
  store: { name: string; contactEmail: string | null };
  merchantEmail: string | null;
}): MerchantParty {
  return {
    legalName: text(input.invoicing?.razonSocial || input.kyc?.legalName || input.store.name, LIMITS.legalName),
    document: text(input.invoicing?.nit || input.kyc?.taxId || "", LIMITS.document),
    representative: text(input.kyc?.legalRepName ?? "", LIMITS.representative),
    representativeDocument: text(input.kyc?.legalRepDocumentId ?? "", LIMITS.representativeDocument),
    address: "",
    email: text(input.store.contactEmail || input.merchantEmail || "", LIMITS.email).toLowerCase(),
  };
}

// ── money in words ───────────────────────────────────────────────────────

const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const TENS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function below1000(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let restWords = "";
  if (rest < 30) restWords = UNITS[rest];
  else restWords = `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` Y ${UNITS[rest % 10]}` : ""}`;
  return [HUNDREDS[hundreds], restWords].filter(Boolean).join(" ");
}

/** "UNO" before a noun is "UN"/"ÚN" ("VEINTIÚN MIL", "UN MILLÓN"). */
const apocope = (words: string) => words.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/UNO$/, "UN");

function integerWords(n: number): string {
  if (n === 0) return "CERO";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "UN MILLÓN" : `${apocope(integerWords(millions))} MILLONES`);
  if (thousands) parts.push(thousands === 1 ? "MIL" : `${apocope(below1000(thousands))} MIL`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** "MIL QUINIENTOS 00/100 BOLIVIANOS" — how Bolivian contracts spell an amount. */
export function amountInWords(cents: number, currency: string): string {
  const whole = Math.floor(cents / 100);
  const decimals = String(cents % 100).padStart(2, "0");
  const unit = currency === "USD" ? "DÓLARES ESTADOUNIDENSES" : "BOLIVIANOS";
  return `${integerWords(whole)} ${decimals}/100 ${unit}`;
}

export function contractMoney(cents: number, currency: string): string {
  const figure = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(cents / 100);
  // es-BO keeps no grouping for 4-digit amounts in some ICU builds; contracts always group.
  const grouped = figure.replace(/^(\d+)(,\d{2})$/, (_, int: string, dec: string) => `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${dec}`);
  return `${currency === "USD" ? "US$" : "Bs"} ${grouped} (${amountInWords(cents, currency)})`;
}

const ORDINALS = ["PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA"];

/** "PRIMERA", …, "DÉCIMA", "DÉCIMA PRIMERA", …, "VIGÉSIMA", then "CLÁUSULA 21". */
export function clauseOrdinal(position: number): string {
  if (position >= 1 && position <= 10) return ORDINALS[position - 1];
  if (position > 10 && position < 20) return `DÉCIMA ${ORDINALS[position - 11]}`;
  if (position === 20) return "VIGÉSIMA";
  return `CLÁUSULA ${position}`;
}

// ── server-written texts ─────────────────────────────────────────────────

const or = (value: string | null | undefined, placeholder: string) => (value && value.trim() ? value.trim() : `{{${placeholder}}}`);

export function contractSnapshot(meta: ContractMeta, customer: { name: string | null; document: string | null; email: string | null }): ContractSnapshot {
  const info = CONTRACT_TYPE_INFO[meta.contractType];
  const roles = { merchant: info.merchant, customer: info.customer };
  const m = meta.merchantParty;
  const c = meta.customerParty;
  const customerParty = { name: or(customer.name, "nombre del cliente"), document: or(customer.document, "CI o NIT del cliente"), email: or(customer.email, "correo del cliente"), ...c, address: or(c.address, "domicilio del cliente") };
  const merchantParty = { ...m, legalName: or(m.legalName, "nombre o razón social del comercio"), document: or(m.document, "NIT o CI del comercio"), address: or(m.address, "domicilio del comercio"), email: or(m.email, "correo del comercio") };
  const city = or(meta.city, "ciudad");
  const represented = (name: string, id: string) => (name ? `, representada por ${name}${id ? `, con cédula de identidad ${id}` : ""}` : "");
  const merchantDoc = /^\d{9,}$/.test(merchantParty.document) ? `NIT ${merchantParty.document}` : `NIT/CI ${merchantParty.document}`;
  const preamble = `Conste por el presente documento privado de ${info.title.toLowerCase()}, que surtirá efectos entre las partes desde su firma electrónica, el acuerdo que se celebra al tenor de las siguientes cláusulas:`;
  const partes = [
    "Intervienen en la celebración del presente contrato:",
    `1. ${merchantParty.legalName}, con ${merchantDoc}, con domicilio en ${merchantParty.address}${represented(m.representative, m.representativeDocument)}, que en adelante se denominará «${roles.merchant}».`,
    `2. ${customerParty.name}, con CI/NIT ${customerParty.document}, con domicilio en ${customerParty.address}${represented(c.representative, c.representativeDocument)}, que en adelante se denominará «${roles.customer}».`,
    "Ambas partes declaran tener capacidad legal para contratar y obligarse.",
  ].join("\n");
  const domicilios = `Para efectos de este contrato, las partes señalan como domicilios los indicados en la cláusula de partes y como correos electrónicos para notificaciones: ${roles.merchant}, ${merchantParty.email}; ${roles.customer}, ${customerParty.email}. Las partes acuerdan suscribir este contrato mediante firma electrónica simple, con verificación de un código enviado al correo electrónico de ${roles.customer}, y reconocen entre ellas la validez de este medio de firma.`;
  const closing = `En señal de conformidad, las partes firman el presente contrato en la ciudad de ${city}, Estado Plurinacional de Bolivia, en las fechas que constan en el registro de firma electrónica.`;
  return { contractType: meta.contractType, typeTitle: info.title, city, signingOrder: meta.signingOrder, roles, merchantParty, customerParty, preamble, partes, domicilios, closing };
}

/** The strings of a frozen contract a {{placeholder}} can hide in. */
export function contractTexts(contract: ContractSnapshot | undefined): string[] {
  if (!contract) return [];
  return [contract.city, ...Object.values(contract.merchantParty), ...Object.values(contract.customerParty), contract.partes, contract.domicilios, contract.closing];
}

// ── templates (Empezar sin IA, and the AI fallback shape) ────────────────

export type ContractTerms = { objeto: string; priceAmount: number | null; currency: string; paymentTerms: string; plazo: string };

/** The type's outline in plain Bolivian commercial Spanish, with {{…}} for what the merchant did not give. */
export function contractTemplateClauses(type: ContractType, terms: ContractTerms): DocumentBlock[] {
  const { merchant: A, customer: B } = CONTRACT_TYPE_INFO[type];
  const objeto = or(terms.objeto, "objeto");
  const price = terms.priceAmount && terms.priceAmount > 0 ? contractMoney(terms.priceAmount, terms.currency) : "{{precio}}";
  const pago = or(terms.paymentTerms, "forma de pago");
  const plazo = or(terms.plazo, "plazo");
  const juris = `El presente contrato se rige por las leyes del Estado Plurinacional de Bolivia, en particular el Código Civil y el Código de Comercio. Las partes procurarán resolver cualquier controversia de buena fe y de manera directa; de no lograrlo, se someterán a la jurisdicción de los jueces y tribunales competentes de la ciudad señalada en este contrato.`;
  const resolucion = `El incumplimiento de cualquiera de las obligaciones de este contrato faculta a la parte cumplida a resolverlo, previa comunicación escrita a la otra parte con un plazo de diez (10) días calendario para subsanar el incumplimiento, sin perjuicio de exigir el resarcimiento de los daños y perjuicios que correspondan conforme a ley.`;
  const texts: Record<string, string> = {
    objeto: {
      servicios: `Por el presente contrato, ${A} se compromete a prestar a favor de ${B} los siguientes servicios: ${objeto}.`,
      compraventa: `Por el presente contrato, ${A} da en venta real y enajenación perpetua a favor de ${B} el siguiente bien mueble: ${objeto}, que ${B} declara conocer y aceptar.`,
      alquiler: `Por el presente contrato, ${A} da en alquiler a favor de ${B} el siguiente bien mueble o equipo: ${objeto}, en el estado en que se encuentra, que ${B} declara conocer y aceptar.`,
      confidencialidad: `El presente acuerdo tiene por objeto proteger la información que ${A} comparta con ${B} con motivo de: ${objeto}.`,
      personalizado: `El objeto del presente contrato es: ${objeto}.`,
    }[type],
    precio: `El precio acordado es de ${price}, que ${B} pagará a ${A} de la siguiente forma: ${pago}. Los pagos se realizarán en moneda de curso legal y cada pago será respaldado con el comprobante correspondiente.`,
    plazo: type === "confidencialidad"
      ? `Las obligaciones de confidencialidad estarán vigentes por ${plazo}, contado desde la firma de este acuerdo, y subsistirán aunque termine la relación entre las partes.`
      : `El presente contrato tendrá la siguiente duración: ${plazo}, contada desde la fecha de su firma, salvo que las partes acuerden por escrito su ampliación.`,
    obligaciones_comercio: `${A} se obliga a: a) prestar los servicios con diligencia, calidad profesional y en los plazos acordados; b) informar a ${B} sobre el avance del trabajo cuando éste lo solicite; c) guardar reserva sobre la información de ${B} a la que tenga acceso.`,
    obligaciones_cliente: `${B} se obliga a: a) pagar el precio en la forma y plazos acordados; b) proporcionar oportunamente la información, accesos y materiales que ${A} necesite para prestar los servicios; c) revisar y dar su conformidad o sus observaciones a los entregables en un plazo razonable.`,
    confidencialidad: `Las partes se obligan a mantener en reserva toda la información técnica, comercial o personal que conozcan con motivo de este contrato y a no divulgarla a terceros sin autorización escrita de la otra parte, salvo requerimiento de autoridad competente.`,
    resolucion: resolucion,
    jurisdiccion: juris,
    entrega: `${A} entregará el bien a ${B} ${plazo === "{{plazo}}" ? "en la fecha y lugar que acuerden las partes" : `en el siguiente plazo: ${plazo}`}. La propiedad y el riesgo del bien se transfieren a ${B} con la entrega y el pago total del precio.`,
    garantia: type === "alquiler"
      ? `A la firma de este contrato, ${B} podrá entregar a ${A} una garantía en el monto que las partes acuerden, que será devuelta al finalizar el contrato una vez verificado el buen estado del bien, descontando los daños que no se deban al uso normal.`
      : `${A} declara que el bien es de su legítima propiedad, que se encuentra libre de gravámenes y en el estado descrito en este contrato, y responde por los vicios ocultos conforme a ley.`,
    obligaciones: type === "confidencialidad"
      ? `${B} se obliga a: a) usar la información confidencial solo para el fin descrito en el objeto; b) protegerla con al menos el mismo cuidado que usa para su propia información; c) compartirla únicamente con las personas que necesiten conocerla, quienes quedarán sujetas a las mismas obligaciones.`
      : `Cada parte se obliga a cumplir de buena fe lo acordado en este contrato, a comunicar oportunamente a la otra cualquier hecho que afecte su cumplimiento y a colaborar para que el objeto del contrato se cumpla.`,
    uso: `${B} usará el bien únicamente para el fin acordado, lo conservará en buen estado, no lo subarrendará ni lo cederá a terceros sin autorización escrita de ${A}, y asumirá los daños que no se deban al uso normal.`,
    devolucion: type === "confidencialidad"
      ? `Al terminar la relación o cuando ${A} lo solicite, ${B} devolverá o destruirá la información confidencial y sus copias, y confirmará por escrito que lo hizo.`
      : `Al vencimiento del plazo, ${B} devolverá el bien a ${A} en el mismo estado en que lo recibió, salvo el desgaste por uso normal.`,
    informacion: `Se considera información confidencial toda la información técnica, comercial, financiera o de cualquier otra naturaleza que ${A} comparta con ${B}, por cualquier medio, identificada o no como confidencial.`,
    excepciones: `No se considera información confidencial la que sea de dominio público sin culpa de ${B}, la que ${B} ya conocía legítimamente antes de recibirla, o la que deba revelarse por orden de autoridad competente, en cuyo caso ${B} avisará previamente a ${A}.`,
    incumplimiento: `El incumplimiento de este acuerdo faculta a ${A} a exigir el cese inmediato del uso indebido de la información y el resarcimiento de los daños y perjuicios causados, conforme a ley.`,
  };
  return CONTRACT_OUTLINE[type].map((clause) => ({ type: "clause", title: clause.title, text: texts[clause.key] ?? "" }));
}
