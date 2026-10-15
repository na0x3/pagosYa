import type { StoreControls } from './store-controls';
import { CART_ICONS, SHARED_ICONS } from './store-controls-library';
import { CONTROLS_SCHEMA, runControlsDesign, storeTokens } from './store-controls-design';

const ANSWER = {
  shape: { outline: 'stamp', corner: 0, notch: 8, tilt: 2, border: 'dashed', weight: 2, fill: 'solid', colour: 'ink' },
  layout: { cart: 'icon+word', account: 'icon' },
  icons: { cart: CART_ICONS.cup.solid, account: '', menu: '', search: '', plus: 'M0 0L30 30', minus: '', close: '' },
  words: { cart: 'Tu taza', account: '' }, badge: 'stamp',
  note: 'Diseñé los botones como sellos, con una taza para el carrito.',
};
const reply = (value: unknown) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }] });
const files = [
  { path: 'brand.css', content: ':root{--brand-background:#f7f4ef;--brand-accent:#2f4bb8}' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"look":{"version":1,"edge":"offset"}};\n' },
];
const deps = (body: unknown, over: Record<string, unknown> = {}) => {
  const used = jest.fn();
  const call = jest.fn(async (_text: string, _images: unknown[]) => ({ body, used }));
  return { used, call, deps: { files, brief: { businessType: 'Cafetería' }, storeName: 'Café Remanso', kind: 'cafe-food' as const, products: ['Latte', 'Torta de chocolate'], avoid: [] as StoreControls[], signal: new AbortController().signal, call, fallbackIcon: () => SHARED_ICONS.plus.line, capture: jest.fn(async () => []), ...over } };
};

describe('runControlsDesign (spec 2026-10-14, part 4)', () => {
  it("turns the answer into a sanitized YAPI record, the library icon in place of a bad one, without billing it itself", async () => {
    const { deps: input, used } = deps(reply(ANSWER));
    const designed = await runControlsDesign(input);
    expect(designed!.controls).toEqual({ version: 1, shape: ANSWER.shape, layout: ANSWER.layout, icons: { cart: CART_ICONS.cup.solid, plus: SHARED_ICONS.plus.line }, words: { cart: 'Tu taza' }, badge: 'stamp', source: 'yapi' });
    expect(designed!.replacedIcons).toEqual(['plus']);
    expect(designed!.note).toBe(ANSWER.note);
    expect(used).not.toHaveBeenCalled();
  });

  it.each([
    ['an answer that is not JSON', reply('esto no es JSON')],
    ['an unknown outline', reply({ ...ANSWER, shape: { ...ANSWER.shape, outline: 'hexagon' } })],
    ['an incomplete answer', { status: 'incomplete' }],
  ])('returns null for %s', async (_name, body) => {
    expect(await runControlsDesign(deps(body).deps)).toBeNull();
  });

  it("tells the model the business, tokens, look, languages not to repeat, the redesign, the store's current controls and the merchant's words", async () => {
    const sibling = { ...(await runControlsDesign(deps(reply(ANSWER)).deps))!.controls, shape: { ...ANSWER.shape, outline: 'ticket' as const } };
    const { deps: input, call } = deps(reply(ANSWER), { avoid: [sibling], previous: sibling, current: sibling, instruction: 'haz el carrito como una taza' });
    await runControlsDesign(input);
    const text = call.mock.calls[0][0];
    for (const part of ['«Café Remanso»', 'café and food', 'Latte', 'background: #f7f4ef', '"edge":"offset"', 'do not repeat', '"outline":"ticket"', 'move away', 'current controls', '«haz el carrito como una taza»', 'fill-rule evenodd', '1,500 characters', '1-14 letters']) {
      expect({ part, found: text.includes(part) }).toEqual({ part, found: true });
    }
  });

  it('asks for strict JSON with every slot', () => {
    expect(CONTROLS_SCHEMA.required).toEqual(['shape', 'layout', 'icons', 'words', 'badge', 'note']);
    expect(CONTROLS_SCHEMA.properties.icons.required).toEqual(['cart', 'account', 'menu', 'search', 'plus', 'minus', 'close']);
  });

  it('reads the store tokens from brand.css and styles.css', () => {
    expect(storeTokens(files)).toBe('background: #f7f4ef; accent: #2f4bb8');
  });
});
