/** The self-hosted OFL fonts in packages/storefront-kit/kit/fonts: the one list the prompt prose, the bundler
 * (withSourceFonts) and the DNA FontId enum are generated from. Each entry ships <id>.ttf and <id>-OFL.txt;
 * provenance.json records where each file came from. A store bundles only the fonts its CSS references.
 * No imports: source-dna.ts reads this module and must stay free of evaluation-time cycles. */
export type SourceFontRole = 'display' | 'text' | 'both';
type Entry = { id: string; family: string; role: SourceFontRole; personality: readonly string[]; weights: string };

const FONTS = [
  // The original five keep their ids and files: saved stores reference assets/<id>.ttf.
  { id: 'bricolage', family: 'Bricolage Grotesque', role: 'both', personality: ['grotesk', 'expressive', 'compact'], weights: '200–800' },
  { id: 'fraunces', family: 'Fraunces', role: 'both', personality: ['serif', 'soft', 'characterful'], weights: '100–900' },
  { id: 'instrument', family: 'Instrument Sans', role: 'text', personality: ['grotesk', 'clear', 'contemporary'], weights: '400–700' },
  { id: 'instrument-serif', family: 'Instrument Serif', role: 'display', personality: ['serif', 'heritage', 'condensed'], weights: '400' },
  { id: 'oswald', family: 'Oswald', role: 'display', personality: ['condensed', 'grotesk', 'poster'], weights: '200–700' },
  { id: 'syne', family: 'Syne', role: 'display', personality: ['wide', 'expressive', 'art-school'], weights: '400–800' },
  { id: 'unbounded', family: 'Unbounded', role: 'display', personality: ['wide', 'geometric', 'rounded', 'techno'], weights: '200–900' },
  { id: 'space-grotesk', family: 'Space Grotesk', role: 'both', personality: ['grotesk', 'quirky', 'technical'], weights: '300–700' },
  { id: 'dm-serif-display', family: 'DM Serif Display', role: 'display', personality: ['serif', 'high-contrast', 'fashion'], weights: '400' },
  { id: 'playfair-display', family: 'Playfair Display', role: 'display', personality: ['serif', 'high-contrast', 'editorial'], weights: '400–900' },
  { id: 'epilogue', family: 'Epilogue', role: 'both', personality: ['grotesk', 'neutral', 'wide-range'], weights: '100–900' },
  { id: 'sora', family: 'Sora', role: 'both', personality: ['geometric', 'clean', 'digital'], weights: '100–800' },
  { id: 'manrope', family: 'Manrope', role: 'text', personality: ['geometric', 'grotesk', 'modern'], weights: '200–800' },
  { id: 'newsreader', family: 'Newsreader', role: 'text', personality: ['serif', 'editorial', 'reading'], weights: '200–800' },
  { id: 'young-serif', family: 'Young Serif', role: 'display', personality: ['serif', 'warm', 'old-style'], weights: '400' },
  { id: 'rubik', family: 'Rubik', role: 'both', personality: ['rounded', 'friendly', 'sturdy'], weights: '300–900' },
  { id: 'space-mono', family: 'Space Mono', role: 'both', personality: ['mono', 'technical', 'retro'], weights: '400' },
  { id: 'big-shoulders-display', family: 'Big Shoulders Display', role: 'display', personality: ['condensed', 'industrial', 'poster'], weights: '100–900' },
  { id: 'bebas-neue', family: 'Bebas Neue', role: 'display', personality: ['condensed', 'all-caps', 'poster'], weights: '400' },
  { id: 'anton', family: 'Anton', role: 'display', personality: ['condensed', 'heavy', 'impact'], weights: '400' },
  { id: 'chivo', family: 'Chivo', role: 'both', personality: ['grotesk', 'sturdy', 'newsy'], weights: '100–900' },
  { id: 'lora', family: 'Lora', role: 'text', personality: ['serif', 'calligraphic', 'reading'], weights: '400–700' },
  { id: 'libre-caslon-text', family: 'Libre Caslon Text', role: 'text', personality: ['serif', 'classic', 'bookish'], weights: '400–700' },
  { id: 'outfit', family: 'Outfit', role: 'both', personality: ['geometric', 'minimal', 'round-dotted'], weights: '100–900' },
  { id: 'figtree', family: 'Figtree', role: 'text', personality: ['humanist', 'geometric', 'friendly'], weights: '300–900' },
  { id: 'familjen-grotesk', family: 'Familjen Grotesk', role: 'both', personality: ['grotesk', 'humanist', 'idiosyncratic'], weights: '400–700' },
  { id: 'bitter', family: 'Bitter', role: 'both', personality: ['slab', 'sturdy', 'reading'], weights: '100–900' },
  { id: 'nunito', family: 'Nunito', role: 'text', personality: ['rounded', 'humanist', 'soft'], weights: '200–1000' },
  { id: 'shrikhand', family: 'Shrikhand', role: 'display', personality: ['script-adjacent', 'retro', 'bold italic'], weights: '400' },
  { id: 'bodoni-moda', family: 'Bodoni Moda', role: 'display', personality: ['serif', 'didone', 'luxury'], weights: '400–900' },
] as const satisfies readonly Entry[];

export type SourceFontId = typeof FONTS[number]['id'];
export type SourceFont = Entry & { id: SourceFontId; file: string };
export const SOURCE_FONT_CATALOG: readonly SourceFont[] = FONTS.map(font => ({ ...font, file: `${font.id}.ttf` }));
export const SOURCE_FONT_IDS: readonly SourceFontId[] = FONTS.map(font => font.id);
