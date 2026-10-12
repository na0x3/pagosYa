import { cardHtmlForPreview, styleProposalFrom, styleProposalView, type StyleProposal } from './source-style-proposal';

const proposal = (): StyleProposal => ({ version: 1, status: 'AWAITING_STYLE', createdAt: '2026-10-11T00:00:00.000Z', assetMap: [{ original: '/v1/uploads/abc.webp', path: 'assets/photo-1.webp' }],
  request: { dto: { revision: 0, instruction: 'x', brief: {} } as any, imageUses: [], redesign: false },
  slots: [0, 1, 2, 3].map(slot => ({ slot, mode: slot < 2 ? 'calm' : 'bold', kind: 'cafe-food', family: { id: 'f' }, file: { path: 'frame-draw.json', content: '{}' }, paragraph: 'p', palette: { id: 'x', name: 'x', paper: '#ffffff', ink: '#111111', accent: '#ff0000', accent2: '#eeeeee', dark: false }, draw: {}, playbook: 'pb' })) as any,
  design: { selected: 1, selection: { source: 'planner', rationale: 'r' }, concepts: [0, 2].map(slot => ({ name: `c${slot}`, opening: `o${slot}`, flow: 'f', premise: 'p', typography: 't', imagery: 'i', mobile: 'm', dna: { type: { display: 'outfit', text: 'manrope' } }, card: { slot, mode: slot < 2 ? 'calm' : 'bold', name: `Estilo ${slot}`, vibe: 'v', inspiration: ['a', 'b', 'c'] } })) as any },
  heroes: [{ html: '<style>@font-face{src:url("assets/outfit.ttf")}</style><img src="assets/photo-1.webp"><div style="background:url(assets/photo-1.webp)"></div>', source: 'model' }, null] });

it('rewrites fonts and bundled photos to URLs a sandboxed card can load', () => {
  const html = cardHtmlForPreview(proposal().heroes[0]!.html, proposal().assetMap);
  expect(html).toContain('/v1/source-fonts/outfit.ttf');
  expect(html).toContain('src="/v1/uploads/abc.webp"');
  expect(html).toContain('url(/v1/uploads/abc.webp)');
  expect(html).not.toContain('assets/');
});

it('lists one card per kept concept, in slot order, with names, fonts, palette and the recommendation', () => {
  const view = styleProposalView('gen1', proposal());
  expect(view.cards.map(card => card.slot)).toEqual([0, 2]);
  expect(view.cards[0]).toMatchObject({ index: 0, name: 'Estilo 0', mode: 'calm', fonts: { display: 'outfit', text: 'manrope', displayFamily: 'Outfit' }, palette: ['#ffffff', '#111111', '#ff0000', '#eeeeee'], source: 'model' });
  expect(view.cards[1]).toMatchObject({ html: null, source: null });
  expect(view.recommended).toBe(1);
});

it('refuses a saved value that is not a proposal', () => {
  expect(styleProposalFrom(null)).toBeNull();
  expect(styleProposalFrom({ version: 2 })).toBeNull();
  expect(styleProposalFrom(JSON.parse(JSON.stringify(proposal())))?.status).toBe('AWAITING_STYLE');
});

it('falls back to the palette each hero was drawn with when its slot has none (confirmed brand colours)', () => {
  const value = proposal();
  value.slots = value.slots.map(slot => ({ ...slot, palette: undefined }));
  value.heroPalettes = [{ paper: '#fafafa', ink: '#202020', accent: '#0055ff', accent2: '#dde6ff' }, null];
  const view = styleProposalView('gen1', value);
  expect(view.cards[0].palette).toEqual(['#fafafa', '#202020', '#0055ff', '#dde6ff']);
  expect(view.cards[1].palette).toEqual([]);
});

it('reports the pick only on a picked proposal', () => {
  expect(styleProposalView('gen1', { ...proposal(), status: 'PICKED', picked: 1 }).picked).toBe(1);
  expect('picked' in styleProposalView('gen1', { ...proposal(), picked: 1 })).toBe(false);
});

it('marks each card whose model hero is still being written as pending', () => {
  const value = { ...proposal(), status: 'RUNNING' as const, heroPending: [true, false] };
  expect(styleProposalView('gen1', value).cards.map(card => card.pending)).toEqual([true, false]);
  expect(styleProposalView('gen1', proposal()).cards.map(card => card.pending)).toEqual([false, false]);
  // Only a proposal still being drawn has pending cards: a stale flag never keeps "Mejorando diseño…" on screen.
  for (const status of ['AWAITING_STYLE', 'PICKED'] as const) expect(styleProposalView('gen1', { ...value, status, picked: 0 }).cards.map(card => card.pending)).toEqual([false, false]);
});

it('each card carries its commerce line, empty for a slot drawn before commerce draws', () => {
  const value = proposal();
  value.slots[2] = { ...value.slots[2], commerce: { account: 'split', checkout: 'ticket', fields: 'pill', cartSurface: 'sheet', added: 'stamp' } };
  expect(styleProposalView('g1', value).cards.map(card => [card.slot, card.commerce])).toEqual([[0, ''], [2, 'Cuenta: dividida · Pago: ticket · Carrito: hoja']]);
});
