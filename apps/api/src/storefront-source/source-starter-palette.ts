import sharp from 'sharp';
import type { MasterPalette } from '@pagosya/store-templates';

/** A/B comparison 2026-10-24: a starter's rolled palette has to sit with the store's hero photo — PEPPA's red bottles got a blue
 *  button. Warm and cool are read from the photo's dominant colour and from each palette's accent; grey either way is neutral. */
export type PhotoTone = 'warm' | 'cool' | 'neutral';

function tone(r: number, g: number, b: number): PhotoTone {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.25 || max < 0.15) return 'neutral';
  const d = max - min;
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const hue = (max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4) * 60;
  const h = (hue + 360) % 360;
  // Reds, oranges, yellows and magenta-reds are warm; greens through blues and violets are cool.
  return h < 70 || h >= 330 ? 'warm' : 'cool';
}

/** The hero photo's tone from its dominant colour; anything unreadable is neutral. */
export async function photoTone(bytes: Buffer): Promise<PhotoTone> {
  try {
    const { dominant } = await sharp(bytes).resize(64, 64, { fit: 'inside' }).stats();
    return tone(dominant.r, dominant.g, dominant.b);
  } catch {
    return 'neutral';
  }
}

const hex = (value: string) => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];

/** The starter's palettes whose accent does not fight the photo: a warm photo drops cool accents and the other way round.
 *  A neutral photo, or a filter that would leave nothing, keeps the starter's list as it is. */
export function palettesForPhoto(palettes: readonly MasterPalette[], ids: readonly string[], photo: PhotoTone): string[] {
  if (photo === 'neutral') return [...ids];
  const kept = ids.filter(id => {
    const palette = palettes.find(p => p.id === id);
    if (!palette) return false;
    const accent = tone(...hex(palette.accent));
    return accent === 'neutral' || accent === photo;
  });
  return kept.length ? kept : [...ids];
}
