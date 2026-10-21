/** John Smedley sections (spec docs/superpowers/specs/2026-10-21-smedley-sections-design.md): which of the five new Esencial
 *  home sections a store can have, the dice roll (0–2, seeded by the store), and each section's data — photos, links, the
 *  category and colour lists and the words — written to store-data as `features` and drawn by components/features.tsx. */
import { createHash } from 'node:crypto';

export const FEATURE_IDS = ['duo', 'explore', 'capsule', 'origin', 'palette'] as const;
export type FeatureId = typeof FEATURE_IDS[number];
export type FeatureCopy = { duoTitles: string[]; duoCtas: string[]; capsuleText: string; originCaption: string; originLink: string; paletteIntro: string };
export const FEATURE_COPY_CAPS = { duoTitle: 28, duoCta: 18, capsuleText: 220, originCaption: 60, originLink: 24, paletteIntro: 220 } as const;
export type FeatureFacts = { hero: string; lifestyle: string[]; categories: Array<{ id: string; name: string }>; productIds: string[]; colours: Array<{ group: string; value: string; name: string; hex: string }>; city: string };

/** The kit's swatch table (commerce-src/product/setup.js `swatchColors`); a test keeps the two the same. */
export const FEATURE_SWATCHES: Record<string, string> = { negro: '#292b29', black: '#292b29', blanco: '#fffdf7', white: '#fffdf7', rojo: '#b5443f', red: '#b5443f', azul: '#446a98', blue: '#446a98', verde: '#71866a', green: '#71866a', rosa: '#d89ca6', pink: '#d89ca6', beige: '#d8c5a9', crema: '#eee4c9', cream: '#eee4c9', salvia: '#8b987b', 'verde salvia': '#8b987b', sage: '#8b987b', coral: '#d98b70', marfil: '#f1e8d5', ivory: '#f1e8d5', marron: '#805d48', brown: '#805d48', gris: '#92928e', gray: '#92928e', grey: '#92928e', amarillo: '#e0b847', yellow: '#e0b847', naranja: '#d28349', orange: '#d28349', morado: '#80678f', purple: '#80678f', oliva: '#757853', olive: '#757853' };
/** The option groups the kit draws as swatches. */
const COLOUR_GROUP = /^(color|colour|tono|tinte|acabado|finish)$/i;
const fold = (text: string) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clip = (text: unknown, max: number) => typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';

type StoreData = { categories?: Array<{ id: string; name: string }>; items?: Array<{ id: string; categoryId?: string | null; variants?: Array<{ options?: Array<{ name: string; value: string }> }> }> };

export function featureFacts(data: StoreData, photos: Record<string, string>, city: string): FeatureFacts {
  const hero = photos.hero || '';
  const lifestyle = [...new Set([photos.story, photos.p1, photos.p2, photos.p3, photos.p4].filter((src): src is string => Boolean(src) && src !== hero))];
  const items = data.items ?? [];
  const categories = (data.categories ?? []).filter(category => items.some(item => item.categoryId === category.id)).map(({ id, name }) => ({ id, name }));
  const colours: FeatureFacts['colours'] = [];
  for (const item of items) for (const variant of item.variants ?? []) for (const option of variant.options ?? []) {
    if (!COLOUR_GROUP.test(option.name)) continue;
    const value = fold(option.value), hex = FEATURE_SWATCHES[value];
    if (hex && !colours.some(colour => colour.value === value)) colours.push({ group: fold(option.name), value, name: option.value, hex });
  }
  return { hero, lifestyle, categories, productIds: items.map(item => item.id), colours, city: city || '' };
}

/** The sections whose needs the store meets, in FEATURE_IDS order. */
export function eligibleFeatures(facts: FeatureFacts, fashion: boolean): FeatureId[] {
  const anyPhoto = facts.lifestyle.length > 0 || Boolean(facts.hero);
  const needs: Record<FeatureId, boolean> = {
    duo: facts.lifestyle.length >= 2,
    explore: facts.categories.length >= 2 && anyPhoto,
    capsule: facts.lifestyle.length >= 1 && facts.productIds.length >= 2,
    origin: anyPhoto,
    palette: fashion && facts.colours.length >= 6,
  };
  return FEATURE_IDS.filter(id => needs[id]);
}

