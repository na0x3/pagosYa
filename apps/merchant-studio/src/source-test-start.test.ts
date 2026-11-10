// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('./source-checks', () => ({ checkSourceWebsite: vi.fn(async (files: unknown) => ({ files })), sourceCheckResult: vi.fn(() => ({ passed: true, findings: [] })), sourceChecksBlockPublishing: vi.fn((checks: { files: { bad?: boolean } }) => Boolean(checks.files.bad)) }));
vi.mock('@pagosya/storefront-preview', () => ({ createPreviewImageLoader: () => async (snapshot: unknown) => snapshot }));
import { checkAndStartTest } from './source-test-start';

// Spec 2026-11-09 YAPI A/B tests: «Lanzar prueba» runs B's desktop/mobile checks exactly as the page does, then starts with the words.
describe('starting a design test', () => {
  const api = (snapshot: unknown) => ({ sourceVersion: vi.fn(async () => ({ snapshot })), recordSourceChecks: vi.fn(async () => ({})), startSourceTest: vi.fn(async () => ({ revision: 4 })) });
  it('records the checks, then starts B with the merchant words', async () => {
    const a = api({ ok: true });
    await checkAndStartTest(a as any, 's', 7, 3, 'prueba otra portada');
    expect(a.recordSourceChecks).toHaveBeenCalledWith('s', 7, { passed: true, findings: [] });
    expect(a.startSourceTest).toHaveBeenCalledWith('s', 7, 3, 'prueba otra portada');
  });
  it('a failing check starts nothing and says so', async () => {
    const a = api({ bad: true });
    await expect(checkAndStartTest(a as any, 's', 7, 3)).rejects.toThrow('La versión B tiene comprobaciones pendientes en celular o computadora. Corrígela antes de iniciar la prueba.');
    expect(a.startSourceTest).not.toHaveBeenCalled();
  });
});
