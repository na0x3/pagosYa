import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Spec 2026-11-09 popup games: rasca y gana and ruleta; everyone wins a real prize, drawn and signed by the server. */
export const POPUP_GAMES = ['scratch', 'wheel'] as const;
export type PopupGame = (typeof POPUP_GAMES)[number];
/** Spec addendum 2026-11-09: a prize is a percent (each winner gets an own code); rows saved before carry promoCodeId instead. */
export type GamePrize = { percent?: number; promoCodeId?: string; label: string; chance: number };
export const prizePercent = (prize: GamePrize) => (Number.isInteger(prize.percent) ? prize.percent! : Number(/^(\d+)/.exec(prize.label)?.[1] ?? 0));
export type GameQuestion = { text: string; answers: string[] };
export type PopupGameSettings = { popupGame?: string | null; popupGamePrizes?: GamePrize[]; popupQuestion?: GameQuestion | null;
  /** Spec 2026-11-10 rasca y elige. */ popupShape?: string | null; popupInterests?: unknown; popupFavourite?: { text: string } | null; popupContact?: string };
export const readGame = (value: unknown): PopupGame | null => ((POPUP_GAMES as readonly unknown[]).includes(value) ? value as PopupGame : null);

/** roll is 0..99; prizes are in order and their chances sum to 100. */
export function drawPrize(prizes: GamePrize[], roll: number): GamePrize | null {
  let edge = 0;
  for (const prize of prizes) { edge += prize.chance; if (roll < edge) return prize; }
  return prizes.at(-1) ?? null;
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`game:${payload}`).digest('base64url');
export function createGameToken(storeId: string, percent: number, expMs: number, secret: string): string {
  const body = Buffer.from(`${percent}.${expMs}`).toString('base64url');
  return `${body}.${sign(`${storeId}:${percent}:${expMs}`, secret)}`;
}
/** The signed prize percent, or null (another store, another secret, edited or expired). */
export function readGameToken(token: string, storeId: string, secret: string, now = Date.now()): number | null {
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const [rawPercent, exp] = Buffer.from(body, 'base64url').toString().split('.');
  const percent = Number(rawPercent), expMs = Number(exp);
  if (!Number.isInteger(percent) || percent < 1 || percent > 90 || !Number.isFinite(expMs) || expMs < now) return null;
  const expected = Buffer.from(sign(`${storeId}:${percent}:${expMs}`, secret));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? percent : null;
}

export const DEFAULT_PRIZES = [5, 10, 15, 20] as const;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** The winner's own one-use code (spec addendum 2026-11-09): RULETA15-K7QM2X — no 0/O/1/I to misread. */
export const winnerCode = (game: PopupGame, percent: number) => `${game === 'scratch' ? 'RASCA' : 'RULETA'}${percent}-${Array.from({ length: 6 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('')}`;
export const prizeLabel = (percent: number) => `${percent} % de descuento`;
/** Larger prizes rarer: weights n…1 by size, scaled to 100 (the remainder goes to the smallest prize). */
export function rebalance(percents: number[]): number[] {
  const order = percents.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const weights = order.map((_, rank) => order.length - rank);
  const total = weights.reduce((a, b) => a + b, 0);
  const chances = weights.map(w => Math.floor((w * 100) / total));
  chances[0] += 100 - chances.reduce((a, b) => a + b, 0);
  const out = new Array<number>(percents.length);
  order.forEach(([, index], rank) => { out[index] = chances[rank]; });
  return out;
}
export function questionFor(categories: string[]): GameQuestion {
  const names = categories.map(name => name.trim()).filter(name => name && name.length <= 40);
  return names.length >= 3 ? { text: '¿Qué se te antoja más?', answers: names.slice(0, 4) } : { text: '¿Para quién compras?', answers: ['Para mí', 'Para regalar', 'Para compartir'] };
}

/* Spec 2026-11-10 rasca y elige (owner: the bakeme.pages.dev flow for every store): the card's shape, the interests, the favourite
 * question and the contact, all from the store's own words. Pure; PopupGameService writes them, the page reads them. */
