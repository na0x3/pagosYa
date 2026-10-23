// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountBuildStage, renderBuildStage } from './source-build-stage';

afterEach(() => vi.useRealTimers());
describe('build stage in design mode', () => {
  it('review: «Ver pasos» lists plain steps, never the file log', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    host.innerHTML = renderBuildStage({ status: '', progress: null });
    document.body.append(host);
    const stage = mountBuildStage(host, { plain: true });
    stage.update({ status: 'Construyendo', progress: { status: 'running', startedAt: Date.now(), updatedAt: Date.now(), steps: [{ stage: 'building', label: 'Construyendo los cambios', startedAt: Date.now(), status: 'running', details: [{ label: 'Leyó components/home.tsx' }] }] } as any });
    vi.advanceTimersByTime(1000);
    host.querySelector<HTMLButtonElement>('[data-stage-steps]')!.click();
    vi.advanceTimersByTime(1000);
    const list = host.querySelector('[data-stage-steps-list]')!.textContent ?? '';
    expect(list).toContain('Estoy mirando cómo está hecha tu tienda');
    expect(list).not.toContain('Leyó');
    stage.destroy();
  });
});
