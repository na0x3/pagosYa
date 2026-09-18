/** Slugs are generated once, at create time, and never follow a rename —
 * shared links must keep working after the owner renames a collection. */
export function collectionSlug(name: string, taken: Set<string>): string {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'coleccion';
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 56)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('No free collection slug');
}
