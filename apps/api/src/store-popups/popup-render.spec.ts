import { checkPopupRender, measurePopup } from './popup-render';
import { POPUP_LOOK_IDS } from './popup-looks';

jest.setTimeout(120_000);
// A 1×1 PNG: object-fit:cover stretches it over the photo slot.
const PHOTO = { bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), contentType: 'image/png' };
const WORDS = { signupTitle: 'Sé parte de Miga Dorada', signupBody: 'Pan recién salido, primero para ti.', signupButton: 'Quiero unirme', popupHasCode: false };
const LOOK = { background: '#f6efe3', foreground: '#2a2118', accent: '#8a3b12', accentForeground: '#ffffff' };
const LIGHT = { background: '#f6efe3', foreground: '#2a2118', accent: '#f4c2cc', accentForeground: '#2a2118' };
const DARK = { background: '#14110f', foreground: '#f3ece2', accent: '#c8a04a', accentForeground: '#14110f' };

describe('popup render', () => {
  it('shows the photo on phones in the built-in layout, with the short form', async () => {
    const measures = await measurePopup({ storeName: 'Miga Dorada', settings: WORDS, look: LOOK, photo: PHOTO });
    expect(measures).not.toBeNull();
    const [desktop, phone] = measures!;
    expect(desktop.dialogOpen && phone.dialogOpen).toBe(true);
    expect(desktop.boxes.photo?.visible).toBe(true);
    expect(phone.boxes.photo?.visible).toBe(true);
    expect(phone.boxes.photo!.height).toBeGreaterThanOrEqual(120);
    expect(phone.nameField).toBe(false);
  });
});

describe('popup looks render (spec 2026-11-09)', () => {
  for (const look of POPUP_LOOK_IDS) for (const [palette, colours] of [['light', LIGHT], ['dark', DARK]] as const) {
    it(`${look} on a ${palette} store is legible at desktop and phone width`, async () => {
      const measures = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: look }, look: colours, photo: PHOTO }))!;
      expect(measures.map(m => m.look)).toEqual([look, look]);
      expect(checkPopupRender(measures)).toEqual([]);
      expect(measures.every(m => m.nameField === false)).toBe(true);
    });
  }
  it('keeps the button and photo on a published (hosted) store', async () => {
    const [phone] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'portada' }, look: LIGHT, photo: PHOTO, hosted: true }, [{ width: 390, height: 844 }]))!;
    expect(phone.boxes.email).toBeNull();
    expect(phone.boxes.submit?.visible).toBe(true);
    expect(phone.boxes.photo?.visible).toBe(true);
  });
  it('uses the chosen upload photo, from the API base', async () => {
    const [desktop] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'clasica', popupPhoto: '/v1/uploads/abc.jpg' }, look: LIGHT, photo: PHOTO, apiBaseUrl: 'https://popup-check.invalid/v1' }, [{ width: 1280, height: 800 }]))!;
    expect(desktop.photoSrc).toBe('https://popup-check.invalid/v1/uploads/abc.jpg');
  });
  it('draws the built-in layout for an unknown look', async () => {
    const [desktop] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'ruleta' }, look: LIGHT, photo: PHOTO }, [{ width: 1280, height: 800 }]))!;
    expect(desktop.look).toBeNull();
    expect(desktop.boxes.submit?.visible).toBe(true);
  });
});

