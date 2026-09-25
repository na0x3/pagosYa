import PDFDocument = require("pdfkit");
import { collectPdfBuffer, ensureNewPage, money, writeWrappedLines, type PdfPageHeader } from "../reports/finance-pdfs";
import type { BusinessDocumentKindName, DocumentSnapshot } from "./business-document-snapshot";

const INK = "#111111";
const MUTED = "#666666";
const LINE = "#d4d4d4";
const MARGIN = 42;
const VOID_RED = "#b91c1c";

export const DOCUMENT_KIND_LABEL: Record<BusinessDocumentKindName, string> = {
  INVOICE: "Cobro",
  PROPOSAL: "Propuesta",
  CONTRACT: "Contrato",
};

export type BusinessDocumentPdfInput = {
  storeName: string;
  /** Image bytes (PNG/JPEG). The renderer never fetches a URL; the caller resolves the logo. */
  logo?: Buffer | null;
  numberLabel: string;
  version: number;
  /** Empty for a preview that has not been frozen yet. */
  sha256: string;
  snapshot: DocumentSnapshot;
  /** ISO date. When set, every page carries an ANULADO stamp and the void date. */
  voidedAt?: string | null;
};

export function documentDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-BO", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/La_Paz" }).format(new Date(value));
}

/**
 * The PDF a customer receives for a cobro, proposal or contract: store header,
 * customer, items and totals, the content blocks, and on every page a footer
 * naming the exact version (number, version, sha256 prefix) it was rendered from.
 */
