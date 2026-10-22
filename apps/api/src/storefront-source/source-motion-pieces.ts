import type { SourceMotionMode } from './source-motion';

/** Owner 2026-10-22: the hand-built goodProtein had floating packs, rising bubbles, a spinning sticker and a breathing glow;
 *  YAPI's own build had none because it had no tested pieces to use. The kit ships them (look/motion-pieces.js). */
export const asksForEnergy = (text: string): boolean =>
  /(?<!\p{L})(energ[ií]a|en[eé]rgic\p{L}*|animad\p{L}*|movimiento|din[aá]mic\p{L}*|divertid\p{L}*|vibrante|llamativ\p{L}*|deport\p{L}*|fitness)(?!\p{L})/iu.test(text);

const PIECES = [
  ['float', 'a product photo or pack drifts up and down (5 s)'], ['bob', 'a quicker float for small badges or icons (3 s)'],
  ['spin', 'a round sticker or seal turns slowly (14 s)'], ['breathe', 'a soft glow or halo behind a photo grows and fades (4.5 s)'],
  ['bubbles', 'an empty container fills with rising bubbles behind content (fresh, drinkable, light products)'],
  ['marquee', 'one oversized word line slides across a band behind the content (write its text twice inside)'],
  ['pop', 'stat tiles or chips pop in once; stagger them with data-pya-motion-delay="0|120|240"'], ['zoom', 'a full-bleed background photo slowly zooms (22 s)'],
] as const;

export function motionPiecesDirection(input: { energy: 'high' | 'calm'; motion: SourceMotionMode }): string {
  if (input.motion === 'off') return '';
  const list = PIECES.map(([id, use]) => `data-pya-motion="${id}": ${use}`).join('; ');
  const amount = input.energy === 'high'
    ? 'This merchant asked for energy and movement: use at least three different pieces across the home, at most one per element, and give each spotlight section its own piece.'
    : 'This business is calm: use only breathe, zoom and pop, and at most two pieces on the whole home.';
  return [
    `MOTION PIECES: The platform animates these attributes for you (reduced motion and off-screen pausing included); write no @keyframes for them. ${list}. Optional data-pya-motion-speed="slow|fast". `
      + `Put them on photos, badges, stickers and decoration only, never on body text, navigation, cart, product selectors or checkout. ${amount}`,
    'SPOTLIGHT SECTIONS: When the merchant asks to explain several brands, products or services, give each one its own full-width section with a different layout, never the same layout twice in a row, '
      + 'each with its photo, its name, one lead line, two sentences on what it does and a link to its product. Layouts to choose from: photo-led split (photo left or right), full-bleed photo with a dark veil and the copy on it, '
      + 'a giant outlined word behind the photo with a round spinning sticker, an arch-framed photo beside popping stat tiles, two overlapping photos over rising bubbles, a tall arched photo over a sliding oversized word, '
      + 'a tilted polaroid with a stamped badge, a photo inside a breathing glow on a deep background. Colour each spotlight from its own photo, within STORE COLOURS.',
  ].join('\n');
}

export function motionPieceCount(html: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of html.matchAll(/data-pya-motion="([a-z]+)"/g)) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  return counts;
}
