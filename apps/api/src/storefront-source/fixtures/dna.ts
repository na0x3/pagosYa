import type { SourceDesignDna } from '../source-dna';

export const validDna = (): SourceDesignDna => ({
  version: 1,
  type: { display: 'fraunces', text: 'instrument', case: 'small-caps', tracking: 'wide' },
  shape: { radius: 'pill', border: 'hairline', frame: 'arch' },
  buttons: { form: 'stamp', hover: 'tilt', press: 'squash' },
  motion: { personality: 'playful' },
  layout: { grammar: 'collage', density: 'airy' },
  surfaces: { cart: 'sheet', added: 'ribbon', product: 'story-led', review: 'ticket', card: 'second-photo' },
  productCard: { swatch: 'pill', gallery: 'rail', blocks: 'plain', divider: 'none', enter: 'none' },
  motifs: [{ for: 'product', target: 'Café de altura', meaning: 'El vapor de una taza recién servida', behavior: 'steam', trigger: 'add-to-cart', placement: 'cart' }],
  signature: 'Cada pedido se sella como un boleto de tren antiguo.',
  productCss: '',
});
