import { ScrollScrubHero, ProductShowcase, Catalog, Section, FeatureSplit, Text, Button } from '@pagosya/ui';

export const design = {
  id: 'product-cinematic', name: 'Pliegue', tagline: 'Objetos para habitar.', header: 'classic', footer: 'ink', productPageStyle: 'story-led',
  tokens: { paper: '#f7f7f4', ink: '#242924', accent: '#3b4a3f', onAccent: '#fff', surface: '#e7e9e2', displayFont: "'Instrument Serif', Georgia, serif", bodyFont: 'Instrument, sans-serif', displayWeight: 400, radius: 2, cardAspect: '1/1', displayRatio: 3.4 },
  items: [
    { id: 'manta', name: 'Manta Pliegue', description: 'Una textura suave y un tono claro para vestir tu rincón favorito.', amount: 28000, currency: 'BOB', imageUrls: ['assets/manta.webp', 'assets/scene-manta.webp'], stock: null },
    { id: 'cojin', name: 'Cojín Pliegue', description: 'Una pieza de acento para acompañar tus espacios cotidianos.', amount: 14000, currency: 'BOB', imageUrls: ['assets/cojin.webp', 'assets/scene-cojin.webp'], stock: null },
  ],
};
export default function Home() {
  return <main id="contenido">
    <ScrollScrubHero poster={{ src: 'assets/scene-manta.webp', alt: 'Manta de textura natural sobre un sillón claro', position: '50% 58%' }} eyebrow="El espacio que eliges" title={<>La forma<br />de estar en casa.</>} lead="Texturas que invitan a bajar el ritmo. Piezas que hacen lugar a lo cotidiano." actions={<Button href="#productos">Explora la colección</Button>} />
    <Catalog title="Dos piezas. Tu espacio." eyebrow="Colección Pliegue" layout="editorial" columns={2} card="minimal" fx="none" />
    <ProductShowcase image={{ src: 'assets/scene-cojin.webp', alt: 'Cojín Pliegue presentado en un interior' }} eyebrow="De cerca" title="La textura cambia todo." body="Acércate a los detalles que dan carácter a una habitación." from={0.72} to={1.04} action={<Button href="product.html?id=cojin" variant="outline">Ver el cojín</Button>} />
    <Section id="historia" tone="surface" space="lg"><FeatureSplit image={{ src: 'assets/scene-manta.webp', alt: 'Detalle del tejido y los flecos de la manta' }} eyebrow="Nuestra mirada" title="Habitar también es sentir." reverse><Text>El tacto de una manta. La forma de un cojín. Pequeñas decisiones que hacen que un espacio se sienta propio.</Text><Button href="#productos" variant="link">Vuelve a la colección</Button></FeatureSplit></Section>
  </main>;
}
