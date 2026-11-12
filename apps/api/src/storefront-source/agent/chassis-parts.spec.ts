import { templateSourceFiles } from '@pagosya/store-templates';
import { partProblems, partsInShell, shellWithStoreParts } from './chassis-parts';

// Store chassis (spec 2026-11-12): the platform points the kit Shell at the parts the store wrote, and checks their wiring.
const kitShell = templateSourceFiles('esencial').find(file => file.path === 'components/Shell.tsx')!.content;

describe('shellWithStoreParts', () => {
  it('swaps each part the store wrote, with its import above the first one, and reads them back', () => {
    const shell = shellWithStoreParts(kitShell, new Set(['header', 'cart', 'card', 'footer']))!;
    expect(shell.split('\n').slice(0, 4)).toEqual(["import StoreFooter from './footer';", "import StoreHeader from './header';", "import StoreCart from './cart';", "import StoreCard from './card';"]);
    for (const tag of ['<StoreHeader />', '<StoreCart />', '<StoreCard />', '<StoreFooter />']) expect(shell).toContain(tag);
    expect(shell).not.toMatch(/<Header \/>|<CartParts \/>|<Footer \/>|<CardTemplate card=/);
    expect(partsInShell(shell)).toEqual(new Set(['footer', 'header', 'cart', 'card']));
    expect(shellWithStoreParts(kitShell, new Set())).toBe(kitShell);
  });
  it('refuses a Shell that does not draw the part (an older store)', () => {
    expect(shellWithStoreParts('export default function Shell() { return <div><Header /></div>; }', new Set(['cart']))).toBeNull();
  });
});

describe('partProblems', () => {
  it('names the wiring each part misses', () => {
    expect(partProblems('header', 'export default function StoreHeader() { return <header />; }').join(' | ')).toMatch(/index\.html.*productos\.html.*buscar\.html.*data-pagosya-account.*data-cart-open/);
    expect(partProblems('card', 'export default function StoreCard() { return <template data-pagosya-product-template><a data-product-link /><img data-product-field="image" /><b data-product-field="name" /><i data-product-field="price" /><button data-product-add /></template>; }')).toEqual([]);
    expect(partProblems('cart', 'export default function StoreCart() { return <CartTemplate><KitSlot kind="cart" name="lines" /></CartTemplate>; }').join(' | '))
      .toMatch(/CartLineTemplate.*data-cart-close.*name="empty".*kind="line" name="photo"/);
    expect(partProblems('product', 'export default function Product() { return <Shell><ProductPageTemplate><KitSlot kind="product" name="gallery" /></ProductPageTemplate></Shell>; }').join(' | '))
      .toMatch(/name="title".*data-pagosya-product-page.*productLayout/);
  });
  it('the kit\'s own parts have all their wiring', () => {
    const product = templateSourceFiles('esencial').find(file => file.path === 'components/product.tsx')!.content;
    expect(partProblems('product', product)).toEqual([]);
    const cartParts = /export function CartParts\(\)[\s\S]*?\n\}\n/.exec(kitShell)![0].replace('export function CartParts()', 'export default function StoreCart()');
    expect(partProblems('cart', cartParts)).toEqual([]);
  });
});
