import { FloatingMedia, Catalog, Section, FeatureSplit, Text, Button, TextFillStatement, ParallaxStack, Reveal } from '@pagosya/ui';

export const design = {
  id: 'cafe-expressive', name: 'Aroma', tagline: 'Una buena pausa.', header: 'classic', footer: 'ink', productPageStyle: 'dense',
  tokens: { paper: '#fff6e9', ink: '#302922', accent: '#ab3022', onAccent: '#fff6e9', surface: '#f4e6d3', displayFont: 'Bricolage, sans-serif', bodyFont: 'Instrument, sans-serif', displayWeight: 700, subheadStyle: 'normal', radius: 12, cardAspect: '4/5', displayRatio: 3.4 },
  items: [
    { id: 'desayuno', name: 'La primera pausa', description: 'Café con leche y croissant. Un desayuno sencillo para empezar despacio.', amount: 3800, currency: 'BOB', imageUrls: ['assets/breakfast.webp'], stock: null },
    { id: 'granola', name: 'Granola de la casa', description: 'Avena, frutos secos y un momento para ti.', amount: 3200, currency: 'BOB', imageUrls: ['assets/granola.webp'], stock: null },
    { id: 'jugo', name: 'Un toque cítrico', description: 'Naranja y jengibre en botella de vidrio.', amount: 1800, currency: 'BOB', imageUrls: ['assets/juice.webp'], stock: null },
  ],
};
export default function Home() {
  return <main id="contenido">
    <FloatingMedia entrance motion={false} eyebrow="Primero, una pausa" title={<>El día empieza<br />por algo rico.</>} lead="Una mesa, una buena taza y ese ratito que es solo tuyo." images={[{ src: 'assets/breakfast.webp', alt: 'Café con leche junto a un croissant' }, { src: 'assets/granola.webp', alt: 'Granola de la casa' }, { src: 'assets/juice.webp', alt: 'Botella de jugo de naranja' }]} actions={<Button href="#productos">Elige tu pausa ↗</Button>} />
    <Catalog title="A tu ritmo." eyebrow="La carta" columns={3} card="minimal" layout="grid" fx="zoom" />
    <Section id="historia" tone="surface" space="lg"><Reveal><FeatureSplit image={{ src: 'assets/breakfast.webp', alt: 'Café y croissant sobre una mesa de madera' }} eyebrow="La mirada de Aroma" title="Hay mañanas que piden quedarse."><Text>Creemos en las cosas sencillas: sentarse a la mesa, compartir un desayuno y dejar que la conversación dure un poco más.</Text><Button href="#productos" variant="link">Encuentra tu favorito</Button></FeatureSplit></Reveal></Section>
    <Section space="lg"><ParallaxStack images={[{ src: 'assets/breakfast.webp', alt: 'Una pausa de café sobre una mesa de madera' }, { src: 'assets/granola.webp', alt: 'Granola servida para el desayuno' }, { src: 'assets/juice.webp', alt: 'Jugo de naranja en botella de vidrio' }]} /></Section>
    <Section space="lg"><TextFillStatement>Que el próximo pendiente sea disfrutar.</TextFillStatement></Section>
  </main>;
}
