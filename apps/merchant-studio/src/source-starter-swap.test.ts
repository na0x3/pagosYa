// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bindStarterSwap, renderStarterSwap, showsStarterSwap } from './source-starter-swap';

// Spec 2026-10-24 §2, «Probar otro estilo»: two other starters under a new store's first build.
const alts = [{ id: 'calle', name: 'Calle', description: 'Ropa urbana', preview: 'plantillas/calle.webp' }, { id: 'taller', name: 'Taller', description: 'Moda de autor', preview: 'plantillas/taller.webp' }];
describe('starter swap', () => {
  it('renders two cards with name, description and a decorative preview', () => {
    document.body.innerHTML = renderStarterSwap(alts, '/studio/', false);
    expect(document.querySelectorAll('[data-starter-swap]')).toHaveLength(2);
    expect(document.body.textContent).toContain('Probar otro estilo');
    expect(document.body.textContent).toContain('Moda de autor');
    const img = document.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe('/studio/plantillas/calle.webp');
  });
  it('renders nothing without alternatives', () => expect(renderStarterSwap([], '/', false)).toBe(''));
  it('escapes every text', () => {
    document.body.innerHTML = renderStarterSwap([{ id: 'x"y', name: '<b>A</b>', description: '"d"', preview: 'p' }], '/', false);
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('[data-starter-swap]')!.getAttribute('data-starter-swap')).toBe('x"y');
  });
  it('posts the chosen starter and disables both cards while busy', async () => {
    document.body.innerHTML = renderStarterSwap(alts, '/', false);
    const post = vi.fn(() => new Promise(() => undefined));
    bindStarterSwap(document.body, { post, onDone: vi.fn(), onError: vi.fn() });
    (document.querySelector('[data-starter-swap="taller"]') as HTMLButtonElement).click();
    expect(post).toHaveBeenCalledWith('taller');
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-starter-swap]')].every(button => button.disabled)).toBe(true);
  });
  it('reloads when done and gives the cards back on an error', async () => {
    document.body.innerHTML = renderStarterSwap(alts, '/', false);
    const onDone = vi.fn(), onError = vi.fn();
    const post = vi.fn().mockResolvedValueOnce({ revision: 3 }).mockRejectedValueOnce(new Error('Tu tienda ya tiene cambios tuyos'));
    bindStarterSwap(document.body, { post, onDone, onError });
    (document.querySelector('[data-starter-swap="calle"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    // A success keeps the cards off until the Studio reloads the project; the next render brings fresh ones.
    expect((document.querySelector('[data-starter-swap="calle"]') as HTMLButtonElement).disabled).toBe(true);
    document.body.innerHTML = renderStarterSwap(alts, '/', false);
    bindStarterSwap(document.body, { post, onDone, onError });
    (document.querySelector('[data-starter-swap="calle"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('Tu tienda ya tiene cambios tuyos'));
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-starter-swap]')].every(button => !button.disabled)).toBe(true);
  });
  it('shows under the reply that saved a style, only while the store is on that build and the merchant has not written since', () => {
    const messages = [
      { id: 'u1', role: 'USER', metadata: {} },
      { id: 'a1', role: 'ASSISTANT', metadata: { sourceRevision: 1, label: 'Estilo: Vitrina' } },
      { id: 'a2', role: 'ASSISTANT', metadata: { sourceRevision: 2, label: 'Rediseño' } },
    ];
    expect(showsStarterSwap(messages, 'a1')).toBe(true);
    expect(showsStarterSwap(messages, 'a2')).toBe(false);
    expect(showsStarterSwap([...messages, { id: 'u2', role: 'USER', metadata: {} }], 'a1')).toBe(false);
    expect(showsStarterSwap([{ id: 'a0', role: 'ASSISTANT', metadata: { sourceRevision: 1, label: 'Plantilla: Esencial' } }], 'a0')).toBe(true);
  });
});
