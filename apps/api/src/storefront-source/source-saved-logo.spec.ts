import { withSavedLogo } from './source-saved-logo';

const logo = '/v1/uploads/0a1b2c3d-0000-4000-8000-000000000000.png';
const base = { assetUrls: ['/v1/uploads/aa.jpg'], imageUses: [], logoUrl: logo, fromScratch: true, owned: true };

describe('withSavedLogo', () => {
  it('adds the saved logo, marked as the logo, to a new store or redesign', () => {
    expect(withSavedLogo(base)).toEqual({ assetUrls: ['/v1/uploads/aa.jpg', logo], imageUses: [{ url: logo, role: 'logo', description: 'Logo de la tienda' }] });
  });
  it('changes nothing on a local edit, without a logo, or for a logo the merchant does not own', () => {
    for (const input of [{ ...base, fromScratch: false }, { ...base, logoUrl: null }, { ...base, owned: false }]) {
      expect(withSavedLogo(input)).toEqual({ assetUrls: base.assetUrls, imageUses: [] });
    }
  });
  it('skips logos the generator cannot bundle and keeps the 24-file limit', () => {
    expect(withSavedLogo({ ...base, logoUrl: '/v1/uploads/abc.gif' }).assetUrls).toEqual(base.assetUrls);
    expect(withSavedLogo({ ...base, logoUrl: 'https://cdn.example/logo.png' }).assetUrls).toEqual(base.assetUrls);
    const full = Array.from({ length: 24 }, (_, i) => `/v1/uploads/${i}.png`);
    expect(withSavedLogo({ ...base, assetUrls: full }).assetUrls).toEqual(full);
  });
  it("keeps the merchant's own role when they attached the logo themselves", () => {
    const uses = [{ url: logo, role: 'product' as const, description: 'Etiqueta' }];
    expect(withSavedLogo({ ...base, assetUrls: [logo], imageUses: uses })).toEqual({ assetUrls: [logo], imageUses: uses });
  });
});