export const POPUP_SHAPES = ['cookie', 'can', 'bottle', 'cup', 'flower', 'garment', 'box', 'bag'] as const;
export type PopupShape = (typeof POPUP_SHAPES)[number];
export const readShape = (value: unknown): PopupShape | null => ((POPUP_SHAPES as readonly unknown[]).includes(value) ? value as PopupShape : null);
const foldWords = (text: string) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SHAPE_WORDS: Array<[PopupShape, RegExp]> = [
  ['cookie', /\b(cookies?|galletas?|panader\w*|pasteler\w*|reposter\w*|brownies?|rolls?|horne\w*)\b/],
  ['can', /\b(sodas?|latas?|cervezas?|energizantes?|kombuchas?)\b/],
  ['bottle', /\b(botellas?|vinos?|salsas?|aceites?|jugos?|licores?|perfumes?)\b/],
  ['cup', /\b(cafe\w*|te|tes|matcha|infusion\w*|tazas?)\b/],
  ['flower', /\b(flor\w*|ramos?|plantas?)\b/],
  ['garment', /\b(ropa|hoodies?|poleras?|polerones?|vestidos?|camisas?|moda|prendas?|polos?)\b/],
  ['box', /\b(cajas?|canastas?|regalos?|frutas?|verduras?|boxes?)\b/],
];
/** The business's shape for the scratch card; a shopping bag when no word fits. */
export function popupShapeFor(words: string): PopupShape {
  const text = foldWords(words);
  return SHAPE_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'bag';
}
export type InterestAnswer = { label: string; icon: string };
export type PopupInterests = { text: string; answers: InterestAnswer[] };
const SECTOR_INTERESTS: Array<[RegExp, PopupInterests]> = [
  [/\b(cookies?|galletas?|panader\w*|pasteler\w*|reposter\w*)\b/, { text: '¿Para qué buscas algo rico?', answers: [
    { label: 'Para mí', icon: '🍪' }, { label: 'Para regalar', icon: '🎁' }, { label: 'Desayunos', icon: '☕' }, { label: 'Para la oficina', icon: '🏢' }, { label: 'Para una fiesta', icon: '🎉' }] }],
  [/\b(sodas?|bebidas?|kombuchas?|jugos?)\b/, { text: '¿Cuándo lo tomas?', answers: [
    { label: 'Para cuidarme', icon: '🌿' }, { label: 'Con la comida', icon: '🍽️' }, { label: 'Después de entrenar', icon: '🏋️' }, { label: 'Para compartir', icon: '🥂' }, { label: 'Para regalar', icon: '🎁' }] }],
  [/\b(ropa|hoodies?|poleras?|polerones?|vestidos?|moda|prendas?)\b/, { text: '¿Qué estilo te va?', answers: [
    { label: 'Oversize', icon: '🧥' }, { label: 'Colores neutros', icon: '🤍' }, { label: 'Con estampado', icon: '🎨' }, { label: 'Para regalar', icon: '🎁' }, { label: 'Para el frío', icon: '❄️' }] }],
  [/\b(cafe\w*|te|matcha)\b/, { text: '¿Cómo te gusta tu café?', answers: [
    { label: 'Para empezar el día', icon: '☀️' }, { label: 'Para llevar', icon: '🥤' }, { label: 'Con algo dulce', icon: '🍰' }, { label: 'Para regalar', icon: '🎁' }] }],
  [/\b(flor\w*|ramos?|plantas?)\b/, { text: '¿Para qué ocasión?', answers: [
    { label: 'Cumpleaños', icon: '🎂' }, { label: 'Aniversario', icon: '💐' }, { label: 'Para mi casa', icon: '🏡' }, { label: 'Para disculparme', icon: '🙏' }] }],
];
const CATEGORY_ICONS = ['✨', '⭐', '🛍️', '💡', '❤️'];
/** «¿Qué te interesa?»: the sector's answers, else the store's categories (and «Para regalar»), else who it is for. */
export function interestsFor(words: string, categories: string[]): PopupInterests {
  const sector = SECTOR_INTERESTS.find(([pattern]) => pattern.test(foldWords(words)));
  if (sector) return { text: sector[1].text, answers: sector[1].answers.map(answer => ({ ...answer })) };
  const names = categories.map(name => name.trim()).filter(name => name && name.length <= 28).slice(0, 5);
  const gift = names.some(name => foldWords(name) === 'para regalar') ? [] : [{ label: 'Para regalar', icon: '🎁' }];
  const answers = names.length >= 2 ? [...names.map((label, at) => ({ label, icon: CATEGORY_ICONS[at % CATEGORY_ICONS.length] })), ...gift]
    : [{ label: 'Para mí', icon: '🙋' }, { label: 'Para regalar', icon: '🎁' }, { label: 'Para compartir', icon: '🤝' }];
  return { text: '¿Qué te interesa?', answers: answers.slice(0, 6) };
}
/** The store's interests; a store from before (one text question) reads as interests without icons; removed (null) stays removed. */
export function readInterests(settings: { popupInterests?: unknown; popupQuestion?: unknown }): PopupInterests | null {
  if (settings.popupInterests === null) return null;
  const saved = settings.popupInterests as PopupInterests | undefined;
  if (saved && typeof saved.text === 'string' && Array.isArray(saved.answers) && saved.answers.length >= 2) {
    return { text: saved.text, answers: saved.answers.filter(answer => answer && typeof answer.label === 'string').map(answer => ({ label: answer.label, icon: typeof answer.icon === 'string' ? answer.icon : '' })) };
  }
  const old = settings.popupQuestion as GameQuestion | null | undefined;
  return old && typeof old.text === 'string' && Array.isArray(old.answers) && old.answers.length >= 2 ? { text: old.text, answers: old.answers.map(label => ({ label: String(label), icon: '' })) } : null;
}
/** «¿Cuál es tu favorito?» in the store's word: a one-product store chooses its flavour, clothes their model. */
export function favouriteQuestionFor(words: string, productCount: number): string {
  const text = foldWords(words);
  if (productCount <= 1 || /\bsabor\w*\b/.test(text)) return '¿Cuál es tu sabor favorito?';
  if (/\b(ropa|hoodies?|poleras?|polerones?|vestidos?|moda|prendas?|zapat\w*|modelos?)\b/.test(text)) return '¿Qué modelo te gusta más?';
  return '¿Cuál es tu favorito?';
}
export const readContact = (value: unknown): 'whatsapp' | 'email' => (value === 'email' ? 'email' : 'whatsapp');
/** A Bolivian WhatsApp (7–8 digits starting 2–7, +591 or 00591 optional) as 591XXXXXXXX; null for anything else. */
export function whatsappDigits(raw: string): string | null {
  if (/@/.test(String(raw ?? ''))) return null;
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  const local = digits.startsWith('591') ? digits.slice(3) : digits;
  return /^[2-7]\d{6,7}$/.test(local) ? `591${local}` : null;
}
