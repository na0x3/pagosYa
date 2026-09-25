import PDFDocument = require("pdfkit");
import { collectPdfBuffer, ensureNewPage, writeWrappedLines, type PdfPageHeader } from "../reports/finance-pdfs";
import type { DocumentSnapshot } from "./business-document-snapshot";
import { documentDate } from "./business-document-pdf";
import { clauseOrdinal } from "./contract-terms";
import { boliviaTime } from "./contract-signing";

const INK = "#111111";
const MUTED = "#5f5f5f";
const LINE = "#d4d4d4";
const ACCENT = "#0f5132";
const MARGIN = 50;
const VOID_RED = "#b91c1c";

export type ContractPdfSignature = {
  role: "MERCHANT" | "CUSTOMER";
  name: string;
  method: "TYPED" | "DRAWN";
  email: string;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  codeVerifiedAt: Date | null;
  imageUrl: string | null;
  versionSha256: string;
};

export type ContractPdfInput = {
  storeName: string;
  logo?: Buffer | null;
  numberLabel: string;
  version: number;
  sha256: string;
  snapshot: DocumentSnapshot;
  /** Signatures of this version (none, one or both). */
  signatures: ContractPdfSignature[];
  voidedAt?: string | null;
};

/** pdfkit's standard fonts are WinAnsi: keep the text inside it. */
const ansi = (value: string) => value.replace(/[−‐‑–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

const pngBytes = (dataUrl: string | null) => {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl ?? "");
  return match ? Buffer.from(match[1], "base64") : null;
};

export const SIGNATURE_LEVEL_NOTICE =
  "Este contrato se firmó con firma electrónica simple: cada firmante se identificó con su nombre y, en el caso del cliente, con un código de un solo uso enviado a su correo electrónico. " +
  "No es una firma digital con certificado (ADSIB, Ley 164). Para escrituras públicas, compraventa de inmuebles o vehículos, y ciertos actos laborales o societarios, consulta a un abogado o notario.";

/**
 * The contract PDF: header, title, preamble, numbered clauses (Partes and Domicilios written
 * from the frozen party data), closing and signature block; when anyone signed, an evidence page
 * "Registro de firma electrónica". Every page's footer names the number, version and hash.
 */
export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  const { snapshot } = input;
  const contract = snapshot.contract;
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, right: MARGIN, bottom: 70, left: MARGIN }, bufferPages: true, info: { Title: ansi(`${input.numberLabel} ${snapshot.title}`) } });
  const output = collectPdfBuffer(doc);
  const width = doc.page.width - MARGIN * 2;
  const voided = Boolean(input.voidedAt);

  const continuationHeader: PdfPageHeader = (page) => {
    page.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(ansi(input.storeName), MARGIN, MARGIN - 18, { width: width / 2, lineBreak: false, ellipsis: true });
    page.text(`Contrato ${input.numberLabel}`, MARGIN + width / 2, MARGIN - 18, { width: width / 2, align: "right", lineBreak: false });
    page.moveTo(MARGIN, MARGIN - 4).lineTo(MARGIN + width, MARGIN - 4).strokeColor(LINE).lineWidth(0.6).stroke();
    page.fillColor(INK);
    page.x = MARGIN;
    page.y = MARGIN + 8;
  };

  // Header: logo + store on the left, CONTRATO + number on the right.
  let nameX = MARGIN;
  if (input.logo) {
    try {
      doc.image(input.logo, MARGIN, MARGIN - 10, { fit: [40, 40] });
      nameX = MARGIN + 50;
    } catch {
      // An unreadable logo must not cost anyone their contract.
    }
  }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(14).text(ansi(input.storeName), nameX, MARGIN, { width: width * 0.6 - (nameX - MARGIN), ellipsis: true, lineBreak: false });
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("CONTRATO", MARGIN + width * 0.6, MARGIN - 6, { width: width * 0.4, align: "right", characterSpacing: 1.4 });
  doc.fillColor(INK).fontSize(13).text(input.numberLabel, MARGIN + width * 0.6, MARGIN + 6, { width: width * 0.4, align: "right" });
  doc.moveTo(MARGIN, MARGIN + 34).lineTo(MARGIN + width, MARGIN + 34).strokeColor(LINE).lineWidth(0.8).stroke();

  doc.x = MARGIN;
  doc.y = MARGIN + 52;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text(ansi(snapshot.title.toUpperCase()), { width, align: "center" });
  if (contract && contract.typeTitle.toLowerCase() !== snapshot.title.toLowerCase()) {
    doc.moveDown(0.2).fillColor(MUTED).font("Helvetica").fontSize(9.5).text(ansi(contract.typeTitle), { width, align: "center" });
  }
  if (voided) {
    doc.moveDown(0.6).fillColor(VOID_RED).font("Helvetica-Bold").fontSize(10).text(`Contrato anulado el ${documentDate(input.voidedAt!)}. Ya no tiene validez.`, { width, align: "center" });
  }

  if (!voided && contract) {
    doc.moveDown(1).fillColor(INK).font("Helvetica").fontSize(10.5).text(ansi(contract.preamble), { width, align: "justify", lineGap: 2 });
    const clauses = [
      { title: "Partes", text: contract.partes },
      ...snapshot.blocks.map((block) => ({ title: block.title ?? "", text: [block.text ?? "", ...(block.items ?? []).map((item) => `•  ${item}`)].filter(Boolean).join("\n") })),
      { title: "Domicilios y firma electrónica", text: contract.domicilios },
    ];
    clauses.forEach((clause, index) => {
      ensureNewPage(doc, 60, "Contrato", continuationHeader);
      doc.moveDown(0.8).fillColor(INK).font("Helvetica-Bold").fontSize(10.5)
        .text(ansi(`${clauseOrdinal(index + 1)}.- (${clause.title.toUpperCase()})`), MARGIN, doc.y, { width });
      doc.moveDown(0.25).font("Helvetica").fontSize(10.5);
      for (const paragraph of clause.text.split(/\n+/)) {
        ensureNewPage(doc, 28, "Contrato", continuationHeader);
        doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(ansi(paragraph), MARGIN, doc.y, { width, align: "justify", lineGap: 2 });
        doc.moveDown(0.2);
      }
    });
    ensureNewPage(doc, 60, "Contrato", continuationHeader);
    doc.moveDown(0.8).fillColor(INK).font("Helvetica").fontSize(10.5).text(ansi(contract.closing), MARGIN, doc.y, { width, align: "justify", lineGap: 2 });

    // Signature block: two columns, one per party.
    ensureNewPage(doc, 150, "Contrato", continuationHeader);
    doc.moveDown(2.2);
    const top = doc.y;
    const column = (width - 30) / 2;
    const parties: Array<{ role: "MERCHANT" | "CUSTOMER"; label: string; party: string; doc: string }> = [
      { role: "MERCHANT", label: contract.roles.merchant, party: contract.merchantParty.legalName, doc: contract.merchantParty.document },
      { role: "CUSTOMER", label: contract.roles.customer, party: contract.customerParty.name, doc: contract.customerParty.document },
    ];
    parties.forEach((party, index) => {
      const x = MARGIN + index * (column + 30);
      const signature = input.signatures.find((entry) => entry.role === party.role);
      const image = signature?.method === "DRAWN" ? pngBytes(signature.imageUrl) : null;
      if (image) {
        try {
          doc.image(image, x + 10, top, { fit: [column - 20, 46] });
        } catch {
          // A damaged drawing still leaves the typed name below.
        }
      } else if (signature) {
        doc.fillColor(ACCENT).font("Helvetica-Oblique").fontSize(17).text(ansi(signature.name), x, top + 16, { width: column, align: "center", lineBreak: false, ellipsis: true });
      }
      doc.moveTo(x, top + 52).lineTo(x + column, top + 52).strokeColor(INK).lineWidth(0.7).stroke();
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(ansi(party.party), x, top + 58, { width: column, align: "center" });
      doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(ansi(`NIT/CI ${party.doc} · ${party.label}`), x, doc.y + 1, { width: column, align: "center" });
      doc.fillColor(signature ? ACCENT : MUTED).font(signature ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
        .text(signature ? ansi(`Firmado electrónicamente por ${signature.name} el ${boliviaTime(signature.signedAt)}`) : "Pendiente de firma", x, doc.y + 2, { width: column, align: "center" });
    });
    doc.x = MARGIN;
    doc.y = Math.max(doc.y, top + 110);
  }

  // Evidence page: who signed, how, when, from where, and which exact version.
  if (!voided && input.signatures.length) {
    doc.addPage();
    continuationHeader(doc);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text("Registro de firma electrónica", MARGIN, doc.y, { width });
    doc.moveDown(0.3).fillColor(MUTED).font("Helvetica").fontSize(9.5)
      .text(ansi(`${input.numberLabel} · ${snapshot.title} · versión ${input.version}`), { width });
    doc.moveDown(0.6).fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text("HUELLA SHA-256 DE LA VERSIÓN FIRMADA", { width, characterSpacing: 0.6 });
    doc.font("Courier").fontSize(9).text(input.sha256, { width });
    const roleLabel = (role: "MERCHANT" | "CUSTOMER") => (role === "MERCHANT" ? contract?.roles.merchant ?? "Comercio" : contract?.roles.customer ?? "Cliente");
    for (const signature of input.signatures) {
      ensureNewPage(doc, 170, "Contrato", continuationHeader);
      doc.moveDown(1);
      const boxTop = doc.y;
      doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(11).text(ansi(`${roleLabel(signature.role)} — ${signature.name}`), MARGIN + 12, boxTop + 10, { width: width - 24 });
      const rows: Array<[string, string]> = [
        ["Correo", signature.email],
        ["Método", signature.method === "DRAWN" ? "Nombre escrito y firma dibujada" : "Nombre escrito"],
        ["Fecha y hora", boliviaTime(signature.signedAt)],
        ["Dirección IP", signature.ipAddress ?? "no disponible"],
        ["Dispositivo", (signature.userAgent ?? "no disponible").slice(0, 140)],
        ["Código verificado", signature.codeVerifiedAt ? `Sí, código de un solo uso enviado a ${signature.email}, verificado el ${boliviaTime(signature.codeVerifiedAt)}` : "No aplica: firmó desde su cuenta del comercio con sesión iniciada"],
        ["Versión firmada", signature.versionSha256 === input.sha256 ? `versión ${input.version} (misma huella)` : `huella ${signature.versionSha256}`],
      ];
      doc.moveDown(0.4);
      for (const [label, value] of rows) {
        const y = doc.y;
        doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(label, MARGIN + 12, y, { width: 100 });
        doc.fillColor(INK).font("Helvetica").fontSize(9).text(ansi(value), MARGIN + 116, y, { width: width - 128 });
        doc.y = Math.max(doc.y, y + 12) + 2;
      }
      doc.roundedRect(MARGIN, boxTop, width, doc.y - boxTop + 8, 6).strokeColor(LINE).lineWidth(0.8).stroke();
      doc.y += 10;
      doc.x = MARGIN;
    }
    const missing = (["MERCHANT", "CUSTOMER"] as const).filter((role) => !input.signatures.some((entry) => entry.role === role));
    if (missing.length) {
      doc.moveDown(0.8).fillColor(MUTED).font("Helvetica-Bold").fontSize(9.5).text(`Pendiente de firma: ${missing.map(roleLabel).join(" y ")}`, MARGIN, doc.y, { width });
    }
    ensureNewPage(doc, 80, "Contrato", continuationHeader);
    doc.moveDown(1);
    writeWrappedLines(doc, [ansi(SIGNATURE_LEVEL_NOTICE)], "Contrato", 8.5, continuationHeader);
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.5)
      .text(`${input.numberLabel} · v${input.version} · sha256 ${input.sha256.slice(0, 16)} · Página ${index - range.start + 1} de ${range.count}`, MARGIN, doc.page.height - 40, { width, align: "center", lineBreak: false });
    if (voided) {
      const centerX = doc.page.width / 2;
      const centerY = doc.page.height / 2;
      doc.save().rotate(-35, { origin: [centerX, centerY] }).fillColor(VOID_RED).fillOpacity(0.22).font("Helvetica-Bold").fontSize(96)
        .text("ANULADO", centerX - 260, centerY - 48, { width: 520, align: "center", lineBreak: false });
      doc.restore();
      doc.fillOpacity(1);
    }
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return output;
}
