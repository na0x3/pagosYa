import sharp from 'sharp';

/** Owner 2026-10-28 («the hero of Oh Belly and Dulce Horno is huge, the picture is all stretched… the merchant's photos well framed,
 *  never stretched»): what the cover photo can carry, read from its pixels when the store is built — its shape, whether it is big
 *  enough to fill a screen, whether it is a product on a plain backdrop or a scene, and where its subject is. The cover the template
 *  shows follows the photo: a small or plain product shot is never blown up across the page. */

export type PhotoFit = { shape: 'wide' | 'tall' | 'square'; size: 'large' | 'small'; plain: 'plain' | 'scene'; focus: string };
export const PHOTO_FIT_VARIANTS = { heroShape: ['wide', 'tall', 'square'], heroSize: ['large', 'small'], heroPlain: ['plain', 'scene'],
  heroFocus: ['tl', 'tc', 'tr', 'cl', 'cc', 'cr', 'bl', 'bc', 'br'] } as const;

export async function readPhotoFit(bytes: Buffer): Promise<PhotoFit | undefined> {
  try {
    const meta = await sharp(bytes).rotate().metadata();
    const width = meta.autoOrient?.width ?? meta.width ?? 0, height = meta.autoOrient?.height ?? meta.height ?? 0;
    if (!width || !height) return undefined;
    const ratio = width / height;
    const shape = ratio >= 1.2 ? 'wide' : ratio <= 0.83 ? 'tall' : 'square';
    // Big enough to fill a laptop screen without going soft: the long side at 1400 px or more.
    const size = Math.max(width, height) >= 1400 ? 'large' : 'small';
    // A plain backdrop: the border of the photo is one even colour (a product on a sweep or a table top).
    const { data, info } = await sharp(bytes).rotate().resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const border: number[][] = [];
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (x > 2 && x < info.width - 3 && y > 2 && y < info.height - 3) continue;
      const i = (y * info.width + x) * 3; border.push([data[i], data[i + 1], data[i + 2]]);
    }
    const mean = [0, 1, 2].map(c => border.reduce((sum, px) => sum + px[c], 0) / border.length);
    const spread = Math.sqrt(border.reduce((sum, px) => sum + [0, 1, 2].reduce((s, c) => s + (px[c] - mean[c]) ** 2, 0), 0) / border.length / 3);
    const plain = spread < 18 ? 'plain' : 'scene';
    // The subject: libvips' attention point, as one of nine zones.
    const { info: crop } = await sharp(bytes).rotate().resize(120, 120, { fit: 'cover', position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
    const ax = (crop as { attentionX?: number }).attentionX, ay = (crop as { attentionY?: number }).attentionY;
    const zone = (value: number | undefined, total: number) => value === undefined ? 1 : value / total < 0.36 ? 0 : value / total > 0.64 ? 2 : 1;
    const focus = `${'tcb'[zone(ay, height)]}${'lcr'[zone(ax, width)]}`;
    return { shape, size, plain, focus };
  } catch { return undefined; }
}

/** The covers each template may show for this photo, best first; the rolled cover stays when it is one of them. */
const FITS: Record<string, (fit: PhotoFit) => string[]> = {
  mesa: fit => fit.size === 'large' && fit.shape === 'wide' ? (fit.plain === 'scene' ? ['poster', 'stack', 'split-left'] : ['stack', 'split-left']) : ['split-left'],
  tecno: fit => fit.size === 'large' && fit.shape === 'wide' && fit.plain === 'scene' ? ['full', 'split-left'] : ['split-left'],
  maison: fit => fit.size === 'large' && fit.plain === 'scene' ? (fit.shape === 'wide' ? ['full', 'framed', 'split-right'] : ['full', 'split-right']) : fit.shape === 'wide' && fit.size === 'large' ? ['framed', 'split-right'] : ['split-right'],
  catalogo: fit => fit.plain === 'plain' || fit.size === 'small' ? ['type', 'split-left'] : fit.shape === 'wide' ? ['full', 'split-left', 'type'] : ['split-left', 'type'],
  ritual: fit => fit.size === 'large' && fit.plain === 'scene' && fit.shape === 'wide' ? ['full', 'stack', 'split-left'] : fit.shape === 'wide' && fit.size === 'large' ? ['stack', 'split-left'] : ['split-left'],
  // Esencial: the full-bleed covers only for a big scene; otherwise a framed or split cover.
  esencial: fit => fit.size === 'large' && fit.plain === 'scene' ? ['full', 'poster', 'split-left', 'split-right', 'framed', 'arch', 'stack', 'type'] : ['split-left', 'split-right', 'framed', 'arch', 'type'],
};

/** The cover for this template and photo: the roll when the photo can carry it, otherwise the best one that can. */
export function coverForPhoto(templateId: string, rolled: string | undefined, fit: PhotoFit | undefined, offered: readonly string[]): string | undefined {
  if (!fit) return rolled;
  const fitting = (FITS[templateId] ?? FITS.esencial)(fit).filter(id => !offered.length || offered.includes(id));
  if (!fitting.length) return rolled;
  return rolled && fitting.includes(rolled) ? rolled : fitting[0];
}

export const photoFitVariants = (fit: PhotoFit | undefined): Record<string, string> => fit
  ? { heroShape: fit.shape, heroSize: fit.size, heroPlain: fit.plain, heroFocus: fit.focus } : {};

/** Owner 2026-10-28 («type that fits… uniqueness from the brand»): a skeleton's corners and buttons follow the brand's character the fill
 *  read, instead of one fixed look per template — a fashion house is sharp with underlined links, a bold or animated brand round with
 *  pill buttons, a calm warm one soft, a calm cool one square. A calm neutral brand keeps the template's own. */
export function styleForCharacter(character: { tone?: string; temperature?: string; kind?: string } | undefined, animated: boolean): Record<string, string> {
  if (animated) return { corners: 'round', button: 'pill' };
  if (!character) return {};
  if (character.kind === 'fashion') return { corners: 'sharp', button: 'underline' };
  if (character.tone === 'bold') return { corners: 'round', button: 'pill' };
  if (character.temperature === 'warm') return { corners: 'soft', button: 'soft' };
  if (character.temperature === 'cool') return { corners: 'sharp', button: 'square' };
  return {};
}