describe('popup games render (spec 2026-11-09)', () => {
  const SLICES = ['5 % de descuento', '10 % de descuento', '15 % de descuento', '20 % de descuento'];
  for (const game of ['scratch', 'wheel'] as const) for (const look of POPUP_LOOK_IDS) {
    it(`${game} in ${look}: the game shows at desktop and phone width`, async () => {
      const measures = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: look, popupGame: game, popupGameSlices: SLICES }, look: LIGHT, photo: PHOTO }))!;
      for (const m of measures) { expect(m.game?.step).toBe('play'); expect(m.game?.play?.visible).toBe(true); expect(m.game!.play!.height).toBeGreaterThanOrEqual(160); expect(m.smallText).toEqual([]); }
    });
  }
  it('makes the win the big moment: the prize line at least 24px', async () => {
    const [m] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'clasica', popupGame: 'scratch', popupGameSlices: SLICES.slice(0, 2) }, look: LIGHT, photo: PHOTO, actions: ['play'] }, [{ width: 390, height: 844 }]))!;
    expect(m.game?.step).toBe('reveal');
    expect(m.game!.wonSize).toBeGreaterThanOrEqual(24);
  });
  it('reveals the exact prize, then asks the question', async () => {
    const [m] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'clasica', popupGame: 'wheel', popupGameSlices: SLICES.slice(0, 2), popupQuestion: { text: '¿Para quién compras?', answers: ['Para mí', 'Para regalar'] } }, look: LIGHT, photo: PHOTO, actions: ['play', 'claim'] }, [{ width: 390, height: 844 }]))!;
    expect(m.game?.step).toBe('interests');
  });
  it('leaves the corner tab after closing without claiming', async () => {
    const [m] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'portada', popupGame: 'scratch', popupGameSlices: SLICES.slice(0, 2) }, look: LIGHT, photo: PHOTO, actions: ['close'] }, [{ width: 390, height: 844 }]))!;
    expect(m.game?.tab?.visible).toBe(true);
  });
});

