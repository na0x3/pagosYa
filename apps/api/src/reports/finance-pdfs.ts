import PDFDocument = require("pdfkit");

type OrderPdfRow = {
  kind: "PAYMENT" | "LEAD";
  id: string;
  storeName: string | null;
  createdAt: Date;
  status: string;
  paymentMethodType: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  description: string | null;
  itemsLabel: string;
  amount: number;
  currency: string;
};

type PayoutPdfRow = {
  id: string;
  amount: number;
  currency: string;
  bankAccount: string;
  status: string;
  paidOutAt: Date | null;
  createdAt: Date;
};

type FinanceSummaryPdfPayload = {
  scope: {
    type: "STORE" | "MERCHANT";
    storeName?: string | null;
  };
  currency: string;
  totalRevenue: number;
  paymentCount: number;
  unattributedRevenue: number;
  unattributedPaymentCount: number;
  inventoryValue: number;
  totalStoreViews: number;
  revenueByPaymentMethod: Array<{ paymentMethodType: string | null; amount: number; paymentCount: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  monthlyProjection: {
    monthToDateRevenue: number;
    projectedRevenue: number;
    elapsedDays: number;
    daysInMonth: number;
  };
  bestSalesDay: { name: string; paymentCount: number } | null;
  salesByWeekday: Array<{ name: string; paymentCount: number; amount: number }>;
};

const AMBER = "#ffbd59";
const INK = "#111111";
const MUTED = "#666666";
const LINE = "#d4d4d4";

function money(cents: number, currency = "BOB"): string {
  return `${(cents / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-BO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

function orderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    SUCCEEDED: "Pagado",
    FAILED: "Fallido",
    CANCELED: "Cancelado",
    REQUIRES_PAYMENT_METHOD: "Sin método",
    REQUIRES_CONFIRMATION: "Por confirmar",
    PROCESSING: "Procesando",
    REQUIRES_ACTION: "Necesita acción",
    LEAD_RECEIVED: "Interesado",
  };
  return map[status] || status;
}

async function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function applyHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string): void {
  const pageWidth = doc.page.width;
  doc.rect(0, 0, pageWidth, 94).fill(AMBER);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("PAGOSYA", 42, 28, { characterSpacing: 1.4 });
  doc.fontSize(24).text(title, 42, 44, { width: doc.page.width - 84, ellipsis: true });
  doc.font("Helvetica").fontSize(9).text(subtitle, 42, 74, { width: doc.page.width - 84 });
  doc.moveDown(1.2);
}

function ensureNewPage(doc: PDFKit.PDFDocument, needed = 56, title = "PAGOSYA"): void {
  if (doc.y + needed > doc.page.height - (doc.page.margins.bottom + 8)) {
    doc.addPage();
    applyHeader(doc, title, `Página continuada · Generado ${formatDate(new Date())}`);
    doc.y = 120;
  }
}

function writeWrappedLines(doc: PDFKit.PDFDocument, lines: string[], title: string, fontSize = 8.5): void {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lineGap = 2;
  doc.font("Helvetica").fontSize(fontSize).lineGap(lineGap);
  for (const line of lines) {
    const height = doc.heightOfString(line, { width, lineGap });
    ensureNewPage(doc, height + 8, title);
    doc.text(line, { width, lineGap });
  }
}

export async function createOrdersPdf(orders: OrderPdfRow[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 42, right: 42, bottom: 56, left: 42 } });
  const output = collectPdfBuffer(doc);

  applyHeader(
    doc,
    "Reporte de pagos",
    `Pedidos y pagos descargados · Generado ${formatDate(new Date())}`,
  );

  const paymentRows = orders.filter((order) => order.kind === "PAYMENT");
  const leadRows = orders.filter((order) => order.kind === "LEAD");
  const totalMoney = paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0);
  const currency = orders[0]?.currency || "BOB";
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Resumen");
  doc.moveDown(0.15);
  doc.fillColor(INK).font("Helvetica").fontSize(10).text(`Total de registros: ${orders.length}`);
  doc.text(`Pagos: ${paymentRows.length} · Interesados: ${leadRows.length}`);
  doc.text(`Monto total de pagos: ${money(totalMoney, currency)}`);
  doc.moveDown(0.6);
  doc.text("Detalle", { underline: true });

  if (!orders.length) {
    doc.moveDown(0.35);
    doc.fillColor(MUTED).font("Helvetica-Oblique").text("No hay registros para exportar con los filtros seleccionados.");
  } else {
    orders.forEach((order, index) => {
      ensureNewPage(doc, 30, "Reporte de pagos");
      const rowTitle = `${index + 1}. ${order.kind === "PAYMENT" ? "Pago" : "Interesado"} ${order.id}`;
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(rowTitle);
      const lines = [
        `Estado: ${orderStatusLabel(order.status)} · Fecha: ${formatDate(order.createdAt)}`,
        `Tienda: ${order.storeName || "Sin tienda"}`,
      ];
      if (order.kind === "PAYMENT") {
        lines.push(`Monto: ${money(order.amount, order.currency)}`);
        if (order.paymentMethodType) lines.push(`Método: ${order.paymentMethodType}`);
      }
      if (order.customerName || order.customerEmail || order.customerPhone) {
        lines.push(`Comprador: ${order.customerName || "Sin nombre"}${order.customerEmail ? ` · ${order.customerEmail}` : ""}${order.customerPhone ? ` · ${order.customerPhone}` : ""}`);
      }
      if (order.description) lines.push(`Mensaje: ${order.description}`);
      if (order.itemsLabel) lines.push(`Productos: ${order.itemsLabel}`);
      doc.fillColor(INK);
      writeWrappedLines(doc, lines, "Reporte de pagos");
      ensureNewPage(doc, 16, "Reporte de pagos");
      doc.strokeColor(LINE).lineWidth(0.5).moveTo(42, doc.y + 7).lineTo(doc.page.width - 42, doc.y + 7).stroke();
      doc.moveDown(0.45);
    });
  }

  doc.end();
  return output;
}

export async function createPayoutsPdf(payouts: PayoutPdfRow[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 42, right: 42, bottom: 56, left: 42 } });
  const output = collectPdfBuffer(doc);

  applyHeader(
    doc,
    "Reporte de desembolsos",
    `Desembolsos exportados · Generado ${formatDate(new Date())}`,
  );

  const total = payouts.reduce((sum, payout) => sum + (payout.amount || 0), 0);
  const currency = payouts[0]?.currency || "BOB";
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Resumen");
  doc.moveDown(0.2);
  doc.fillColor(INK).font("Helvetica").fontSize(10);
  doc.text(`Total de desembolsos: ${payouts.length}`);
  doc.text(`Monto total: ${money(total, currency)}`);
  doc.moveDown(0.55);
  doc.text("Detalle", { underline: true });
  if (!payouts.length) {
    doc.moveDown(0.35);
    doc.fillColor(MUTED).font("Helvetica-Oblique").text("No hay desembolsos para exportar.");
  } else {
    payouts.forEach((payout, index) => {
      ensureNewPage(doc, 30, "Reporte de desembolsos");
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(`${index + 1}. Desembolso ${payout.id}`);
      doc.fillColor(INK);
      writeWrappedLines(doc, [
        `Estado: ${payout.status}`,
        `Monto: ${money(payout.amount, payout.currency)} · Cuenta: ${payout.bankAccount}`,
        `Fecha programada: ${formatDate(payout.createdAt)} · Fecha de pago: ${formatDate(payout.paidOutAt)}`,
      ], "Reporte de desembolsos");
      ensureNewPage(doc, 16, "Reporte de desembolsos");
      doc.strokeColor(LINE).lineWidth(0.5).moveTo(42, doc.y + 6).lineTo(doc.page.width - 42, doc.y + 6).stroke();
      doc.moveDown(0.45);
    });
  }

  doc.end();
  return output;
}

export async function createFinancesPdf(finances: FinanceSummaryPdfPayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 42, right: 42, bottom: 56, left: 42 } });
  const output = collectPdfBuffer(doc);
  const scopeLabel = finances.scope.type === "STORE" && finances.scope.storeName ? `Finanzas de ${finances.scope.storeName}` : "Finanzas de todo el negocio";
  const currency = finances.currency || "BOB";

  applyHeader(
    doc,
    scopeLabel,
    `Resumen financiero exportado · Generado ${formatDate(new Date())}`,
  );

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Indicadores principales");
  doc.moveDown(0.2);
  doc.fillColor(INK).font("Helvetica").fontSize(10);
  doc.text(`Ingresos totales: ${money(finances.totalRevenue, currency)} (${finances.paymentCount} pagos)`);
  doc.text(`Cobros directos por API: ${money(finances.unattributedRevenue, currency)} (${finances.unattributedPaymentCount} pagos)`);
  doc.text(`Valor de inventario: ${money(finances.inventoryValue, currency)}`);
  doc.text(`Visitas del negocio: ${finances.totalStoreViews}`);
  doc.moveDown(0.55);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Métodos de pago");
  doc.font("Helvetica").fontSize(10).moveDown(0.2);
  if (!finances.revenueByPaymentMethod.length) {
    doc.fillColor(MUTED).text("Sin pagos exitosos registrados aún.");
  } else {
    finances.revenueByPaymentMethod.forEach((entry) => {
      doc.fillColor(INK);
      ensureNewPage(doc, 24, scopeLabel);
      doc.text(`${entry.paymentMethodType || "Sin método"}: ${money(Number(entry.amount), currency)} (${Number(entry.paymentCount)} ${Number(entry.paymentCount) === 1 ? "venta" : "ventas"})`);
    });
  }
  doc.moveDown(0.55);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Productos top");
  doc.font("Helvetica").fontSize(10).moveDown(0.2);
  if (!finances.topProducts.length) {
    doc.fillColor(MUTED).text("Sin producto vendido con detalle suficiente.");
  } else {
    finances.topProducts.slice(0, 10).forEach((product, index) => {
      doc.fillColor(INK);
      ensureNewPage(doc, 24, scopeLabel);
      doc.text(`${index + 1}. ${product.name} · ${product.quantity} uds · ${money(product.revenue, currency)}`);
    });
  }
  doc.moveDown(0.55);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Resumen mensual proyectado");
  ensureNewPage(doc, 68, scopeLabel);
  doc.font("Helvetica").fontSize(10).moveDown(0.2);
  doc.text(`Acumulado: ${money(finances.monthlyProjection.monthToDateRevenue, currency)}`);
  doc.text(`Proyección mensual: ${money(finances.monthlyProjection.projectedRevenue, currency)}`);
  if (finances.monthlyProjection.daysInMonth) {
    doc.text(`Día ${finances.monthlyProjection.elapsedDays} de ${finances.monthlyProjection.daysInMonth}`);
  }
  doc.moveDown(0.55);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Días con más ventas");
  ensureNewPage(doc, 42, scopeLabel);
  doc.font("Helvetica").fontSize(10).moveDown(0.2);
  if (!finances.salesByWeekday.length) {
    doc.fillColor(MUTED).text("Sin datos de actividad para esta ventana.");
  } else {
    finances.bestSalesDay
      ? doc.text(`Día más activo: ${finances.bestSalesDay.name} · ${finances.bestSalesDay.paymentCount} ventas`)
      : doc.text("Sin día más activo definido.");
    finances.salesByWeekday.forEach((row) => {
      doc.fillColor(INK);
      ensureNewPage(doc, 24, scopeLabel);
      doc.text(`${row.name}: ${row.paymentCount} ventas · ${money(row.amount, currency)}`);
    });
  }

  doc.end();
  return output;
}
