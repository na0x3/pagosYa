import type { StoreControls } from './store-controls';
import { CART_ICONS, SHARED_ICONS } from './store-controls-library';
import { CONTROLS_SCHEMA, controlsRequestBudgetMs, instructionConcernsControls, reviewControlsGuardBudgetMs, runControlsDesign, storeTokens } from './store-controls-design';

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

  it("drops a record the store cannot read on its own tokens, unbilled, as the library's languages are filtered (review CD fix 3)", async () => {
    const palette = [{ path: 'styles.css', content: ':root{--store-background:#ffffff;--store-foreground:#111111;--store-accent:#f5d90a;--store-accent-foreground:#111111}' }, files[1]];
    const onDropped = jest.fn();
    const { deps: input, used } = deps(reply({ ...ANSWER, shape: { ...ANSWER.shape, fill: 'outline', colour: 'accent' } }), { files: palette, onDropped });
    expect(await runControlsDesign(input)).toBeNull();
    expect(onDropped).toHaveBeenCalledWith('contrast');
    expect(used).not.toHaveBeenCalled();
    expect(await runControlsDesign(deps(reply(ANSWER), { files: palette }).deps)).not.toBeNull();
  });

  it('says why an unusable answer was dropped', async () => {
    const onDropped = jest.fn();
    expect(await runControlsDesign(deps(reply('esto no es JSON'), { onDropped }).deps)).toBeNull();
    expect(onDropped).toHaveBeenCalledWith('unusable answer');
  });

  it('asks for strict JSON with every slot', () => {
    expect(CONTROLS_SCHEMA.required).toEqual(['shape', 'layout', 'icons', 'words', 'badge', 'note']);
    expect(CONTROLS_SCHEMA.properties.icons.required).toEqual(['cart', 'account', 'menu', 'search', 'plus', 'minus', 'close']);
  });

  it('reads the store tokens from brand.css and styles.css', () => {
    expect(storeTokens(files)).toBe('background: #f7f4ef; accent: #2f4bb8');
  });
});

describe('instructionConcernsControls', () => {
  it.each([
    ['haz el carrito como una taza', true], ['botones más redondos', true], ['Cambia el ícono del carrito por una canasta', true],
    ['quiero los botones con forma de etiqueta', true], ['el contador del carrito en rojo', true], ['Un botón del carrito más grande', true],
    ['El carrito en forma de bolsa', true],
    ['Pon las fotos de los productos inclinadas', false], ['Cambia el título del inicio', false], ['Agrega un botón de WhatsApp', false],
    ['El carrito con un sello como en la portada', false],
    // Review CD fix 1: the request must name a header control; a bare shape word or another target is not one.
    ['Agrega un botón de WhatsApp en el menú', false], ['Pon un botón para ver mi cuenta de Instagram', false],
    ['Ten en cuenta que el botón de reservar debe verse bien', false], ['El botón Comprar ahora del inicio más redondo', false],
    ['Haz el botón de la portada más grande y redondo', false], ['Los íconos de la sección de beneficios en forma de círculo', false],
    ['Agrega iconos de Instagram y TikTok en el pie de página con bordes', false], ['Agrega un botón para buscar en el catálogo', false],
    ['Los botones de la portada más redondos', false], ['Botones redondos en el catálogo', false], ['Cambia el carrito', false],
    ['Haz los botones de la tienda más redondos', true], ['Los botones del encabezado con forma de etiqueta', true],
    ['Los íconos de arriba más redondos', true], ['El ícono de mi cuenta como una taza', true], ['El botón del menú con bordes', true],
    ['La lupa del buscador en forma de lupa antigua', true], ['El carrito con un ícono de canasta', true], ['El numerito del carrito en verde', true],
  ])('%s → %s', (text, expected) => expect(instructionConcernsControls(text)).toBe(expected));

  it("reads only the merchant's own words after the marker", () => {
    expect(instructionConcernsControls('Resumen: botones redondos.\nPedido actual del comercio: cambia el título')).toBe(false);
  });
});

describe('controlsRequestBudgetMs (review CD fix 2)', () => {
  it("keeps the guard's 30 s and the 60 s save margin out of the call's time, and skips under 20 s", () => {
    expect(controlsRequestBudgetMs(300_000)).toBe(60_000);
    expect(controlsRequestBudgetMs(110_000)).toBe(20_000);
    expect(controlsRequestBudgetMs(100_000)).toBe(0);
  });
});

describe('reviewControlsGuardBudgetMs (review CD fix 5)', () => {
  it("leaves 60 s for the N+1 save and skips when the guard's 30 s would not fit", () => {
    expect(reviewControlsGuardBudgetMs(200_000)).toBe(140_000);
    expect(reviewControlsGuardBudgetMs(90_000)).toBe(30_000);
    expect(reviewControlsGuardBudgetMs(89_000)).toBe(0);
  });
});