/** Two rolled sections never sit next to each other: these share or touch a slot (story → business sections → values). */
const NEIGHBOURS = [['explore', 'capsule'], ['explore', 'origin'], ['capsule', 'origin']];
const FASHION_LEAD = ['duo', 'explore', 'palette'];
function rng(seed: string) {
  let counter = 0;
  return () => createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0) / 0x100000000;
}
const shuffle = <T>(next: () => number, list: T[]) => list.map(value => ({ value, key: next() })).sort((a, b) => a.key - b.key).map(entry => entry.value);

export function rollFeatures(input: { seed: string; eligible: readonly string[]; fashion: boolean; exclude: readonly string[] }): string[] {
  const next = rng(`${input.seed}#feature`);
  // The fill call's exclusions are honoured for at most half, like every other part.
  const honoured = input.eligible.filter(id => input.exclude.includes(`feature:${id}`)).slice(0, Math.floor(input.eligible.length / 2));
  const pool = input.eligible.filter(id => !honoured.includes(id));
  const count = Math.floor(next() * 3);
  const order = input.fashion
    ? [...shuffle(next, pool.filter(id => FASHION_LEAD.includes(id))), ...shuffle(next, pool.filter(id => !FASHION_LEAD.includes(id)))]
    : shuffle(next, pool);
  const chosen: string[] = [];
  for (const id of order) {
    if (chosen.length >= count) break;
    if (chosen.some(other => NEIGHBOURS.some(pair => pair.includes(id) && pair.includes(other)))) continue;
    chosen.push(id);
  }
  return chosen;
}

const categoryHref = (id: string | undefined) => id ? `productos.html?f_categoria=${encodeURIComponent(fold(id))}` : 'productos.html';

/** Each rolled section's data; photos are taken in section order, each once while the store has enough. */
export function buildFeatures(ids: readonly string[], facts: FeatureFacts, copy: Partial<FeatureCopy>, fallback: { productsTitle: string; storyTitle: string; subcopy: string }): Record<string, unknown> {
  const used = new Set<string>();
  const take = () => {
    const photo = facts.lifestyle.find(src => !used.has(src)) ?? facts.lifestyle[0] ?? facts.hero;
    if (photo) used.add(photo);
    return photo ?? '';
  };
  const out: Record<string, unknown> = {};
  for (const id of FEATURE_IDS.filter(feature => ids.includes(feature))) {
    if (id === 'duo') out.duo = { halves: [0, 1].map(index => {
      const category = facts.categories[index];
      return { photo: take(), title: clip(copy.duoTitles?.[index], FEATURE_COPY_CAPS.duoTitle) || category?.name || fallback.productsTitle,
        cta: clip(copy.duoCtas?.[index], FEATURE_COPY_CAPS.duoCta) || (index === 0 ? 'Ver ahora' : 'Ver colección'), href: categoryHref(category?.id) };
    }) };
    if (id === 'explore') out.explore = { photo: take(), categories: facts.categories, colours: facts.colours.slice(0, 6).map(({ value, name, hex }) => ({ value, name, hex })) };
    if (id === 'capsule') out.capsule = { photo: take(), text: clip(copy.capsuleText, FEATURE_COPY_CAPS.capsuleText) || fallback.subcopy || fallback.storyTitle, cta: 'Ver colección', products: facts.productIds.slice(0, 3) };
    if (id === 'origin') out.origin = { photo: take(), caption: clip(copy.originCaption, FEATURE_COPY_CAPS.originCaption) || (facts.city ? `Hecho en ${facts.city}` : fallback.storyTitle),
      link: clip(copy.originLink, FEATURE_COPY_CAPS.originLink) || 'Nuestra historia', href: '#historia' };
    if (id === 'palette') out.palette = { intro: clip(copy.paletteIntro, FEATURE_COPY_CAPS.paletteIntro) || 'Elige por color',
      colours: facts.colours.map(({ group, value, name, hex }) => ({ name, hex, href: `productos.html?f_${encodeURIComponent(group)}=${encodeURIComponent(value)}` })) };
  }
  return out;
}
