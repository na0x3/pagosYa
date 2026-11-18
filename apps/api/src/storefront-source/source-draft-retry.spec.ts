import { draftSavedByItsRequest, sourceDraftRetry } from './source-draft-retry';

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

describe('draftSavedByItsRequest', () => {
  // Owner 2026-11-11: «la foto más grande» saved revision 4, its follow-up polish pass ended PARTIAL on revision 4, and the
  // next message resent the whole request (7 minutes) as «Guardar borrador».
  it('is true when the run\'s own request already saved the current revision', () => {
    expect(draftSavedByItsRequest({ lastCommittedRevision: 4 }, 4)).toBe(true);
  });
  it('is false for a request that never saved, or saved an older revision', () => {
    expect(draftSavedByItsRequest({ lastCommittedRevision: null }, 4)).toBe(false);
    expect(draftSavedByItsRequest({ lastCommittedRevision: 3 }, 4)).toBe(false);
    expect(draftSavedByItsRequest(null, 4)).toBe(false);
  });
});
