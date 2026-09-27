import { describe, expect, it } from 'vitest';
import { renderBuildProgress } from './source-build-progress';

describe('the agent steps in the build progress', () => {
  const progress = { status: 'running', startedAt: 0, updatedAt: 1000, steps: [{ stage: 'building', label: 'Construyendo los cambios', startedAt: 0, status: 'running', details: [
    { label: 'Editó components/home.tsx' },
    { label: 'Tomó una captura (celular)', thumbnail: 'data:image/jpeg;base64,QUJD' },
    { label: '<img src=x onerror=alert(1)>', thumbnail: 'javascript:alert(1)' },
  ] }] };
  it('lists each step with its screenshot thumbnail, escaped and limited to JPEG data URLs', () => {
    const html = renderBuildProgress(progress);
    expect(html).toContain('<ul class="build-details">');
    expect(html).toContain('Editó components/home.tsx');
    expect(html).toContain('<img class="build-shot" alt="" src="data:image/jpeg;base64,QUJD">');
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('javascript:');
  });
});
