// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { readinessSteps, renderStoreReadiness, type ReadinessInput } from './store-readiness';
const input: ReadinessInput = { catalog: null, branded: false, checked: false, checking: false, published: false, canPublish: false, locked: false };
it('keeps the six commerce readiness steps for existing shops', () => {
  expect(readinessSteps(input).map(row => row.id)).toEqual(['products', 'brand', 'shipping', 'payments', 'test', 'publish']);
});
it.each(['service', 'portfolio', 'editorial'] as const)('shows applicable readiness steps for %s without claiming payments', sitePurpose => {
  const steps = readinessSteps({ ...input, sitePurpose });
  expect(steps.map(row => row.id)).toEqual(['brand', 'test', 'publish']);
  expect(steps.every(row => !row.done)).toBe(true);
  const html = renderStoreReadiness({ ...input, sitePurpose });
  expect(html).toContain('0 de 3 pasos');
  expect(html).not.toMatch(/Compra de prueba|primera venta|Entrega y recojo|pagos siguen/);
});
