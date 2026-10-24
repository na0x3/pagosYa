/** Spec 2026-10-24 §2: the starter closest to the business, chosen in code before the fill so the right fill path (master or
 *  copy slots) runs. Deterministic: the same words always give the same starter. */
export type StarterChoice = { id: string; fits: readonly string[]; fashion?: boolean; order: number };

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, word: string) => new RegExp(`(?<!\\p{L})${escapeRe(plain(word))}(?!\\p{L})`, 'u').test(text);
const CALM = /(?<!\p{L})(minimalista|minimal|lujo|elegante)(?!\p{L})/u;
const PLAYFUL = /(?<!\p{L})(divertid\p{L}*|alegre|colorid\p{L}*|juguet\p{L}*)(?!\p{L})/u;

export function rankStarters(input: { text: string; fashion: boolean; starters: readonly StarterChoice[]; recent: readonly string[] }): string[] {
  const text = plain(input.text);
  const fashionOnes = input.starters.filter(starter => starter.fashion);
  // A fashion catalogue needs the fashion card and page (Review Focus 3).
  const eligible = input.fashion && fashionOnes.length ? fashionOnes : [...input.starters];
  const base = new Map(eligible.map(starter => {
    let score = starter.fits.filter(word => has(text, word)).length;
    if (CALM.test(text) && starter.fits.some(word => word === 'minimal' || word === 'lujo')) score += 2;
    if (PLAYFUL.test(text) && starter.fits.includes('alegre')) score += 2;
    return [starter.id, score] as const;
  }));
  const byOrder = (a: StarterChoice, b: StarterChoice) => a.order - b.order || a.id.localeCompare(b.id);
  const positives = eligible.filter(starter => base.get(starter.id)! > 0);
  if (!positives.length) return [...eligible].sort((a, b) => (a.id === 'esencial' ? -1 : b.id === 'esencial' ? 1 : byOrder(a, b))).map(starter => starter.id);
  // The merchant's last stores give way when another starter also fits.
  const score = (starter: StarterChoice) => base.get(starter.id)! - (input.recent.includes(starter.id) && positives.length > 1 ? 3 : 0);
  return [...eligible].sort((a, b) => score(b) - score(a) || byOrder(a, b)).map(starter => starter.id);
}

export const pickStarter = (input: Parameters<typeof rankStarters>[0]): string => rankStarters(input)[0] ?? 'esencial';
