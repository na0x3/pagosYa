import { sourceStoreConfigData } from './source-store-config';

// The Studio preview and the hosted preview run the runtime on config.js data alone, so the information pages
// (about, contact, refund, privacy, terms) can only show what this data carries.
describe('the store facts config.js carries', () => {
  const store = {
    storeName: 'Marca', tagline: 'Café', aboutText: 'Somos de La Paz.', contactEmail: 'hola@marca.bo', contactPhone: '+59170000000',
    policies: { returns: 'Cambios en 7 días.' }, categories: [], locations: [], bundles: [], items: [],
  } as any;

  it('includes the about text, the contact email and the merchant policies', () => {
    const data = sourceStoreConfigData(store, new URL('https://api.test/v1'), false);
    expect(data).toMatchObject({ aboutText: 'Somos de La Paz.', contactEmail: 'hola@marca.bo', policies: { returns: 'Cambios en 7 días.' } });
  });
  it("carries the banner as an absolute URL for the checkout photo", () => {
    const apiUrl = new URL("https://api.test/v1");
    expect(sourceStoreConfigData({ ...store, bannerUrl: "/v1/uploads/banner.jpg" }, apiUrl, false).bannerUrl).toBe("https://api.test/v1/uploads/banner.jpg");
    expect(sourceStoreConfigData({ ...store, bannerUrl: null }, apiUrl, false).bannerUrl).toBeNull();
  });
});
