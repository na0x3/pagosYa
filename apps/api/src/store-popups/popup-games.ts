import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Spec 2026-11-09 popup games: rasca y gana and ruleta; everyone wins a real prize, drawn and signed by the server. */
export const POPUP_GAMES = ['scratch', 'wheel'] as const;
export type PopupGame = (typeof POPUP_GAMES)[number];
/** Spec addendum 2026-11-09: a prize is a percent (each winner gets an own code); rows saved before carry promoCodeId instead. */
export type GamePrize = { percent?: number; promoCodeId?: string; label: string; chance: number };
export const prizePercent = (prize: GamePrize) => (Number.isInteger(prize.percent) ? prize.percent! : Number(/^(\d+)/.exec(prize.label)?.[1] ?? 0));
export type GameQuestion = { text: string; answers: string[] };
export type PopupGameSettings = { popupGame?: string | null; popupGamePrizes?: GamePrize[]; popupQuestion?: GameQuestion | null };
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
