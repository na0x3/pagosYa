import type { SourceProjectFileDto } from '../dto/save-source-project.dto';

/** A storefront composed only from @pagosya/ui sections, tokens and effects. */
export function uiStoreFiles(): SourceProjectFileDto[] {
  const shell = `import { StoreTheme, SiteHeader, SiteFooter, CommerceSlots, AnnouncementBar, type StoreTokens } from '@pagosya/ui';
import type { ReactNode } from 'react';
export const tokens: StoreTokens = { paper: '#f4efe6', ink: '#221c16', accent: '#a4532b', displayFont: "'Fraunces', Georgia, serif", bodyFont: "'Instrument Sans', system-ui, sans-serif", radius: 4, displayRatio: 3, cardAspect: '4/5' };
export default function Shell({ children }: { children: ReactNode }) {
  return <StoreTheme tokens={tokens}>
    <AnnouncementBar>Envíos en La Paz y El Alto · Factura electrónica</AnnouncementBar>
    <SiteHeader name="Pliegue" tagline="Textiles de altura" variant="centered" links={[{ label: 'Tienda', href: 'index.html#productos' }, { label: 'Historia', href: 'index.html#historia' }, { label: 'Preguntas', href: 'index.html#preguntas' }]} />
    {children}
    <SiteFooter name="Pliegue" blurb="Alpaca tejida a mano en El Alto." columns={[{ title: 'Tienda', links: [{ label: 'Productos', href: 'index.html#productos' }] }]} />
    <CommerceSlots />
  </StoreTheme>;
}`;
  return [
    { path: 'components/Shell.tsx', content: shell },
    { path: 'components/home.tsx', content: `import Shell from './Shell';
import { Hero, ProductShowcase, Catalog, Section, Statement, FeatureSplit, Faq, Marquee, Button, TrustStrip } from '@pagosya/ui';
export default function Home() {
  return <Shell><main id="contenido">
    <Hero variant="editorial" eyebrow="Colección de invierno" title="Abrigo que se hereda" lead="Cojines y mantas de alpaca, tejidos en telar." image={{ src: '/assets/sample.png', alt: 'Manta de alpaca' }} actions={<><Button href="#productos">Ver la colección</Button><Button href="#historia" variant="link">Nuestra historia</Button></>} />
    <Marquee items={['Alpaca real', 'Tejido a mano', 'Hecho en El Alto']} />
    <ProductShowcase image={{ src: '/assets/sample.png', alt: 'Cojín Pliegue' }} eyebrow="La pieza" title="Cojín Pliegue" body="Relleno de pluma y funda de alpaca." action={<Button href="#productos">Comprar</Button>} />
    <Catalog title="La colección" eyebrow="Tienda" layout="editorial" card="caption" fx="grow zoom" />
    <Section id="historia" tone="surface" reveal><FeatureSplit image={{ src: '/assets/sample.png', alt: 'Telar' }} title="Del telar a tu casa" grow><Statement>Cada pieza pasa por las manos de una sola tejedora.</Statement></FeatureSplit></Section>
    <Section><TrustStrip points={[{ title: 'Pago con QR', detail: 'Banco Económico y tarjetas' }]} /></Section>
    <Section id="preguntas" width="narrow"><Faq items={[{ question: '¿Hacen envíos?', answer: 'Sí, en La Paz y El Alto.' }]} /></Section>
  </main></Shell>;
}` },
    { path: 'components/product.tsx', content: `import Shell from './Shell'; import { ProductDetail } from '@pagosya/ui';
export default function Product() { return <Shell><ProductDetail /></Shell>; }` },
    { path: 'components/checkout.tsx', content: `import { StoreTheme, CheckoutDetail } from '@pagosya/ui'; import { tokens } from './Shell';
export default function Checkout() { return <StoreTheme tokens={tokens}><CheckoutDetail /><p data-pagosya-status role="status" /></StoreTheme>; }` },
    { path: 'styles/globals.css', content: "@font-face{font-family:'Fraunces';src:url(assets/fraunces.ttf);font-display:swap}@font-face{font-family:'Instrument Sans';src:url(assets/instrument.ttf);font-display:swap}" },
  ];
}