export async function renderBusinessDocumentPdf(input: BusinessDocumentPdfInput): Promise<Buffer> {
  const { snapshot } = input;
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, right: MARGIN, bottom: 64, left: MARGIN }, bufferPages: true });
  const output = collectPdfBuffer(doc);
  const width = doc.page.width - MARGIN * 2;
  const kindLabel = DOCUMENT_KIND_LABEL[snapshot.kind];

  const continuationHeader: PdfPageHeader = (page) => {
    page.fillColor(MUTED).font("Helvetica").fontSize(9).text(input.storeName, MARGIN, MARGIN, { width: width / 2, lineBreak: false, ellipsis: true });
    page.text(`${kindLabel} ${input.numberLabel}`, MARGIN + width / 2, MARGIN, { width: width / 2, align: "right", lineBreak: false });
    page.moveTo(MARGIN, MARGIN + 16).lineTo(MARGIN + width, MARGIN + 16).strokeColor(LINE).lineWidth(0.8).stroke();
    page.fillColor(INK);
    page.x = MARGIN;
    page.y = MARGIN + 28;
  };

  // First-page header: logo and store name on the left, kind and number on the right.
  let nameX = MARGIN;
  if (input.logo) {
    try {
      doc.image(input.logo, MARGIN, MARGIN, { fit: [48, 48] });
      nameX = MARGIN + 58;
    } catch {
      // An unreadable logo must not cost the customer their document.
    }
  }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(18).text(input.storeName, nameX, MARGIN + 12, { width: width * 0.6 - (nameX - MARGIN), ellipsis: true, lineBreak: false });
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(9).text(kindLabel.toUpperCase(), MARGIN + width * 0.6, MARGIN + 4, { width: width * 0.4, align: "right", characterSpacing: 1.2 });
  doc.fillColor(INK).fontSize(16).text(input.numberLabel, MARGIN + width * 0.6, MARGIN + 18, { width: width * 0.4, align: "right" });
  doc.moveTo(MARGIN, MARGIN + 60).lineTo(MARGIN + width, MARGIN + 60).strokeColor(LINE).lineWidth(0.8).stroke();

  doc.x = MARGIN;
  doc.y = MARGIN + 76;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text(snapshot.title, { width });
  if (input.voidedAt) {
    doc.moveDown(0.3).fillColor(VOID_RED).font("Helvetica-Bold").fontSize(10)
      .text(`Documento anulado el ${documentDate(input.voidedAt)}. Ya no tiene validez.`, { width });
  }
  const dates = [
    snapshot.dueAt ? `Vence: ${documentDate(snapshot.dueAt)}` : "",
    snapshot.validUntil ? `Válido hasta: ${documentDate(snapshot.validUntil)}` : "",
  ].filter(Boolean);
  if (dates.length) doc.moveDown(0.2).fillColor(MUTED).font("Helvetica").fontSize(9).text(dates.join("   ·   "), { width });

  const customer = [snapshot.customer.name, snapshot.customer.email, snapshot.customer.phone, snapshot.customer.document ? `NIT/CI ${snapshot.customer.document}` : null]
    .filter((line): line is string => Boolean(line));
  if (customer.length) {
    doc.moveDown(0.8).fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("PARA", { characterSpacing: 1 });
    doc.fillColor(INK).font("Helvetica").fontSize(10);
    customer.forEach((line) => doc.text(line, { width }));
  }

  if (snapshot.items.length) {
    const columns = [
      { label: "Descripción", width: width * 0.52, align: "left" as const },
      { label: "Cant.", width: width * 0.1, align: "right" as const },
      { label: "Precio", width: width * 0.19, align: "right" as const },
      { label: "Importe", width: width * 0.19, align: "right" as const },
    ];
    const row = (cells: string[], bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5);
      const height = Math.max(...cells.map((cell, index) => doc.heightOfString(cell, { width: columns[index].width - 6 })));
      ensureNewPage(doc, height + 10, kindLabel, continuationHeader);
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(bold ? MUTED : INK);
      const top = doc.y;
      let x = MARGIN;
      cells.forEach((cell, index) => {
        doc.text(cell, x + (index ? 6 : 0), top, { width: columns[index].width - 6, align: columns[index].align });
        x += columns[index].width;
      });
      doc.y = top + height + 5;
      doc.moveTo(MARGIN, doc.y - 2).lineTo(MARGIN + width, doc.y - 2).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.x = MARGIN;
    };
    doc.moveDown(1.2);
    row(columns.map((column) => column.label), true);
    snapshot.items.forEach((item) => row([
      item.description,
      String(item.quantity),
      money(item.unitAmount, snapshot.currency),
      money(item.amount, snapshot.currency),
    ]));

    const totals: Array<[string, string, boolean]> = [["Subtotal", money(snapshot.subtotalAmount, snapshot.currency), false]];
    if (snapshot.discountAmount > 0) totals.push(["Descuento", `-${money(snapshot.discountAmount, snapshot.currency)}`, false]);
    totals.push(["Total", money(snapshot.totalAmount, snapshot.currency), true]);
    ensureNewPage(doc, totals.length * 18 + 12, kindLabel, continuationHeader);
    doc.moveDown(0.5);
    totals.forEach(([label, value, strong]) => {
      const top = doc.y;
      doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 12 : 10).fillColor(strong ? INK : MUTED);
      doc.text(label, MARGIN + width * 0.5, top, { width: width * 0.25, align: "right" });
      doc.fillColor(INK).text(value, MARGIN + width * 0.75, top, { width: width * 0.25, align: "right" });
      doc.y = top + (strong ? 18 : 15);
    });
    doc.x = MARGIN;
  }

  if (snapshot.blocks.length) doc.moveDown(1);
  for (const block of snapshot.blocks) {
    if (block.type === "heading") {
      ensureNewPage(doc, 36, kindLabel, continuationHeader);
      doc.moveDown(0.6).fillColor(INK).font("Helvetica-Bold").fontSize(13).text(block.text ?? block.title ?? "", MARGIN, doc.y, { width });
      doc.moveDown(0.2);
      continue;
    }
    if (block.title) {
      ensureNewPage(doc, 30, kindLabel, continuationHeader);
      doc.moveDown(0.4).fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(block.title, MARGIN, doc.y, { width });
    }
    doc.fillColor(INK);
    const lines = [
      ...(block.text ? block.text.split(/\n+/) : []),
      ...(block.items ?? []).map((item) => `•  ${item}`),
    ];
    writeWrappedLines(doc, lines, kindLabel, 10, continuationHeader);
    doc.moveDown(0.3);
  }

  // Footer on every page, drawn last so it knows the page count.
  const range = doc.bufferedPageRange();
  const identity = input.sha256 ? `${input.numberLabel} · v${input.version} · sha256 ${input.sha256.slice(0, 12)}` : input.numberLabel;
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.5)
      .text(`${identity} · Página ${index - range.start + 1} de ${range.count}`, MARGIN, doc.page.height - 36, { width, align: "center", lineBreak: false });
    if (input.voidedAt) {
      // A diagonal stamp across the page, drawn over the content so no page reads as valid.
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
