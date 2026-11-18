import { templateManifest } from '@pagosya/store-templates';
import { LIBRARY_CATALOG } from './source-section-library';
import { composerTemplate, readSectionFit } from './source-composer';
import { resolvePresetTemplate } from './source-templates';

describe('section-fit.json (spec 2026-11-11 store composer)', () => {
  const data = readSectionFit();
  const known = new Set(LIBRARY_CATALOG.map(section => section.id));
  it('names only library sections', () => {
    for (const list of [...Object.values(data.fit), ...Object.values(data.signature), ...Object.values(data.vetoed ?? {})]) for (const type of list) expect(known).toContain(type);
  });
  it('every template with an approved signature gives the composer a view that opens with its cover, or its own opener when its home has none', () => {
    for (const id of Object.keys(data.signature)) {
      const resolved = resolvePresetTemplate(templateManifest(id)!, templateManifest);
      const view = composerTemplate(id, resolved.manifest.name, resolved.preset as never, data);
      expect(view).not.toBeNull();
      const head = view!.signature[0];
      expect(view!.opener ? head === view!.opener : LIBRARY_CATALOG.find(section => section.id === head)?.role === 'cover').toBe(true);
      for (const type of view!.signature) expect(view!.allowed).toContain(type);
      expect(view!.allowed.length).toBeGreaterThanOrEqual(9);
    }
  });
  it('a template with a two-section home (Foco) has no signature and keeps fill mode', () => {
    expect(data.signature.foco).toBeUndefined();
  });
});
