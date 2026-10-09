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
});
