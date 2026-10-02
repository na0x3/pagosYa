import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { renderBlock, blockCss, SKETCH_BASE_CSS } from './sketch-blocks';
import { repairSketch } from './sketch-schema';
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

const NAV_LABEL: Partial<Record<string, string>> = { catalog: 'Productos', story: 'Nosotros', gallery: 'Galería', faq: 'Preguntas', reviews: 'Reseñas' };

export function assembleSketch(input: StoreSketch, ctx: SketchContext): SourceProjectFileDto[] {
  // Re-repair on entry: assembly stays total even if a caller skips repair, and repair is idempotent.
  const sketch = repairSketch(input, ctx).sketch;
  const body = sketch.blocks.filter(block => block.type !== 'footer');
  const footer = sketch.blocks.filter(block => block.type === 'footer');
  // Exactly one h1 per page: the first block that carries a primary heading renders it as the h1.
  const headingIndex = body.findIndex(block => block.type !== 'marquee');

  const seen = new Set<string>();
  const navLinks = sketch.blocks.flatMap(block => {
    const label = NAV_LABEL[block.type];
    if (!label || seen.has(block.type)) return [];
    seen.add(block.type);
    return [`<a href=${expr(`index.html#skb-${block.id}`)}>${expr(label)}</a>`];
  }).join('');
  const shell = `import type { ReactNode } from 'react';

export function Header() {
  return <header className="skb-header">
    <a className="skb-logo" href="index.html">${expr(ctx.storeName)}</a>
    ${navLinks ? `<nav className="skb-nav" aria-label="Principal">${navLinks}</nav>` : ''}
    ${ctx.purpose === 'shop' ? '<button type="button" className="skb-cart" data-cart-open>Mi pedido <span className="skb-cart__count" data-cart-count>0</span></button>' : ''}
  </header>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="skb-site">
    <Header />
    {children}
    <div data-pagosya-cart hidden />
    ${ctx.purpose === 'service' ? '<div data-pagosya-contact hidden />' : ''}
    <p data-pagosya-status role="status" aria-live="polite" className="skb-status" />
  </div>;
}
`;

  const home = `import Shell from './Shell';

export default function Home() {
  return <Shell>
    <main id="contenido">
${body.map((block, index) => '      ' + renderBlock(block, sketch, ctx, { h1: index === headingIndex }).split('\n').join('\n      ')).join('\n')}
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
.skb-nav { display: flex; gap: 1.1rem; flex-wrap: wrap; }
.skb-nav a { color: inherit; text-decoration: none; font-size: 0.95rem; }
.skb-cart { border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 999px; padding: 0.5em 1.1em; font: inherit; cursor: pointer; }
.skb-status { padding: 0 clamp(1rem, 5vw, 4rem); min-height: 1.2em; }
.skb-page { padding: clamp(1rem, 4vw, 2.5rem) clamp(1rem, 5vw, 4rem); }
.skb-pdp { display: grid; gap: 1.5rem; padding: clamp(1rem, 4vw, 2.5rem) clamp(1rem, 5vw, 4rem); }
.skb-pdp__crumbs { font-size: 0.9rem; opacity: 0.75; }
.skb-pdp__grid { display: grid; gap: 2rem; align-items: start; }
@media (min-width: 900px) { .skb-pdp__grid { grid-template-columns: 1.1fr 1fr; } }
.skb-pdp__gallery img { width: 100%; height: auto; border-radius: 1rem; display: block; }
.skb-pdp__info { display: grid; gap: 0.9rem; }
.skb-pdp__cat { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem; opacity: 0.7; }
.skb-pdp__title { font-family: var(--skb-display-font); font-size: clamp(1.8rem, 4vw, 2.8rem); line-height: 1.05; margin: 0; }
.skb-pdp__price { font-size: 1.4rem; font-weight: 700; }
.skb-pdp__desc { line-height: 1.6; max-width: 62ch; }
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
