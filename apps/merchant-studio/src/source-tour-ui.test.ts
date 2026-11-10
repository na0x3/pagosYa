import { describe, expect, it } from 'vitest';
import { renderTourChips, tourFocusPayload, tourViewOf } from './source-tour-ui';

const step = { id: 'home-1', kind: 'section', page: 'home', at: 1, label: 'Productos' };
const message = (id: string, metadata: Record<string, unknown>) => ({ id, role: 'ASSISTANT', metadata });
describe('YAPI tour in the Studio (spec 2026-11-09)', () => {
  it('shows the buttons only on the newest tour message', () => {
    const messages = [
      message('m1', { tour: { id: 't1' }, tourStep: step, tourChips: [{ label: 'Me gusta', action: 'like' }] }),
      message('m2', { tour: { id: 't1' }, tourStep: { ...step, id: 'home-2', at: 2 }, tourChips: [{ label: 'Me gusta', action: 'like' }, { label: 'Cámbiala', action: 'change' }] }),
    ];
    expect(tourViewOf(messages[0], messages)).toBeNull();
    expect(tourViewOf(messages[1], messages)).toEqual({ messageId: 'm2', tourId: 't1', chips: [{ label: 'Me gusta', action: 'like' }, { label: 'Cámbiala', action: 'change' }], step: { ...step, id: 'home-2', at: 2 } });
    expect(tourViewOf(message('m3', { tour: { id: 't1' }, tourChips: [{ label: 'x', action: 'hack' }] }), [])).toBeNull();
  });
  it('draws the buttons with their action, escaped', () => {
    const html = renderTourChips({ messageId: 'm2', tourId: 't"1', chips: [{ label: 'Me <gusta>', action: 'like' }], step: null }, false);
    expect(html).toBe('<div class="clarification-options source-tour-chips"><button type="button" data-tour-action="like" data-tour-id="t&quot;1">Me &lt;gusta&gt;</button></div>');
    expect(renderTourChips({ messageId: 'm', tourId: 't', chips: [{ label: 'Saltar', action: 'skip' }], step: null }, true)).toContain('disabled');
  });
  it('tells the preview where to go: a home section, a part, the cart; the popup opens the popup preview instead', () => {
    expect(tourFocusPayload(step)).toEqual({ type: 'pagosya:tour-focus', page: 'home', at: 1 });
    expect(tourFocusPayload({ id: 'footer', kind: 'part', page: 'home', part: 'footer', label: 'Pie' })).toEqual({ type: 'pagosya:tour-focus', part: 'footer' });
    expect(tourFocusPayload({ id: 'cart', kind: 'cart', page: 'home', label: 'Carrito' })).toEqual({ type: 'pagosya:tour-focus', kind: 'cart' });
    expect(tourFocusPayload({ id: 'product', kind: 'product', page: 'product', label: 'Ficha' })).toEqual({ type: 'pagosya:tour-focus', kind: 'product' });
    expect(tourFocusPayload({ id: 'popup', kind: 'popup', page: 'home', label: 'Ventana' })).toBeNull();
  });
});
