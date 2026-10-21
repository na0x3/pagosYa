// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountNarrator, narratorBridge } from './source-narrator';
import type { BuildProgress } from './source-build-progress';

const text = () => [...document.querySelectorAll('[data-narrator-text] p')].map(p => p.textContent).join(' ').replace(/\s+/g, ' ').trim();
const live = () => document.querySelector('[data-narrator-live]')!.textContent;

describe('YAPI glass window', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
  afterEach(() => { vi.useRealTimers(); });

  it('opens with the merchant request and types the plan word by word', () => {
    const n = mountNarrator(document, { reducedMotion: () => false });
    n.open('Cambia el título');
    expect(n.element.hidden).toBe(false);
    expect(document.querySelector('[data-narrator-request]')!.textContent).toBe('«Cambia el título»');
    n.show({ phase: 'plan', lines: ['Esto es lo que voy a hacer:', 'Cambiar el título.'] });
    vi.advanceTimersByTime(300);
    expect(text().length).toBeGreaterThan(0);
    expect(text()).not.toContain('Cambiar el título.');
    vi.advanceTimersByTime(5000);
    expect(text()).toContain('Esto es lo que voy a hacer: Cambiar el título.');
    expect(live()).toBe('Cambiar el título.');
  });

  it('types only what is new when the narration grows, and restarts when it changes', () => {
    const n = mountNarrator(document, { reducedMotion: () => true });
    n.open('x');
    n.show({ phase: 'plan', lines: ['A.'] });
    n.show({ phase: 'work', lines: ['A.', 'Ahora: b…'] });
    expect(document.querySelectorAll('[data-narrator-text] p')).toHaveLength(2);
    n.show({ phase: 'stopped', lines: ['Me detuve.'] });
    expect(text()).toBe('Me detuve.');
  });

  it('a click finishes the sentence being typed', () => {
    const n = mountNarrator(document, { reducedMotion: () => false });
    n.open('x');
    n.show({ phase: 'work', lines: ['Una frase bastante larga para escribir despacio.'] });
    vi.advanceTimersByTime(100);
    (document.querySelector('[data-narrator-text]') as HTMLElement).click();
    expect(text()).toBe('Una frase bastante larga para escribir despacio.');
  });

  it('shrinks to a pill after the summary and the pill reopens it; Escape closes', () => {
    const n = mountNarrator(document, { reducedMotion: () => true });
    n.open('x');
    n.show({ phase: 'done', lines: ['Listo.', 'Cambié el título.'] });
    vi.advanceTimersByTime(4000);
    const pill = document.querySelector('[data-narrator-pill]') as HTMLButtonElement;
    expect(n.element.hidden).toBe(true);
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toBe('YAPI · Resumen');
    pill.click();
    expect(n.element.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(n.element.hidden).toBe(true);
  });

  it('with reduced motion whole sentences appear at once', () => {
    const n = mountNarrator(document, { reducedMotion: () => true });
    n.open('x');
    n.show({ phase: 'plan', lines: ['Esto es lo que voy a hacer:', 'Cambiar el título.'] });
    expect(text()).toBe('Esto es lo que voy a hacer: Cambiar el título.');
  });

  it('the bridge feeds the window from the build lifecycle and skips repeats', () => {
    const shown: string[] = [];
    const fake = { open: (r: string) => shown.push(`open:${r}`), show: (n: { phase: string }) => shown.push(n.phase), close() {}, element: document.body };
    const bridge = narratorBridge(fake);
    const p = (label: string): BuildProgress => ({ status: 'running', startedAt: 1, updatedAt: 1, steps: [{ stage: 'a', label, startedAt: 1, status: 'running' }] });
    bridge.submitted('Hazme una tienda');
    bridge.progress(p('Diseñando'));
    bridge.progress(p('Diseñando'));
    bridge.completed('Listo, hice tu tienda.');
    bridge.interrupted();
    expect(shown).toEqual(['open:Hazme una tienda', 'work', 'done', 'stopped']);
  });
});

describe('the Studio feeds the window', () => {
  it('opens it on submit, updates it on progress, finishes it on the reply and stops it on an interrupt', async () => {
    const { readFileSync } = await import('node:fs');
    const studio = readFileSync(`${process.cwd()}/src/source-studio.ts`, 'utf8');
    expect(studio).toMatch(/const narrator = narratorBridge\(mountNarrator\(document\)\);/);
    expect(studio).toMatch(/if \(event\.type === 'interrupt' && wasBuilding\) narrator\.interrupted\(\);/);
    expect(studio).toMatch(/transitionBuild\(\{ type: 'submit' \}\); narrator\.submitted\(text\);/);
    expect(studio).toMatch(/function updateBuildProgress\(\) \{\n\s+narrator\.progress\(buildProgress\);/);
    expect(studio).toMatch(/narrator\.completed\(String\(result\.assistantMessage\?\.content \?\? ''\)\);/);
    expect(studio).toMatch(/narrator\.completed\(String\(\[\.\.\.messages\]\.reverse\(\)\.find\(m => m\.role === 'ASSISTANT'\)\?\.content \?\? ''\)\);/);
  });
});
