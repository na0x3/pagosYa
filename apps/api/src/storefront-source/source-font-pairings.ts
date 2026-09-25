/** Identity libraries (T2b): curated display + text pairings of the bundled fonts (source-font-catalog.ts), tagged with
 * personalities. Themes (T3) list the pairing ids they allow; the identity engine (T4) picks within them, weighted away
 * from pairings recent stores used (the id is the type part of dnaFingerprint). Data only: nothing here chooses. */
import type { SourceFontId } from './source-font-catalog';

export const SOURCE_FONT_PERSONALITIES = ['pop', 'editorial', 'luxury', 'handmade', 'tech', 'warm', 'playful', 'classic'] as const;
export type SourceFontPersonality = typeof SOURCE_FONT_PERSONALITIES[number];
export type SourceFontPairing = { id: string; display: SourceFontId; text: SourceFontId; personalities: readonly SourceFontPersonality[] };

const pair = (display: SourceFontId, text: SourceFontId, personalities: SourceFontPersonality[]): SourceFontPairing => ({ id: `${display}+${text}`, display, text, personalities });

export const SOURCE_FONT_PAIRINGS: readonly SourceFontPairing[] = [
  pair('shrikhand', 'nunito', ['pop', 'playful', 'warm']),
  pair('anton', 'figtree', ['pop', 'playful']),
  pair('bodoni-moda', 'libre-caslon-text', ['luxury', 'classic', 'editorial']),
  pair('dm-serif-display', 'manrope', ['luxury', 'editorial']),
  pair('playfair-display', 'lora', ['editorial', 'classic']),
  pair('fraunces', 'instrument', ['warm', 'editorial']),
  pair('young-serif', 'figtree', ['warm', 'handmade']),
  pair('instrument-serif', 'newsreader', ['editorial', 'luxury']),
  pair('unbounded', 'sora', ['tech', 'pop']),
  pair('space-grotesk', 'space-mono', ['tech']),
  pair('syne', 'manrope', ['pop', 'tech']),
  pair('big-shoulders-display', 'chivo', ['pop', 'tech']),
  pair('bebas-neue', 'rubik', ['pop', 'playful']),
  pair('oswald', 'lora', ['classic', 'editorial']),
  pair('bricolage', 'figtree', ['handmade', 'playful', 'warm']),
  pair('epilogue', 'newsreader', ['editorial']),
  pair('outfit', 'nunito', ['playful', 'warm']),
  pair('bitter', 'figtree', ['handmade', 'warm', 'classic']),
  pair('rubik', 'nunito', ['playful', 'warm']),
  pair('chivo', 'libre-caslon-text', ['classic', 'editorial']),
  pair('familjen-grotesk', 'lora', ['handmade', 'editorial']),
  pair('sora', 'manrope', ['tech']),
  pair('fraunces', 'nunito', ['handmade', 'warm', 'playful']),
  pair('dm-serif-display', 'figtree', ['luxury', 'warm']),
];

export const sourceFontPairing = (id: string) => SOURCE_FONT_PAIRINGS.find(pairing => pairing.id === id);
export const sourceFontPairingsFor = (personality: SourceFontPersonality) => SOURCE_FONT_PAIRINGS.filter(pairing => pairing.personalities.includes(personality));
