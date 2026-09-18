export type SizeClass = 'MOTO' | 'AUTO' | 'CAMIONETA';
export type ParcelLine = { quantity: number; weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null; fragile: boolean; noStack: boolean };
export type Parcel = { weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null; fragile: boolean; noStack: boolean; sizeClass: SizeClass | null };

export const SIZE_CLASSES: SizeClass[] = ['MOTO', 'AUTO', 'CAMIONETA'];
// Starting defaults; replaced per carrier once real quotes arrive. CAMIONETA takes everything larger.
export const SIZE_LIMITS: Record<Exclude<SizeClass, 'CAMIONETA'>, { maxWeightGrams: number; maxDimsCm: [number, number, number] }> = {
  MOTO: { maxWeightGrams: 8_000, maxDimsCm: [40, 40, 40] },
  AUTO: { maxWeightGrams: 50_000, maxDimsCm: [100, 60, 50] },
};
// Packing allowance as a fraction (115/100), kept integral so ceil() isn't skewed by float error.
const PACKING_NUM = 115;
const PACKING_DEN = 100;
const FRAGILE_MOTO_MAX_CM3 = 20_000;

const fits = (dims: number[], limit: [number, number, number]) => {
  const sorted = [...dims].sort((a, b) => b - a);
  return sorted.every((value, index) => value <= limit[index]);
};

export function computeParcel(lines: ParcelLine[]): Parcel {
  const fragile = lines.some(l => l.fragile);
  const noStack = lines.some(l => l.noStack);
  const weightKnown = lines.every(l => l.weightGrams !== null);
  const weightGrams = weightKnown ? lines.reduce((sum, l) => sum + l.weightGrams! * l.quantity, 0) : null;
  if (!lines.length || lines.some(l => l.lengthCm === null || l.widthCm === null || l.heightCm === null)) {
    return { weightGrams, lengthCm: null, widthCm: null, heightCm: null, fragile, noStack, sizeClass: null };
  }
  const length = Math.max(...lines.map(l => l.lengthCm!));
  const width = Math.max(...lines.map(l => l.widthCm!));
  const tallest = Math.max(...lines.map(l => l.heightCm!));
  let lengthCm = length;
  let heightCm: number;
  if (noStack) {
    const footprint = lines.reduce((sum, l) => sum + l.lengthCm! * l.widthCm! * l.quantity, 0);
    lengthCm = Math.max(length, Math.ceil((footprint * PACKING_NUM) / (PACKING_DEN * width)));
    heightCm = tallest;
  } else {
    const volume = lines.reduce((sum, l) => sum + l.lengthCm! * l.widthCm! * l.heightCm! * l.quantity, 0);
    heightCm = Math.max(tallest, Math.ceil((volume * PACKING_NUM) / (PACKING_DEN * length * width)));
  }
  const dims = [lengthCm, width, heightCm];
  let sizeClass: SizeClass | null = null;
  if (weightGrams !== null) {
    const boxVolume = lengthCm * width * heightCm;
    if (weightGrams <= SIZE_LIMITS.MOTO.maxWeightGrams && fits(dims, SIZE_LIMITS.MOTO.maxDimsCm) && !(fragile && boxVolume > FRAGILE_MOTO_MAX_CM3)) sizeClass = 'MOTO';
    else if (weightGrams <= SIZE_LIMITS.AUTO.maxWeightGrams && fits(dims, SIZE_LIMITS.AUTO.maxDimsCm)) sizeClass = 'AUTO';
    else sizeClass = 'CAMIONETA';
  }
  return { weightGrams, lengthCm, widthCm: width, heightCm, fragile, noStack, sizeClass };
}
