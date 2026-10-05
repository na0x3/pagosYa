import { sketchComponent } from '@pagosya/shared-types';
import { sketchUiImports } from './sketch-registry';
import { dnaRuntimeConfig } from '../source-dna';
import { designTokenCss } from '../design-engine/design-css';
import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { renderBlock, renderAccount, blockCss, ACCOUNT_CSS, SKETCH_BASE_CSS } from './sketch-blocks';
import { bestInkFor, mixHex, repairSketch } from './sketch-schema';
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

const NAV_LABEL: Partial<Record<string, string>> = { catalog: 'Productos', collections: 'Colecciones', story: 'Nosotros', gallery: 'Galería', faq: 'Preguntas', reviews: 'Reseñas' };

export function assembleSketch(input: StoreSketch, ctx: SketchContext): SourceProjectFileDto[] {
  // Re-repair on entry: assembly stays total even if a caller skips repair, and repair is idempotent.
  const sketch = repairSketch(input, ctx).sketch;
  const usesUi = sketch.blocks.some(b => sketchComponent(b.type, b.composition)?.renderer !== 'legacy' && !!b.composition);
  const uiTokens = { paper: sketch.palette.paper, ink: sketch.palette.ink, accent: sketch.palette.accent, onAccent: bestInkFor(sketch.palette.accent, sketch.palette.paper), displayFont: `var(--skb-display-font)`, bodyFont: `var(--skb-text-font)`, radius: sketch.style.radius === 'square' ? 0 : 8, space: sketch.dna?.layout.density === 'airy' ? 1.2 : sketch.dna?.layout.density === 'dense' ? .85 : 1 };
  const body = sketch.blocks.filter(block => block.type !== 'footer');
  const footer = sketch.blocks.filter(block => block.type === 'footer');
  // Exactly one h1 per page: the first block that carries a primary heading renders it as the h1.
  const headingIndex = body.findIndex(block => block.type !== 'marquee' && block.type !== 'announce');

  const seen = new Set<string>();
  const navLinks = sketch.blocks.flatMap(block => {
    const label = NAV_LABEL[block.type];
    if (!label || seen.has(block.type)) return [];
    seen.add(block.type);
    return [`<a href=${expr(`index.html#skb-${block.id}`)}>${expr(label)}</a>`];
  }).join('');
  const logo = sketch.design?.assetAssignments.find(a => a.role === 'logo');
  const siteAttrs = (Object.keys(sketch.style) as (keyof typeof sketch.style)[]).map(key => `data-skb-${key}=${expr(sketch.style[key])}`).join(' ') + (sketch.design ? ` data-yapi-design="1" data-yapi-nav=${expr(sketch.design.globalSections.navigation)} data-yapi-motion=${expr(sketch.design.artDirection.motionLevel)}` : '');
  const shell = `import type { ReactNode } from 'react';
${usesUi ? "import { StoreStyles } from '@pagosya/ui';" : ''}

export function Header() {
  return <header className="skb-header">
    <a className="skb-logo" href="index.html">${logo ? `<img src=${expr(logo.assetId)} alt=${expr(ctx.storeName)} />` : expr(ctx.storeName)}</a>
    ${navLinks ? `<nav className="skb-nav" aria-label="Principal">${navLinks}</nav>${sketch.design ? `<details className="skb-menu"><summary>Menú</summary><nav aria-label="Menú móvil">${navLinks}</nav></details>` : ''}` : ''}
    ${ctx.purpose === 'shop' ? '<div className="skb-header__actions"><a className="skb-account" data-pagosya-account="" href="acceso-ingresar.html">Mi cuenta</a><button type="button" className="skb-cart" data-cart-open>Mi pedido <span className="skb-cart__count" data-cart-count>0</span></button></div>' : ''}
  </header>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="skb-site${usesUi ? ' ui-root' : ''}" ${siteAttrs}${sketch.dna ? Object.entries(dnaRuntimeConfig(sketch.dna)).filter(([key]) => key !== 'version' && key !== 'productCss').map(([key, value]) => ` data-dna-${key}=${expr(String(value))}`).join('') : ''}>
    ${usesUi ? `<StoreStyles tokens={${JSON.stringify(uiTokens)}} />` : ''}
    ${sketch.design ? '<a className="skb-skip" href="#contenido">Saltar al contenido</a>' : ''}
    <Header />
    {children}
    <div data-pagosya-cart hidden />
    ${ctx.purpose === 'service' ? '<div data-pagosya-contact hidden />' : ''}
    <p data-pagosya-status role="status" aria-live="polite" className="skb-status" />
  </div>;
}
`;

  const home = `import Shell from './Shell';
${usesUi ? `import { ${sketchUiImports} } from '@pagosya/ui';` : ''}

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
      <article className="skb-pdp" data-layout="${sketch.product.layout}" data-media="${sketch.product.media}">
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
  return <div className="skb-site" ${siteAttrs}>
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
  --skb-accent: ${sketch.palette.accent};
  --skb-accent-ink: ${bestInkFor(sketch.palette.accent, sketch.palette.ink)};
  --skb-deep: ${sketch.palette.deep};
  --skb-pop: ${sketch.palette.pop};
  --skb-pop-ink: ${bestInkFor(sketch.palette.pop, sketch.palette.ink)};
  --skb-tint-1: ${mixHex(sketch.palette.accent, sketch.palette.paper, 0.16)};
  --skb-tint-2: ${mixHex(sketch.palette.deep, sketch.palette.paper, 0.16)};
  --skb-tint-3: ${mixHex(sketch.palette.pop, sketch.palette.paper, 0.16)};
  /* The platform kit (buy button, cart, checkout, ficha) reads --store-* tokens; without these every
   * sketch-born store got the same near-black defaults no matter its palette or Botones choice. */
  --store-background: ${sketch.palette.paper};
  --store-foreground: ${sketch.palette.ink};
  --store-accent: ${sketch.palette.accent};
  --store-accent-foreground: ${bestInkFor(sketch.palette.accent, sketch.palette.ink)};
  --store-radius: ${sketch.style.buttons === 'pill' ? '999px' : '6px'};
  --store-heading-font: ${JSON.stringify(fontFamily(sketch.fonts.display))}, serif;
  --store-body-font: ${JSON.stringify(fontFamily(sketch.fonts.text))}, sans-serif;
}
body { margin: 0; background: var(--skb-paper); color: var(--skb-page-ink); font-family: var(--skb-text-font); }
.skb-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem clamp(1rem, 5vw, 4rem); background: var(--skb-paper); }
.skb-logo { font-family: var(--skb-display-font); font-size: 1.4rem; color: inherit; text-decoration: none; font-weight: 700; }
.skb-nav { display: flex; gap: 1.1rem; flex-wrap: wrap; }
.skb-nav a { color: inherit; text-decoration: none; font-size: 0.95rem; }
.skb-cart { border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 999px; padding: 0.5em 1.1em; font: inherit; cursor: pointer; }
.skb-header__actions { display: flex; align-items: center; gap: 1rem; }
.skb-account { color: inherit; text-decoration: none; font-size: 0.92rem; }
.skb-account:hover { text-decoration: underline; text-underline-offset: 3px; }
.skb-status { padding: 0 clamp(1rem, 5vw, 4rem); min-height: 1.2em; }
.skb-page { padding: clamp(1rem, 4vw, 2.5rem) clamp(1rem, 5vw, 4rem); }
.skb-pdp { display: grid; gap: 1.5rem; padding: clamp(1rem, 4vw, 2.5rem) clamp(1rem, 5vw, 4rem); }
.skb-pdp__crumbs { font-size: 0.9rem; opacity: 0.75; }
.skb-pdp__grid { display: grid; gap: 2rem; align-items: start; }
@media (min-width: 900px) {
  .skb-pdp__grid { grid-template-columns: 1.1fr 1fr; }
  /* The sketch's product composition (sketch.product): photo side and page structure. */
  .skb-pdp[data-media="right"] .skb-pdp__grid > .skb-pdp__gallery { order: 2; }
  .skb-pdp[data-media="right"] .skb-pdp__grid > .skb-pdp__info { order: 1; }
  .skb-pdp[data-layout="image-led"] .skb-pdp__grid { grid-template-columns: 1.55fr 1fr; }
  .skb-pdp[data-layout="dense"] .skb-pdp__grid { grid-template-columns: 1fr 1fr; }
  .skb-pdp[data-layout="story-led"] .skb-pdp__grid { grid-template-columns: minmax(0, 1fr); }
  .skb-pdp[data-layout="story-led"] .skb-pdp__grid > .skb-pdp__gallery { order: 0; max-width: 860px; margin: 0 auto; width: 100%; }
  .skb-pdp[data-layout="story-led"] .skb-pdp__grid > .skb-pdp__info { max-width: 680px; margin: 0 auto; width: 100%; }
}
.skb-pdp__gallery img { width: 100%; height: auto; border-radius: 1rem; display: block; }
.skb-pdp__info { display: grid; gap: 0.9rem; }
.skb-pdp__cat { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem; opacity: 0.7; }
.skb-pdp__title { font-family: var(--skb-display-font); font-size: clamp(1.8rem, 4vw, 2.8rem); line-height: 1.05; margin: 0; }
.skb-pdp__price { font-size: 1.4rem; font-weight: 700; }
.skb-pdp__desc { line-height: 1.6; max-width: 62ch; }
${SKETCH_BASE_CSS}${[...new Set(sketch.blocks.map(block => block.type))].map(blockCss).join('\n')}${ctx.purpose === 'shop' ? ACCOUNT_CSS : ''}
${designTokenCss(sketch)}
`;

  const accountPage = (view: 'login' | 'register', component: string) => `// @pagosya-page
import Shell from '../Shell';
import { AccountGatePage } from '@pagosya/ui';

export default function ${component}() {
  return <Shell>
    ${renderAccount(sketch, ctx, view)}
  </Shell>;
}
`;

  return [
    ...(sketch.design ? [{ path: 'website-design.json', content: JSON.stringify(sketch.design, null, 2) + '\n' }] : []),
    { path: 'components/Shell.tsx', content: shell },
    { path: 'components/home.tsx', content: home },
    { path: 'components/product.tsx', content: product },
    { path: 'components/checkout.tsx', content: checkout },
    { path: 'styles/globals.css', content: css },
    // Designed shopper access pages; the remaining account pages stay the platform defaults added on save.
    ...(ctx.purpose === 'shop' ? ([['login', 'Login'], ['register', 'Register']] as const).map(([view, component]) => ({ path: `components/auth/${view}.tsx`, content: accountPage(view, component) })) : []),
  ];
}
