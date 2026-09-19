import { afterEach, expect, it, vi } from 'vitest';
import { mountVerificationPage, mountVerificationSeal, verificationUrl, type StoreVerification } from '../src/verification';

const verified: StoreVerification = { storeName: 'Pliegue <b>', slug: 'pliegue', verifiedBusiness: true, verifiedSince: '2026-08-02', electronicInvoicing: true, securePayments: true, onPlatformSince: '2026-07-01', reviews: { count: 3, average: 4.7 }, officialDomain: null };
afterEach(() => { document.body.innerHTML = ''; document.body.className = ''; vi.restoreAllMocks(); });

it('draws the seal outside the store frame only for verified businesses, linking to the platform page', () => {
  mountVerificationSeal({ ...verified, verifiedBusiness: false });
  expect(document.querySelector('.pagosya-seal')).toBeNull();
  mountVerificationSeal(verified); mountVerificationSeal(verified);
  const seals = document.querySelectorAll<HTMLAnchorElement>('.pagosya-seal');
  expect(seals).toHaveLength(1);
  expect(seals[0].href).toBe(verificationUrl('pliegue'));
  expect(seals[0].rel).toContain('noopener');
  expect(seals[0].getAttribute('aria-label')).toContain('Comercio verificado');
});

it('renders the verification facts escaped, and warns when the store does not exist', async () => {
  const root = document.createElement('div'); document.body.append(root);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => verified })));
  await mountVerificationPage('pliegue', root);
  expect(root.textContent).toContain('Comercio verificado por pagosYa');
  expect(root.textContent).toContain('Emite factura electrónica');
  expect(root.textContent).toContain('3 · 4,7 de 5');
  expect(root.innerHTML).toContain('Pliegue &lt;b&gt;');
  expect(root.querySelector('a')!.getAttribute('href')).toContain('/s/pliegue');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  await mountVerificationPage('falsa', root);
  expect(root.textContent).toContain('no confíes en él');
});
