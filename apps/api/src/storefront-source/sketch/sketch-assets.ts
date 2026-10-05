/** Design-role inference uses confirmed merchant metadata, never visual claims about an unseen
 * photograph. Unknown uploads stay editorial; explicit packshot/product metadata wins. */
export function sketchImageRole(asset: { role?: string; description?: string; path?: string; shot?: string }): string {
  const role = asset.role || '';
  if (['logo', 'reference', 'unused', 'unknown'].includes(role)) return role;
  if (asset.shot === 'detail') return 'product-detail';
  if (asset.shot === 'scene' || asset.shot === 'in-use') return 'hero-lifestyle';
  if (asset.shot === 'packshot') return 'product';
  if (['product', 'packaging', 'portrait', 'decorative', 'location', 'product-detail', 'hero-lifestyle', 'brand-editorial'].includes(role)) return role;
  if (role === 'detail') return 'product-detail';
  if (role === 'lifestyle' || role === 'background') return 'hero-lifestyle';
  const clue = `${asset.description || ''} ${asset.path || ''}`;
  if (/packshot|packaging|product photo|foto de producto|empaque/i.test(clue)) return 'product';
  if (/detail|detalle|close.?up/i.test(clue)) return 'product-detail';
  if (/portrait|retrato/i.test(clue)) return 'portrait';
  if (/location|local|interior|cafetería/i.test(clue)) return 'location';
  if (/landscape|lifestyle|ambiente|panorámica/i.test(clue)) return 'hero-lifestyle';
  return 'brand-editorial';
}
export const isSceneImage = (role?: string) => ['hero-lifestyle', 'lifestyle', 'background', 'location', 'brand-editorial'].includes(role || '');
export const isProductImage = (role?: string) => ['product', 'packaging'].includes(role || '');
