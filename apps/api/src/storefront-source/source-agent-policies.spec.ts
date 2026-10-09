import { mergeAgentPolicies, policyTextProblem, snapshotWithPolicies } from './source-agent-policies';

describe('mergeAgentPolicies', () => {
  it('replaces the policies YAPI wrote, removes the ones it emptied, and keeps the rest as Ajustes has them', () => {
    const current = { returns: 'Sin cambios.', delivery: 'Envíos en 48 h.', terms: 'Términos.' };
    expect(mergeAgentPolicies(current, { returns: 'Cambios en 7 días con boleta.\r\n', terms: null })).toEqual({ returns: 'Cambios en 7 días con boleta.', delivery: 'Envíos en 48 h.' });
    expect(mergeAgentPolicies(undefined, {})).toEqual({});
  });
});

describe('policyTextProblem', () => {
  it('accepts plain text up to 6000 characters and names what Ajustes would refuse', () => {
    expect(policyTextProblem('Aceptamos cambios dentro de 7 días.')).toBeNull();
    expect(policyTextProblem('x'.repeat(6001))).toMatch(/6000/);
    expect(policyTextProblem('texto‮oculto')).toMatch(/invisibles/);
  });
});

describe('snapshotWithPolicies', () => {
  const snapshot = { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"dacho","data":{"storeName":"Dacho","policies":{"returns":"Antes.","delivery":"Envíos."}}};' }, { path: 'index.html', content: '<h1>x</h1>' }] };
  it('shows the pending policies in the draft config without touching other data or files', () => {
    const next = snapshotWithPolicies(snapshot, { returns: 'Después.' });
    const config = JSON.parse(next.files[0].content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;$/, ''));
    expect(config.data).toEqual({ storeName: 'Dacho', policies: { returns: 'Después.', delivery: 'Envíos.' } });
    expect(next.files[1]).toBe(snapshot.files[1]);
    expect(snapshotWithPolicies(snapshot, {})).toBe(snapshot);
  });
  it('leaves a config it cannot read untouched', () => {
    const odd = { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {broken' }] };
    expect(snapshotWithPolicies(odd, { returns: 'x' })).toEqual(odd);
  });
});
