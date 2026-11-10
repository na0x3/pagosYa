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
    expect(m.game?.step).toBe('question');
  });
  it('leaves the corner tab after closing without claiming', async () => {
    const [m] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'portada', popupGame: 'scratch', popupGameSlices: SLICES.slice(0, 2) }, look: LIGHT, photo: PHOTO, actions: ['close'] }, [{ width: 390, height: 844 }]))!;
    expect(m.game?.tab?.visible).toBe(true);
  });
});
