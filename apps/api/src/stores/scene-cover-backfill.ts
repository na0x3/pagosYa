/** One-off: products saved before Studio made an accepted YAPI scene the cover still lead with the
 * packshot. Only a proven pair moves — an AI_DERIVED scene whose parent is the product's current
 * cover. Anything else, including a cover the owner picked, is left exactly as it is. */
export type SceneCoverLineage = Map<string, { kind: string; parentUrl: string | null }>;
const CENTRE = '50% 50%';
const uploadPath = (url: string) => { try { return new URL(url, 'https://local.invalid').pathname; } catch { return url; } };

export function planSceneCover(product: { imageUrls: string[]; imagePositions: string[] }, lineage: SceneCoverLineage) {
  const [cover] = product.imageUrls;
  if (!cover || lineage.get(uploadPath(cover))?.kind === 'AI_DERIVED') return null;
  const index = product.imageUrls.findIndex((url, i) => i > 0 && lineage.get(uploadPath(url))?.kind === 'AI_DERIVED' && lineage.get(uploadPath(url))?.parentUrl === uploadPath(cover));
  if (index < 0) return null;
  const move = <T>(list: T[]) => [list[index], ...list.filter((_, i) => i !== index)];
  // Positions are aligned by index; an empty list means "all centred" and stays empty.
  const positions = product.imagePositions.length ? product.imageUrls.map((_, i) => product.imagePositions[i] || CENTRE) : [];
  return { imageUrls: move(product.imageUrls), imagePositions: positions.length ? move(positions) : [] };
}
