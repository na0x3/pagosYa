/** Plantillas (spec 2026-09-25-plantillas-design.md): the per-store pieces a template needs at apply time. A template's
 * authored source never contains merchant text; it imports `./store-data`, which this module writes with every value
 * JSON-encoded, so no store name or photo URL is ever pasted into JSX. */
import { templateDemoPhoto, type TemplateManifest } from '@pagosya/store-templates';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const TEMPLATE_STORE_DATA_PATH = 'components/store-data.tsx';

export const templateDemoPath = (manifest: Pick<TemplateManifest, 'id' | 'photos'>, slot: string) => {
  const demo = manifest.photos.find(photo => photo.slot === slot)?.demo;
  return demo ? `assets/template-${manifest.id}-${slot}.${demo.split('.').pop()}` : '';
};

/**
 * Hero and product slots take each product's first photo in catalog order; lifestyle and detail slots take the
 * photos left over (second photos, then any first photo not used yet). A photo is used once. Whatever stays empty
 * keeps the template's demo photo, or '' when the template has none for that slot.
 */
export function fillTemplatePhotos(manifest: Pick<TemplateManifest, 'id' | 'photos'>, items: ReadonlyArray<{ imageUrls?: readonly string[] }>) {
  const used = new Set<string>();
  const firsts = items.map(item => item.imageUrls?.[0]).filter((url): url is string => Boolean(url));
  const rest = items.flatMap(item => item.imageUrls?.slice(1) ?? []);
  const take = (pool: string[]) => { const url = pool.find(candidate => !used.has(candidate)); if (url) used.add(url); return url; };
  const photos: Record<string, string> = {};
  const demoSlots: string[] = [];
  for (const { slot, role } of manifest.photos) {
    const url = role === 'hero' || role === 'product' ? take(firsts) : take([...rest, ...firsts]);
    if (url) { photos[slot] = url; continue; }
    photos[slot] = templateDemoPath(manifest, slot);
    if (photos[slot]) demoSlots.push(slot);
  }
  return { photos, demoSlots };
}

export function templateStoreDataFile(store: { name: string; tagline?: string; city?: string }, photos: Record<string, string>): SourceProjectFileDto {
  const data = { name: store.name, tagline: store.tagline ?? '', city: store.city ?? '' };
  return {
    path: TEMPLATE_STORE_DATA_PATH,
    content: `// Written by pagosYa when the template is applied. Edit the store's name and photos in the Studio.\n`
      + `export const store = ${JSON.stringify(data)} as const;\n`
      + `export const photos: Record<string, string> = ${JSON.stringify(photos)};\n`,
  };
}

export function templateDemoAssets(manifest: TemplateManifest, demoSlots: readonly string[]): SourceProjectFileDto[] {
  return demoSlots.flatMap(slot => {
    const photo = templateDemoPhoto(manifest.id, slot);
    return photo ? [{ path: templateDemoPath(manifest, slot), content: photo.bytes.toString('base64'), encoding: 'base64' as const }] : [];
  });
}
