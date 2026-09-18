import { computeParcel } from './parcel';

const line = (over: Partial<Parameters<typeof computeParcel>[0][number]> = {}) => ({ quantity: 1, weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10, fragile: false, noStack: false, ...over });

describe('computeParcel', () => {
  it('sums weight across quantities and classifies a small box as MOTO', () => {
    expect(computeParcel([line({ quantity: 3 })])).toMatchObject({ weightGrams: 1500, lengthCm: 20, widthCm: 15, sizeClass: 'MOTO' });
  });
  it('stacks items to estimate height', () => {
    const p = computeParcel([line({ quantity: 4 })]); // 4 × 3000 cm³ × 1.15 / (20×15) = 46 → 46 cm
    expect(p.heightCm).toBe(46);
    expect(p.sizeClass).toBe('AUTO'); // 46 > 40
  });
  it('uses AUTO above 8 kg and CAMIONETA above 50 kg or oversized', () => {
    expect(computeParcel([line({ weightGrams: 9000 })]).sizeClass).toBe('AUTO');
    expect(computeParcel([line({ weightGrams: 51000 })]).sizeClass).toBe('CAMIONETA');
    expect(computeParcel([line({ lengthCm: 120, widthCm: 70, heightCm: 20 })]).sizeClass).toBe('CAMIONETA');
  });
  it('moves large fragile boxes off motorbikes', () => {
    expect(computeParcel([line({ lengthCm: 35, widthCm: 30, heightCm: 25, fragile: true })]).sizeClass).toBe('AUTO'); // 26 250 cm³
    expect(computeParcel([line({ fragile: true })])).toMatchObject({ sizeClass: 'MOTO', fragile: true });
  });
  it('lays no-stack items side by side instead of stacking', () => {
    const p = computeParcel([line({ quantity: 4, noStack: true })]);
    expect(p).toMatchObject({ heightCm: 10, widthCm: 15, noStack: true });
    expect(p.lengthCm).toBe(92); // ceil(4 × 300 cm² × 1.15 / 15)
  });
  it('returns null size class when any line lacks weight or dimensions', () => {
    expect(computeParcel([line(), line({ weightGrams: null })])).toMatchObject({ weightGrams: null, sizeClass: null });
    expect(computeParcel([line({ heightCm: null })]).sizeClass).toBeNull();
  });
});
