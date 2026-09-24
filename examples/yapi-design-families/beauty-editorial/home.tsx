import { Hero, Catalog, Section, BeforeAfter, Display, Eyebrow, Text, Button, Gallery } from '@pagosya/ui';

export const design = {
  id: 'beauty-editorial', name: 'Bruma', tagline: 'El cuidado, con calma.', header: 'split', footer: 'paper', productPageStyle: 'image-led',
  tokens: { paper: '#f6f2f8', ink: '#34233c', accent: '#634174', onAccent: '#fff', surface: '#e9e0ed', displayFont: "'Instrument Serif', Georgia, serif", bodyFont: 'Instrument, sans-serif', displayWeight: 400, radius: 0, cardAspect: '4/5', displayRatio: 3.4 },
  items: [
    { id: 'crema', name: 'Crema Bruma', description: 'Tu momento de cuidado diario. Revisa los detalles del producto antes de elegir.', amount: 6800, currency: 'BOB', imageUrls: ['assets/crema.webp', 'assets/scene-crema.webp'], stock: null },
    { id: 'jabon', name: 'Jabón Bruma', description: 'Una pieza sencilla para acompañar tu rutina.', amount: 2800, currency: 'BOB', imageUrls: ['assets/jabon.webp', 'assets/scene-jabon.webp'], stock: null },
  ],
};
export default function Home() {
  return <main id="contenido">
    <Hero entrance variant="editorial" eyebrow="Un ritual cotidiano" title={<>Un poco<br /><em>más tuyo.</em></>} lead="Haz espacio para lo simple. El cuidado también empieza por el tiempo que te dedicas." image={{ src: 'assets/scene-crema.webp', alt: 'Crema Bruma sobre una superficie de piedra, junto a hojas y lino' }} actions={<Button href="#productos" variant="outline">Descubre Bruma</Button>} />
    <Catalog title="Menos pasos. Más pausa." eyebrow="Lo esencial" columns={2} layout="editorial" card="caption" fx="reveal" />
    <Section id="historia" tone="surface" space="lg"><div className="family-note">
      <div><Eyebrow>Una pieza, dos miradas</Eyebrow><Display as="h2">Conoce cada detalle.</Display><div className="family-line" /><Text>Del estudio a tu espacio. Mira el mismo producto en dos escenarios y encuentra lo que hace tuya una rutina.</Text></div>
      <div className="family-compare"><BeforeAfter label="Crema Bruma en estudio y en ambiente" before={{ src: 'assets/crema.webp', alt: 'Crema Bruma en fotografía de estudio' }} after={{ src: 'assets/scene-crema.webp', alt: 'La misma crema Bruma en un ambiente con lino y hojas' }} beforeLabel="Estudio" afterLabel="Ambiente" aspect="1/1" /></div>
    </div></Section>
    <Section><Gallery images={[{ src: 'assets/scene-jabon.webp', alt: 'Jabón Bruma en una composición de cuidado' }, { src: 'assets/scene-crema.webp', alt: 'El ritual de cuidado Bruma' }]} variant="grid" /></Section>
  </main>;
}