describe('rasca y elige render (spec 2026-11-10)', () => {
  const SLICES = ['10 % de descuento', '15 % de descuento'];
  const INTERESTS = { text: '¿Para qué buscas algo rico?', answers: [{ label: 'Para mí', icon: '🍪' }, { label: 'Para regalar', icon: '🎁' }, { label: 'Desayunos', icon: '☕' }] };
  const photo = (name: string) => `https://popup-check.invalid/${name}.jpg`;
  const ITEMS = [{ id: 'p1', name: 'Torre de cookies', imageUrls: [photo('p1')] }, { id: 'p2', name: 'Caja de rolls', imageUrls: [photo('p2')] }, { id: 'p3', name: 'Desayuno box', imageUrls: [photo('p3')] },
    { id: 'p4', name: 'Sin foto', imageUrls: [] }, { id: 'p5', name: 'Club', imageUrls: [photo('p5')], fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ months: 1 }] }, { id: 'p6', name: 'Agotado', imageUrls: [photo('p6')], stock: 0 }];
  const SODA = [{ id: 'soda', name: 'Oh Belly', imageUrls: [photo('soda')], variants: ['Limón', 'Pera', 'Sandía', 'Naranja'].map((value, at) => ({ id: `v${at}`, name: value, amount: 1800, options: [{ name: 'Sabor', value }], imageUrls: [photo(`v${at}`)] })) }];
  const settings = (over: Record<string, unknown> = {}) => ({ ...WORDS, popupLook: 'clasica', popupGame: 'scratch', popupGameSlices: SLICES, popupShape: 'cookie', popupInterests: INTERESTS, popupFavourite: { text: '¿Cuál es tu favorito?' }, popupContact: 'whatsapp', ...over });
  const run = async (over: Record<string, unknown>, actions: NonNullable<Parameters<typeof measurePopup>[0]['actions']>, items: unknown[] = ITEMS, hosted = false) =>
    (await measurePopup({ storeName: 'Miga Dorada', settings: settings(over), look: LIGHT, photo: PHOTO, actions, items, hosted }, [{ width: 390, height: 844 }]))![0];
  for (const shape of ['cookie', 'can', 'bottle', 'cup', 'flower', 'garment', 'box', 'bag']) {
    it(`draws the ${shape} card big enough on desktop and phone`, async () => {
      const measures = (await measurePopup({ storeName: 'Miga Dorada', settings: settings({ popupShape: shape }), look: LIGHT, photo: PHOTO, items: ITEMS }))!;
      for (const m of measures) { expect(m.game?.shape).toBe(shape); expect(m.game!.play!.height).toBeGreaterThanOrEqual(160); expect(m.smallText).toEqual([]); }
      // Live Oh Belly 2026-11-10: the prize panel stuck out on both sides of the can; it sits inside each shape.
      expect(measures[0].game!.prizeWidth!).toBeLessThanOrEqual(({ can: 0.46, bottle: 0.4, cup: 0.6, garment: 0.52, flower: 0.66, box: 0.8, bag: 0.72, cookie: 0.8 } as Record<string, number>)[shape]);
    });
  }
  it('three quick strokes reveal the prize', async () => {
    expect((await run({}, ['scratch'])).game?.step).toBe('reveal');
  });
  it('asks what interests them, several answers, «Siguiente» only after one', async () => {
    const asked = await run({}, ['play', 'claim']);
    expect(asked.game).toMatchObject({ step: 'interests', answers: 3, nextDisabled: true });
    expect((await run({}, ['play', 'claim', 'interest'])).game?.nextDisabled).toBe(false);
  });
  it('the favourite tiles are the products with a photo, never a membership or a sold-out one', async () => {
    expect((await run({}, ['play', 'claim', 'interest', 'next'])).game).toMatchObject({ step: 'favourite', tiles: ['Torre de cookies', 'Caja de rolls', 'Desayuno box'] });
  });
  it('a one-product store chooses its flavour; fewer than three choices skip the step', async () => {
    expect((await run({}, ['play', 'claim', 'skip'], SODA)).game).toMatchObject({ step: 'favourite', tiles: ['Limón', 'Pera', 'Sandía', 'Naranja'] });
    expect((await run({}, ['play', 'claim', 'skip'], ITEMS.slice(0, 2))).game?.step).toBe('contact');
  });
  it('asked for the favourite flavour, a store of several products shows the flavours (live Oh Belly 2026-11-10)', async () => {
    expect((await run({ popupFavourite: { text: '¿Cuál es tu sabor favorito?' } }, ['play', 'claim', 'skip'], [...ITEMS, ...SODA])).game?.tiles).toEqual(['Limón', 'Pera', 'Sandía', 'Naranja']);
  });
  it('a merchant who removed the favourite question gets no favourite step (final review 2026-11-10)', async () => {
    expect((await run({ popupFavourite: null }, ['play', 'claim', 'skip'])).game?.step).toBe('contact');
  });
  it('asks the WhatsApp (or the email) to save the prize, naming the favourite', async () => {
    const whatsapp = await run({}, ['play', 'claim', 'skip', 'favourite']);
    expect(whatsapp.game).toMatchObject({ step: 'contact', contactType: 'tel', submitLabel: 'Suscribirme y ver Torre de cookies' });
    expect((await run({ popupContact: 'email' }, ['play', 'claim', 'skip', 'favourite'])).game?.contactType).toBe('email');
  });
  it('«No, gracias» tells the store page the favourite (remembering it is checked on a real page, source-commerce-favourite)', async () => {
    expect((await run({}, ['play', 'claim', 'skip', 'favourite', 'nothanks'])).game).toMatchObject({ favouriteEvent: 'p1' });
  });
  it('on a published store the number is asked in pagosYa\'s secure form, the button still shows', async () => {
    const hosted = await run({}, ['play', 'claim', 'skip', 'favourite'], ITEMS, true);
    expect(hosted.game?.contactType).toBeNull();
    expect(hosted.boxes.submit?.visible).toBe(true);
  });
  it('an old store with one text question reads it as interests', async () => {
    const old = await run({ popupInterests: undefined, popupQuestion: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] } }, ['play', 'claim']);
    expect(old.game).toMatchObject({ step: 'interests', answers: 2 });
  });
});
