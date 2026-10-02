import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { renderBlock, blockCss, SKETCH_BASE_CSS } from './sketch-blocks';
import type { SketchContext, StoreSketch } from './sketch-schema';

/** sketch.json → real Next-source store files. Pure and deterministic: the same function renders the
 * live Boceto preview and the final build, so the built site cannot drift from the approved sketch. */
const expr = (value: string) => `{${JSON.stringify(value)}}`;
const fontFamily = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id)?.family ?? id;

const fontFace = (id: string) => `@font-face {
  font-family: ${JSON.stringify(fontFamily(id))};
  src: url("assets/${id}.ttf") format("truetype");
  font-weight: 100 900;
  font-display: swap;
}`;

export function assembleSketch(sketch: StoreSketch, ctx: SketchContext): SourceProjectFileDto[] {
  const body = sketch.blocks.filter(block => block.type !== 'footer');
  const footer = sketch.blocks.filter(block => block.type === 'footer');

  const shell = `import type { ReactNode } from 'react';

export function Header() {
  return <header className="skb-header">
    <a className="skb-logo" href="index.html">${expr(ctx.storeName)}</a>
    <button type="button" className="skb-cart" data-cart-open>Mi pedido <span className="skb-cart__count" data-cart-count>0</span></button>
  </header>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="skb-site">
    <Header />
    {children}
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="skb-status" />
  </div>;
}
`;

  const home = `import Shell from './Shell';

export default function Home() {
  return <Shell>
    <main id="contenido">
${body.map(block => '      ' + renderBlock(block, sketch, ctx).split('\n').join('\n      ')).join('\n')}
    </main>
${footer.map(block => '    ' + renderBlock(block, sketch, ctx).split('\n').join('\n    ')).join('\n')}
  </Shell>;
}
`;

  const product = `import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="skb-pdp">
        <KitSlot kind="product" name="breadcrumb" className="skb-pdp__crumbs" />
        <div className="skb-pdp__grid">
          <KitSlot kind="product" name="gallery" className="skb-pdp__gallery" />
          <div className="skb-pdp__info">
            <KitSlot kind="product" name="category" className="skb-pdp__cat" />
            <KitSlot kind="product" name="title" className="skb-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="skb-pdp__price" />
            <KitSlot kind="product" name="description" className="skb-pdp__desc" />
            <KitSlot kind="product" name="buy" className="skb-pdp__buy" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="skb-page" data-pagosya-product-page />
  </Shell>;
}
`;

  const checkout = `import { Header } from './Shell';

export default function Checkout() {
  return <div className="skb-site">
    <Header />
    <main id="contenido" className="skb-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="skb-status" />
  </div>;
}
`;

  const fontIds = [...new Set([sketch.fonts.display, sketch.fonts.text])];
  const css = `${fontIds.map(fontFace).join('\n')}

:root {
  --skb-display-font: ${JSON.stringify(fontFamily(sketch.fonts.display))}, serif;
  --skb-text-font: ${JSON.stringify(fontFamily(sketch.fonts.text))}, sans-serif;
  --skb-paper: ${sketch.palette.paper};
  --skb-page-ink: ${sketch.palette.ink};
}
body { margin: 0; background: var(--skb-paper); color: var(--skb-page-ink); font-family: var(--skb-text-font); }
.skb-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem clamp(1rem, 5vw, 4rem); background: var(--skb-paper); }
.skb-logo { font-family: var(--skb-display-font); font-size: 1.4rem; color: inherit; text-decoration: none; font-weight: 700; }
.skb-cart { border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 999px; padding: 0.5em 1.1em; font: inherit; cursor: pointer; }
.skb-status { padding: 0 clamp(1rem, 5vw, 4rem); min-height: 1.2em; }
.skb-page { padding: clamp(1rem, 4vw, 2.5rem) clamp(1rem, 5vw, 4rem); }
${SKETCH_BASE_CSS}${[...new Set(sketch.blocks.map(block => block.type))].map(blockCss).join('\n')}
`;

  return [
    { path: 'components/Shell.tsx', content: shell },
    { path: 'components/home.tsx', content: home },
    { path: 'components/product.tsx', content: product },
    { path: 'components/checkout.tsx', content: checkout },
    { path: 'styles/globals.css', content: css },
  ];
}
