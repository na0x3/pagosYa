// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const created: Array<{ initial?: { id: string }; focus: ReturnType<typeof vi.fn> }> = [];
vi.mock('./source-create-product', () => ({
  PRODUCT_GUIDE_STEPS: ['description', 'price', 'photos', 'stock'],
  createProductForm: (_api: unknown, _store: string, _saved: () => void, _close: () => void, initial?: { id: string }) => {
    const form = { element: document.createElement('div'), focus: vi.fn(), dispose: vi.fn(), hasChanges: false, isBusy: false, initial };
    created.push(form);
    return form;
  },
}));
vi.mock('./source-library.css', () => ({}));

// Live check 2026-10-21: a product double-clicked in the Studio preview while its editor was already open asked
// «¿Descartar las respuestas…?» (a blocking confirm). The open product now just takes focus.
describe('product guide', () => {
  beforeEach(() => { created.length = 0; history.replaceState(null, '', '/?store=s1'); });
  it('asked again for the product already open, it focuses it without asking to discard', async () => {
    const { mountProductGuide } = await import('./source-product-guide');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    (globalThis as any).ResizeObserver ??= class { observe() {} };
    mountProductGuide(document.createElement('div'));
    const send = (product: { id: string }) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'pagosya:product-guide-edit', storeId: 's1', product }, origin: location.origin, source: window.parent }));
    send({ id: 'p1' });
    expect(created.at(-1)?.initial?.id).toBe('p1');
    (created.at(-1) as any).hasChanges = true;
    const opened = created.length;
    send({ id: 'p1' });
    expect(created.length).toBe(opened);
    expect(created.at(-1)?.focus).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    send({ id: 'p2' });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
