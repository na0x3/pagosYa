/** Owner 2026-11-17 («if a user wants to add more pictures to a certain product or add videos»): YAPI may add a photo or an MP4
 * video to a real product. The tool queues it on the toolbox; the media is written to the catalogue only after the run's revision
 * is saved (like the policies), with the merchant's ownership checked and the product's photos kept before its videos, so the
 * cover every card, cart line and share image reads is always a photo. */
import type { PrismaService } from '../prisma/prisma.service';

export type AgentProductMedia = { productId: string; url: string };

export const PRODUCT_MEDIA_MAX = 10;
const UPLOAD = /^\/v1\/uploads\/[a-f0-9-]+\.(?:png|jpe?g|webp|mp4)$/i;
export const isProductVideo = (url: string) => /\.mp4$/i.test(url);

/** Why a queued addition is refused, in plain Spanish, or null. */
export function productMediaProblem(url: string, current: readonly string[], queued: readonly string[]): string | null {
  if (!UPLOAD.test(url)) return 'Usa una foto (JPG, PNG o WebP) o un video MP4 que el comercio subió a pagosYa: una dirección /v1/uploads/….';
  if (current.includes(url) || queued.includes(url)) return 'Ese producto ya tiene esa foto o video.';
  if (current.length + queued.length >= PRODUCT_MEDIA_MAX) return `Ese producto ya tiene ${PRODUCT_MEDIA_MAX} fotos y videos, el máximo.`;
  return null;
}

/** The product's media with the additions: photos first (old, then new), then videos (old, then new); positions stay aligned. */
export function withProductMedia(imageUrls: readonly string[], positions: readonly string[], added: readonly string[]): { imageUrls: string[]; imagePositions: string[] } {
  const entries = [...imageUrls.map((url, index) => ({ url, position: positions[index] ?? '50% 50%' })), ...added.filter(url => !imageUrls.includes(url)).map(url => ({ url, position: '50% 50%' }))];
  const ordered = [...entries.filter(entry => !isProductVideo(entry.url)), ...entries.filter(entry => isProductVideo(entry.url))].slice(0, PRODUCT_MEDIA_MAX);
  return { imageUrls: ordered.map(entry => entry.url), imagePositions: ordered.map(entry => entry.position) };
}

/** Writes the queued media once the revision is saved; an upload the merchant does not own, or a product of another store, is skipped. */
export async function writeAgentProductMedia(prisma: PrismaService, merchantId: string, storeId: string, media: readonly AgentProductMedia[]): Promise<number> {
  if (!media.length) return 0;
  const owned = new Set((await prisma.mediaAsset.findMany({ where: { merchantId, url: { in: [...new Set(media.map(item => item.url))] } }, select: { url: true } })).map(asset => asset.url));
  let written = 0;
  for (const productId of new Set(media.map(item => item.productId))) {
    const added = media.filter(item => item.productId === productId && owned.has(item.url)).map(item => item.url);
    if (!added.length) continue;
    const product = await prisma.paymentLink.findFirst({ where: { id: productId, storeId }, select: { id: true, imageUrls: true, imagePositions: true } });
    if (!product) continue;
    // A product with no photo yet gets its video only beside a photo: the cover must be a photo.
    const next = withProductMedia(product.imageUrls, product.imagePositions, added);
    if (!next.imageUrls.some(url => !isProductVideo(url))) continue;
    await prisma.paymentLink.update({ where: { id: product.id }, data: next });
    written += next.imageUrls.length - product.imageUrls.length;
  }
  return written;
}
