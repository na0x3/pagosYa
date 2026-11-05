import { sourceDraftRetry } from './source-draft-retry';

describe('sourceDraftRetry', () => {
  it('keeps the original request a preserved draft was built from', () => {
    expect(sourceDraftRetry({ instruction: 'Crea una gelatería', assetUrls: ['/v1/uploads/a.jpg', 7], currentPage: 'index.html', setupAction: 'generate', selection: { sectionId: 'hero' }, templateId: 'miga', directionId: 'calido' }))
      .toEqual({ text: 'Crea una gelatería', assetUrls: ['/v1/uploads/a.jpg'], currentPage: 'index.html', setupAction: 'generate', selection: { sectionId: 'hero' }, templateId: 'miga', directionId: 'calido' });
  });

  it('leaves out anything malformed instead of guessing', () => {
    expect(sourceDraftRetry({ instruction: 'Hola', setupAction: 'delete-all', templateId: '../x', currentPage: 3 })).toEqual({ text: 'Hola', assetUrls: [], currentPage: 'index.html' });
    expect(sourceDraftRetry({ instruction: '  ' })).toBeUndefined();
    expect(sourceDraftRetry(null)).toBeUndefined();
  });

  it('never offers to resend a draft a resend already tried to finish', () => {
    expect(sourceDraftRetry({ instruction: 'Arregla el encabezado', resumeDraft: true })).toBeUndefined();
  });
});

it('carries a template address, a circle and a viewing back to the Studio (spec 2026-11-05 point-at)', () => {
  const area = { points: [1, 1, 2, 2, 3, 3] };
  expect(sourceDraftRetry({ instruction: 'x', selection: { sectionId: 'lb-1', at: 1, page: 'faq', area }, viewing: { page: 'faq', at: 2 } }))
    .toMatchObject({ selection: { sectionId: 'lb-1', at: 1, page: 'faq', area }, viewing: { page: 'faq', at: 2 } });
  expect(sourceDraftRetry({ instruction: 'x', viewing: { page: 'blog' } })?.viewing).toBeUndefined();
});
