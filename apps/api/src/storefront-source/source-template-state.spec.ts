import { countTemplateVersions, templateUntouched, FREE_TEMPLATE_ADAPTATIONS } from './source-template-state';

describe('template state', () => {
  it('is untouched only while the current revision is the one a template produced', () => {
    expect(templateUntouched({ templateId: 'tostado', templateRevision: 2 }, 2)).toBe(true);
    expect(templateUntouched({ templateId: 'tostado', templateRevision: 2 }, 3)).toBe(false);
    expect(templateUntouched({ templateRevision: 2 }, 2)).toBe(false);
    expect(templateUntouched(undefined, 0)).toBe(false);
  });
  it('counts template versions by their label', async () => {
    const count = jest.fn().mockResolvedValue(3);
    await expect(countTemplateVersions({ storeSourceVersion: { count } } as any, 's1')).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({ where: { storeId: 's1', label: { startsWith: 'Plantilla:' } } });
    expect(FREE_TEMPLATE_ADAPTATIONS).toBe(4);
  });
});
