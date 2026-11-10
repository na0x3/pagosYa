import { POPUP_SHAPES, readShape, popupShapeFor, interestsFor, readInterests, favouriteQuestionFor, readContact, whatsappDigits, createGameToken, drawPrize, prizeLabel, prizePercent, questionFor, readGame, readGameToken, rebalance, winnerCode } from './popup-games';

const PRIZES = [{ percent: 5, label: '5 %', chance: 40 }, { percent: 10, label: '10 %', chance: 30 }, { percent: 15, label: '15 %', chance: 20 }, { percent: 20, label: '20 %', chance: 10 }];
describe('popup games', () => {
  it('reads the two games only', () => {
    expect(readGame('scratch')).toBe('scratch'); expect(readGame('wheel')).toBe('wheel'); expect(readGame('slots')).toBeNull();
  });
  it('draws by chance: rolls 0–39 the first prize, 90–99 the last', () => {
    expect(drawPrize(PRIZES, 0)!.percent).toBe(5); expect(drawPrize(PRIZES, 39)!.percent).toBe(5);
    expect(drawPrize(PRIZES, 40)!.percent).toBe(10); expect(drawPrize(PRIZES, 99)!.percent).toBe(20);
    expect(drawPrize([], 5)).toBeNull();
  });
  it('signs a prize percent for one store and 30 minutes; any change or expiry fails', () => {
    const now = 1_000_000; const token = createGameToken('s1', 15, now + 1_800_000, 'secret');
    expect(readGameToken(token, 's1', 'secret', now)).toBe(15);
    expect(readGameToken(token, 's2', 'secret', now)).toBeNull();
    expect(readGameToken(token, 's1', 'other', now)).toBeNull();
    expect(readGameToken(token, 's1', 'secret', now + 1_800_001)).toBeNull();
    expect(readGameToken(`${Buffer.from(`20.${now + 1_800_000}`).toString('base64url')}.${token.split('.')[1]}`, 's1', 'secret', now)).toBeNull();
    expect(readGameToken('garbage', 's1', 'secret', now)).toBeNull();
  });
  it('gives each winner an own code and reads old prize rows by their label (spec addendum 2026-11-09)', () => {
    expect(winnerCode('wheel', 15)).toMatch(/^RULETA15-[A-HJ-NP-Z2-9]{6}$/);
    expect(winnerCode('scratch', 5)).toMatch(/^RASCA5-[A-HJ-NP-Z2-9]{6}$/);
    expect(new Set(Array.from({ length: 50 }, () => winnerCode('wheel', 10))).size).toBeGreaterThan(45);
    expect(prizeLabel(15)).toBe('15 % de descuento');
    expect(prizePercent({ promoCodeId: 'x', label: '20 % de descuento', chance: 10 })).toBe(20);
    expect(prizePercent({ percent: 25, label: '25 % de descuento', chance: 10 })).toBe(25);
  });
  it('writes the question from the categories, else asks who it is for', () => {
    expect(questionFor(['Gelatos', 'Copas', 'Para regalar', 'Para compartir', 'Extra'])).toEqual({ text: '¿Qué se te antoja más?', answers: ['Gelatos', 'Copas', 'Para regalar', 'Para compartir'] });
    expect(questionFor(['Pan'])).toEqual({ text: '¿Para quién compras?', answers: ['Para mí', 'Para regalar', 'Para compartir'] });
  });
  it('rebalances chances to 100 with larger prizes rarer', () => {
    expect(rebalance([5, 10, 15, 20])).toEqual([40, 30, 20, 10]);
    const three = rebalance([10, 20, 30]); expect(three.reduce((a, b) => a + b, 0)).toBe(100); expect(three[0]).toBeGreaterThan(three[2]);
  });
});

describe('rasca y elige helpers (spec 2026-11-10)', () => {
  it('picks the shape from the business words', () => {
    expect(popupShapeFor('Panadería de autor: cookies rellenas y rolls')).toBe('cookie');
    expect(popupShapeFor('soda prebiótica en lata, 5 sabores')).toBe('can');
    expect(popupShapeFor('salsa picante de locoto en botella')).toBe('bottle');
    expect(popupShapeFor('café de especialidad y matcha')).toBe('cup');
    expect(popupShapeFor('arreglos florales y ramos')).toBe('flower');
    expect(popupShapeFor('hoodies y poleras oversize')).toBe('garment');
    expect(popupShapeFor('canastas de frutas a domicilio')).toBe('box');
    expect(popupShapeFor('licuadoras')).toBe('bag');
    expect(readShape('can')).toBe('can');
    expect(readShape('rocket')).toBeNull();
  });
  it('writes interests for the sector, with an emoji each, 3–6 answers; else from the categories', () => {
    const bakery = interestsFor('panadería, cookies', ['Cookies', 'Cajas']);
    expect(bakery.text).toBe('¿Para qué buscas algo rico?');
    expect(bakery.answers.map(a => a.label)).toEqual(['Para mí', 'Para regalar', 'Desayunos', 'Para la oficina', 'Para una fiesta']);
    expect(bakery.answers.every(a => a.icon && a.label.length <= 28)).toBe(true);
    expect(interestsFor('licuadoras', ['Personales', 'De vaso', 'Accesorios']).answers.map(a => a.label)).toEqual(['Personales', 'De vaso', 'Accesorios', 'Para regalar']);
    expect(interestsFor('licuadoras', []).answers.map(a => a.label)).toEqual(['Para mí', 'Para regalar', 'Para compartir']);
  });
  it('reads an old text question as interests without icons; nothing → null', () => {
    expect(readInterests({ popupQuestion: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] } })).toEqual({ text: '¿Para quién?', answers: [{ label: 'Para mí', icon: '' }, { label: 'Para regalar', icon: '' }] });
    expect(readInterests({})).toBeNull();
    expect(readInterests({ popupInterests: null, popupQuestion: { text: 'x', answers: ['a', 'b'] } })).toBeNull();
  });
  it('asks the favourite in the store word; contact defaults to WhatsApp; numbers are Bolivian', () => {
    expect(favouriteQuestionFor('soda en 5 sabores', 1)).toBe('¿Cuál es tu sabor favorito?');
    expect(favouriteQuestionFor('hoodies', 7)).toBe('¿Qué modelo te gusta más?');
    expect(favouriteQuestionFor('panadería', 8)).toBe('¿Cuál es tu favorito?');
    expect(readContact('email')).toBe('email');
    expect(readContact(undefined)).toBe('whatsapp');
    expect(whatsappDigits('7123 4567')).toBe('59171234567');
    expect(whatsappDigits('+591 71234567')).toBe('59171234567');
    expect(whatsappDigits('123')).toBeNull();
    expect(whatsappDigits('ana71234567@mail.com')).toBeNull();
  });
});
