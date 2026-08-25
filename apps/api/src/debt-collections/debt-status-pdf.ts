import PDFDocument from "pdfkit";

export type DebtStatusPdfInput = {
  name: string;
  currency: string;
  createdAt: Date;
  store: { name: string };
  debts: Array<{
    customerName: string;
    customerDocument: string;
    reference: string | null;
    amount: number;
    status: "PENDING" | "PAID";
    paidAt: Date | null;
  }>;
};

const AMBER = "#ffbd59";
const INK = "#111111";
const MUTED = "#666666";
const LINE = "#d4d4d4";
const GREEN = "#16835f";
const PALE_GREEN = "#dcfce7";
const PALE_GRAY = "#f4f4f5";

function money(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function date(value: Date): string {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: "America/La_Paz" }).format(value);
}

function drawCheck(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save().lineWidth(1.8).strokeColor(INK).moveTo(x, y + 4).lineTo(x + 3.5, y + 7.5).lineTo(x + 10, y).stroke().restore();
}

export async function createDebtStatusPdf(input: DebtStatusPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 42, right: 42, bottom: 52, left: 42 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.info.Title = `Estado de pagos - ${input.name}`;
  doc.info.Author = "pagosYa";
  doc.info.Subject = `Estado de pagadores de ${input.store.name}`;

  const paid = input.debts.filter((debt) => debt.status === "PAID");
  const pending = input.debts.filter((debt) => debt.status === "PENDING");
  const collected = paid.reduce((sum, debt) => sum + debt.amount, 0);
  const outstanding = pending.reduce((sum, debt) => sum + debt.amount, 0);
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 84;
  const columns = { mark: 22, person: 177, document: 86, amount: 94, status: 90 };

  const drawTop = (continuation = false): number => {
    doc.rect(0, 0, pageWidth, continuation ? 72 : 106).fill(AMBER);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("PAGOSYA", 42, 28, { characterSpacing: 1.4 });
    doc.fontSize(continuation ? 16 : 22).text(input.name, 42, continuation ? 45 : 51, { width: contentWidth, ellipsis: true });
    if (!continuation) {
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(`${input.store.name}  |  Generado ${date(new Date())}`, 42, 82, { width: contentWidth });
    }
    return continuation ? 92 : 126;
  };

  const drawSummary = (y: number): number => {
    const gap = 8;
    const width = (contentWidth - gap * 3) / 4;
    const values = [
      [String(input.debts.length), "PERSONAS"],
      [String(paid.length), "PAGARON"],
      [money(collected, input.currency), "COBRADO"],
      [money(outstanding, input.currency), "PENDIENTE"],
    ];
    values.forEach(([value, label], index) => {
      const x = 42 + index * (width + gap);
      doc.rect(x, y, width, 52).fill(index === 1 ? PALE_GREEN : PALE_GRAY);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(index > 1 ? 11 : 16).text(value, x + 9, y + 10, { width: width - 18, ellipsis: true });
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7).text(label, x + 9, y + 34, { width: width - 18, characterSpacing: 0.7 });
    });
    return y + 70;
  };

  const drawTableHeader = (y: number): number => {
    doc.rect(42, y, contentWidth, 24).fill(INK);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
    let x = 42;
    doc.text("", x, y + 8, { width: columns.mark }); x += columns.mark;
    doc.text("PERSONA", x, y + 8, { width: columns.person }); x += columns.person;
    doc.text("CARNET / REF.", x, y + 8, { width: columns.document }); x += columns.document;
    doc.text("MONTO", x, y + 8, { width: columns.amount, align: "right" }); x += columns.amount;
    doc.text("ESTADO", x, y + 8, { width: columns.status, align: "right" });
    return y + 24;
  };

  let y = drawTableHeader(drawSummary(drawTop()));
  input.debts.forEach((debt, index) => {
    const rowHeight = 38;
    if (y + rowHeight > doc.page.height - 62) {
      doc.addPage();
      y = drawTableHeader(drawTop(true));
    }
    const isPaid = debt.status === "PAID";
    if (index % 2 === 1) doc.rect(42, y, contentWidth, rowHeight).fill("#fafafa");
    doc.strokeColor(LINE).lineWidth(0.5).moveTo(42, y + rowHeight).lineTo(42 + contentWidth, y + rowHeight).stroke();
    if (isPaid) {
      doc.rect(47, y + 11, 14, 14).fill(PALE_GREEN).strokeColor(GREEN).lineWidth(1).stroke();
      drawCheck(doc, 49, y + 13);
    } else {
      doc.rect(47, y + 11, 14, 14).strokeColor(LINE).lineWidth(1).stroke();
    }
    let x = 42 + columns.mark;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text(debt.customerName, x, y + 7, { width: columns.person - 8, height: 25, ellipsis: true });
    x += columns.person;
    doc.fillColor(INK).font("Helvetica").fontSize(8).text(debt.customerDocument, x, y + 7, { width: columns.document - 7, ellipsis: true });
    if (debt.reference) doc.fillColor(MUTED).fontSize(6.8).text(debt.reference, x, y + 20, { width: columns.document - 7, ellipsis: true });
    x += columns.document;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(8).text(money(debt.amount, input.currency), x, y + 12, { width: columns.amount - 8, align: "right" });
    x += columns.amount;
    doc.fillColor(isPaid ? GREEN : MUTED).font("Helvetica-Bold").fontSize(8).text(isPaid ? "PAGADO" : "PENDIENTE", x, y + (isPaid && debt.paidAt ? 7 : 12), { width: columns.status, align: "right" });
    if (isPaid && debt.paidAt) doc.fillColor(MUTED).font("Helvetica").fontSize(6.8).text(date(debt.paidAt), x, y + 20, { width: columns.status, align: "right" });
    y += rowHeight;
  });

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(
      `Estado registrado al ${date(new Date())}  |  Pagina ${index + 1} de ${range.count}`,
      42,
      doc.page.height - 62,
      { width: contentWidth, align: "center", lineBreak: false },
    );
  }

  doc.end();
  return completed;
}
