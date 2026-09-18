import PDFDocument from 'pdfkit';
import type { BookInput, ShipmentParty } from './carriers/carrier';
import { DEPARTMENT_LABELS, type Department } from './bolivia-address';
import type { SizeClass } from './parcel';

const INK = '#111111';
const MUTED = '#666666';
const ALERT = '#b91c1c';
const VEHICLE_LABELS: Record<SizeClass, string> = { MOTO: 'Moto', AUTO: 'Auto', CAMIONETA: 'Camioneta' };

function money(cents: number, currency: string) {
  return `${(cents / 100).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function partyBlock(doc: PDFKit.PDFDocument, title: string, party: ShipmentParty, x: number, y: number) {
  doc.fillColor(MUTED).fontSize(9).text(title.toUpperCase(), x, y);
  doc.fillColor(INK).fontSize(12).text(party.name, x, y + 14, { width: 240 });
  doc.fontSize(10).text(party.phone, { width: 240 });
  doc.text(party.street, { width: 240 });
  doc.text(`${party.city}, ${DEPARTMENT_LABELS[party.department as Department] ?? party.department}`, { width: 240 });
  if (party.references) doc.fillColor(MUTED).text(`Ref.: ${party.references}`, { width: 240 });
}

export function renderWaybillPdf(input: BookInput & { carrierName: string; storeName: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 28 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const parcel = input.parcel;
    const mark = [parcel?.fragile ? 'FRÁGIL' : null, parcel?.noStack ? 'NO APILAR' : null].filter(Boolean).join(' · ');
    // With a handling mark the header keeps to the left half (at most two lines) so the banner never overprints it.
    doc.fillColor(INK).fontSize(18).text(`Guía de envío · ${input.carrierName}`, 28, 28, mark ? { width: 260, height: 44, ellipsis: true } : { width: 539 });
    doc.fillColor(MUTED).fontSize(10).text(`Pedido ${input.orderReference} · ${input.storeName} · ${new Date().toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })}`);
    partyBlock(doc, 'Remitente', input.origin, 28, 90);
    partyBlock(doc, 'Destinatario', input.destination, 300, 90);
    doc.fillColor(INK).fontSize(10)
      .text(`Peso: ${input.weightGrams === null ? 'por pesar' : `${(input.weightGrams / 1000).toFixed(2)} kg`}`, 28, 230);
    if (parcel && parcel.lengthCm !== null && parcel.widthCm !== null && parcel.heightCm !== null) doc.text(`Medidas: ${parcel.lengthCm}×${parcel.widthCm}×${parcel.heightCm} cm`);
    if (parcel?.sizeClass) doc.text(`Vehículo: ${VEHICLE_LABELS[parcel.sizeClass]}`);
    doc
      .text(`Valor declarado: ${money(input.declaredAmount, input.currency)}`)
      .text(`Contenido: ${input.items.map(item => `${item.name} ×${item.quantity}`).join(', ').slice(0, 300)}`, { width: 520 });
    doc.fillColor(MUTED).fontSize(9).text(`Nº de seguimiento del courier: ______________________   ID PagosYa: ${input.shipmentId}`, 28, 330);
    if (mark) doc.fillColor(ALERT).font('Helvetica-Bold').fontSize(16).text(mark, 300, 28, { width: 260, align: 'right' });
    doc.end();
  });
}
