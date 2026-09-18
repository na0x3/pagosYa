import { renderWaybillPdf } from './waybill-pdf';
import type { Parcel } from './parcel';

const party = { name: 'Tienda Sol', phone: '+59170000000', department: 'LA_PAZ', city: 'La Paz', street: 'Calle 21 #100' };
const input = {
  shipmentId: 'shp_1', orderReference: 'AB12CD34', carrierName: 'Servientrega Bolivia', storeName: 'Tienda Sol',
  origin: party, destination: { ...party, name: 'Ana Quispe', department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', references: 'Portón verde' },
  weightGrams: 1200, parcel: null as Parcel | null, declaredAmount: 15000, currency: 'BOB', pickupAt: null, items: [{ name: 'Café 500 g', quantity: 2 }],
};

describe('renderWaybillPdf', () => {
  it('produces a one-page PDF', async () => {
    const pdf = await renderWaybillPdf(input);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
  it('handles unknown weight and missing references', async () => {
    const pdf = await renderWaybillPdf({ ...input, weightGrams: null, destination: { ...input.destination, references: undefined } });
    expect(pdf.length).toBeGreaterThan(1000);
  });
  it('prints the parcel measures, vehicle and handling marks on one page', async () => {
    const parcel: Parcel = { weightGrams: 1200, lengthCm: 30, widthCm: 20, heightCm: 15, fragile: true, noStack: true, sizeClass: 'MOTO' };
    const pdf = await renderWaybillPdf({ ...input, parcel });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdf.length).toBeGreaterThan((await renderWaybillPdf(input)).length);
  });
});
