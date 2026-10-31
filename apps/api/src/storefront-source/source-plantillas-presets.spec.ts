import { galleryTemplates, templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { presetFill, readMasterState, resolvePresetTemplate, templateDemoRevision, withPreset } from './source-templates';

// Plantillas presets (owner 2026-10-22): the gallery is looks of Esencial; a store made from one is an Esencial store.
jest.setTimeout(240_000);

describe('Plantillas presets', () => {
  it('every gallery preset resolves to Esencial with its own photos and look', () => {
    const gallery = galleryTemplates();
    expect(gallery.length).toBeGreaterThanOrEqual(12);
    for (const chosen of gallery) {
      const { manifest, preset } = resolvePresetTemplate(chosen, templateManifest);
      expect(manifest.id).toBe('esencial');
      expect(manifest.photoSource).toBe(chosen.id);
      expect(preset!.look).toEqual(expect.objectContaining({ palette: chosen.preset!.palette, fonts: chosen.preset!.fonts }));
    }
  });

  it('keeps the preset design while the business writes the words', () => {
    const preset = presetFill(templateManifest('firma')!.preset!);
    const merged = withPreset(preset, { look: { palette: 'citrus', fonts: 'poster' }, copy: { headline: 'Tienda de Ana' }, variants: { hero: 'poster' } as never });
    expect(merged.look).toEqual(preset.look);
    expect(merged.variants).toEqual(preset.variants);
    expect(merged.copy).toEqual(expect.objectContaining({ headline: 'Tienda de Ana', eyebrow: preset.copy!.eyebrow }));
    expect(merged.character?.kind).toBe('fashion');
  });

  it('builds a preset demo as an Esencial store with the preset look, words, sections and photos', async () => {
    const { manifest, preset } = resolvePresetTemplate(templateManifest('voltio')!, templateManifest);
    const assembled = await templateDemoRevision(manifest, templateSourceFiles(manifest.id), preset);
    expect(assembled.brief.templateId).toBe('esencial');
    const state = readMasterState(assembled.files);
    expect(state.look).toEqual(expect.objectContaining({ palette: 'ink', fonts: 'condensed' }));
    expect(state.variants).toEqual(expect.objectContaining({ hero: 'full', card: 'bar', filters: 'sidebar' }));
    expect(state.copy?.headline).toBe('Drones, cámaras y audio');
    expect(state.sections?.map(section => section.id)).toEqual(['pick']);
    expect(state.photos.hero).toBe('assets/template-voltio-hero.jpg');
    expect(assembled.files.some(file => file.path === 'assets/template-voltio-hero.jpg')).toBe(true);
  });
});

describe('34 templates', () => {
  it('a business fill keeps the template home (layout) and its theme', () => {
    const preset = presetFill(templateManifest('paloalto')!.preset!);
    expect(preset.layout?.length).toBeGreaterThan(10);
    const merged = withPreset(preset, { copy: { headline: 'Tienda de Ana' }, variants: { hero: 'poster' } as never });
    expect(merged.layout).toBe(preset.layout);
    expect((merged.variants as Record<string, unknown>).theme).toBe('paloalto');
  });
});

