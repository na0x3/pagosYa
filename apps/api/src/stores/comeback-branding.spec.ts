import { sourceComebackBranding } from '@pagosya/shared-types';
import { RetentionService } from './retention.service';

describe('Comeback store identity', () => {
  it('uses the storefront green and typography instead of the neutral checkout paper', () => {
    const brand = sourceComebackBranding({ name: 'TOLEDO', tagline: 'Panadería' }, { files: [
      { path: 'index.html', content: '<link href="site.css" rel="stylesheet">' },
      { path: 'checkout.html', content: '<link href="payment.css" rel="stylesheet">' },
      { path: 'payment.css', content: ':root{--accent:#171717}body{background:#ffffff}' },
      { path: 'site.css', content: ':root{--green:#174a2b;--paper:#f3eddf;--serif:Georgia,serif;--radius:4px}body{background:var(--paper);font-family:Arial,sans-serif}h1{font-family:var(--serif)}' },
    ] });
    expect(brand).toMatchObject({ name: 'TOLEDO', background: '#174a2b', foreground: '#ffffff', headingFont: 'Georgia,serif', radius: '4px', stamp: 'bread' });
  });
  it('adapts other stores automatically and ignores invalid brand colors', () => {
    expect(sourceComebackBranding({ name: 'Café', accentColor: '#502c21', fontStyle: 'editorial', logoUrl: '/v1/uploads/coffee.png' })).toMatchObject({ background: '#502c21', foreground: '#ffffff', bodyFont: 'Georgia, serif', stamp: 'coffee', logoUrl: '/v1/uploads/coffee.png' });
    expect(sourceComebackBranding({ name: 'Sol', accentColor: '#fbd232' })).toMatchObject({ background: '#fbd232', foreground: '#171717', stamp: 'brand' });
    expect(sourceComebackBranding({ name: 'Azul', accentColor: '#369', brandProfile: { data: { confirmed: [{ field: 'accent', value: 'url(evil)' }] } } })).toMatchObject({ background: '#336699' });
  });
  it('reads only the published design for a customer card', async () => {
    const service = Object.create(RetentionService.prototype);
    service.prisma = { storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ snapshot: { files: [{ path: 'site.css', content: ':root{--accent:#174a2b}' }] } }) } };
    expect(await service.cardBrand({ id: 'toledo', name: 'TOLEDO', publishedSourceRevision: 3 })).toMatchObject({ background: '#174a2b' });
    expect(service.prisma.storeSourceVersion.findUnique).toHaveBeenCalledWith({ where: { storeId_revision: { storeId: 'toledo', revision: 3 } }, select: { snapshot: true } });
    service.prisma.storeSourceVersion.findUnique.mockClear();
    await service.cardBrand({ id: 'new', name: 'Nueva', publishedSourceRevision: null });
    expect(service.prisma.storeSourceVersion.findUnique).not.toHaveBeenCalled();
  });
});
