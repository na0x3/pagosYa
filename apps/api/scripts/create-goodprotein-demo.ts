/** GOODPROTEIN (owner 2026-10-22): an animated health store built from the photos in ~/Downloads/goodProtein, on the owner's demo
 *  merchant (the one that owns NOA VARGAS and BOXY). It sells several protein brands, and the home gives each brand its own
 *  section — a different layout, colour and motion per brand — with a short explanation of that kind of protein.
 *  Local database only; idempotent through examples/goodprotein/demo.json.
 *   npx ts-node --transpile-only scripts/create-goodprotein-demo.ts [--rebuild]
 *  The app context's timers are stopped before their first tick, so it never sends emails or claims jobs beside the running API.
 *  The photos are third-party brand images (Pinterest): a local demo only, never to be published outside. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { PaymentLinksService } from '../src/payment-links/payment-links.service';
import { PromoCodesService } from '../src/promo-codes/promo-codes.service';
import { SubscribersService } from '../src/operations/subscribers.service';
import { OperationsService } from '../src/operations/operations.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceTemplatesService } from '../src/storefront-source/source-templates.service';

const FOLDER = resolve(homedir(), 'Downloads/goodProtein');
/** Index → file: 0 Best Behavior cereal boxes, 1 MAGNUS tub over a barbell, 2 Equip Prime pouches, 3 goodprotein pouch in a kitchen,
 *  4 plant protein tub in a tote, 5 MAGNUS tub on a tennis court, 6 Bloom athlete with a pouch, 7 Bloom pre-workout tubs,
 *  8 vegan protein pouch in a hand, 9 goodprotein pouch held up, 10 Body Tone & Glow can, 11 goodprotein pouch with a milk splash. */
const PHOTOS = ['0b4b6a242f36b42da6dab55fd972b2b9.jpg', '293aeb1969701531dfebf7b9a24a66d7.jpg', '3206d4abe69364304fd7201a33e44a86.jpg', '623036a45a1786a2db96183a395d12b5.jpg',
  '78cfb4ed2959fd2d7884c0f3846e59df.jpg', '8e094c06a195f34a41b84259d67c5bba.jpg', 'ad6c073e6ae0333d0d2d3017cdace62d.jpg', 'c15c016861dcff174d2d2e995c67a5e0.jpg',
  'e7761d4c30859f9d4f772ed84d2adb4e.jpg', 'eeb4e3ede36b5e6d2aad677d02103ac7.jpg', 'f5cbfa60160ea69127243cc1c6e53bff.jpg', 'gg.jpg'];
const CATEGORIES = ['Proteínas', 'Recuperación y energía', 'Snacks proteicos'];

/** Owner: «an animated health store». Fresh citrus paper, the geometric type, the ticker, colour blocks with the marquee,
 *  pill buttons and the playful motion personality; the brand sections below carry their own motion. */
const LOOK = { feature: ['explore'], menu: 'dropdowns', filters: 'sidebar', grid: 'grid4', header: 'classic', announce: 'ticker', footer: 'twotone', button: 'pill', corners: 'round',
  bands: 'blocks', hero: 'split-right', story: 'split', values: 'icons', closing: 'accent', density: 'regular', texture: 'none', photos: 'rounded', cards: 'showcase', card: 'plain', offers: 'steps',
  pdp: 'gallery-left', pdpOrder: 'details-first' };
const SECTIONS = [
  { id: 'howto', title: 'Cómo elegir tu proteína', items: [
    { title: 'Tu objetivo', text: 'Para recuperar después de entrenar, una proteína rápida; para el día a día, un batido completo o un snack.' },
    { title: 'Tu digestión', text: 'Si los lácteos te caen pesados, elige proteína vegetal, de res o clara.' },
    { title: 'Tu momento', text: 'Una porción de 20 a 30 g después de entrenar o como parte de una comida.' }] },
  { id: 'faq', title: 'Preguntas', items: [
    { title: '¿Cuánta proteína necesito al día?', text: 'Una guía común es entre 1,2 y 2 g por kilo de peso si entrenas. Consulta a un profesional para tu caso.' },
    { title: '¿La proteína vegetal es completa?', text: 'Mezclando fuentes como arveja y arroz se logra un perfil de aminoácidos completo.' },
    { title: '¿Estos productos son reales?', text: 'Es una tienda de demostración de pagosYa: ningún pedido ni cobro es real.' }] },
];

type Brand = { id: string; style: string; name: string; eyebrow: string; lead: string; text: string; points: string[]; photos: number[]; product: string; cta: string };
/** One section per brand (owner 2026-10-22: «make a section for each brand … make them unique»). The words explain the kind of
 *  protein, not the brand's own claims. */
const BRANDS: Brand[] = [
  { id: 'best-behavior', style: 'cereal', name: 'Best Behavior', eyebrow: 'Snack proteico', lead: 'Cereal con proteína para un desayuno que se porta bien.',
    text: 'La proteína se mezcla en la masa antes de hornear, por eso cruje como un cereal de siempre y suma proteína a tu tazón sin que lo notes.',
    points: ['Mocha Latte', 'Cinnamon Brioche', 'Blueberry Buttermilk'], photos: [0], product: 'Best Behavior Cereal Proteico', cta: 'Elegir sabor' },
  { id: 'magnus', style: 'recovery', name: 'MAGNUS', eyebrow: 'Recuperación', lead: 'Para después de sudar.',
    text: 'El magnesio participa en la contracción y la relajación de los músculos. Después de entrenar, reponerlo junto con líquidos ayuda al cuerpo a volver a su equilibrio.',
    points: ['Rehidrata', 'Repone minerales', 'Después del esfuerzo'], photos: [5, 1], product: 'MAGNUS Performance Recovery', cta: 'Ver MAGNUS' },
  { id: 'equip', style: 'prime', name: 'Equip', eyebrow: 'Proteína de res', lead: 'Prime Protein, sin lácteos.',
    text: 'La proteína aislada de res aporta todos los aminoácidos esenciales y es una alternativa para quien no tolera el suero de leche.',
    points: ['Sin lácteos', 'Aminoácidos esenciales', 'Tres sabores'], photos: [2], product: 'Equip Prime Protein', cta: 'Ver sabores' },
  { id: 'goodprotein', style: 'allinone', name: 'goodprotein', eyebrow: 'Todo en uno', lead: 'Un batido que es casi una comida.',
    text: 'Un batido todo en uno combina proteína vegetal de varias fuentes —arveja, arroz, semillas— con vitaminas y fibra, para reemplazar un desayuno apurado.',
    points: ['21 g|de proteína', '20|vitaminas y minerales', '0 g|de azúcar añadida'], photos: [11], product: 'goodprotein All-in-One Shake', cta: 'Probar el batido' },
  { id: 'bloom', style: 'clear', name: 'Bloom', eyebrow: 'Proteína clara', lead: 'Se toma como un jugo.',
    text: 'La proteína clara es suero aislado filtrado hasta quedar transparente: liviana, frutal y refrescante en lugar de cremosa. Bloom suma un pre-entreno para empezar con energía.',
    points: ['Clear protein', 'Pre-entreno'], photos: [6, 7], product: 'Bloom Clear Protein', cta: 'Ver Bloom' },
  { id: 'love-sweat-fitness', style: 'plant', name: 'Love Sweat Fitness', eyebrow: 'Proteína vegetal', lead: 'Plantas que se complementan.',
    text: 'La arveja y el arroz se completan entre sí: el aminoácido que a una le falta, la otra lo aporta. Juntas forman una proteína vegetal completa.',
    points: ['Arveja + arroz', 'Sin lácteos', 'Vegana'], photos: [4], product: 'Love Sweat Fitness Plant Protein', cta: 'Ver la proteína' },
  { id: 'protein-pulver', style: 'vegan', name: 'Protein Pulver', eyebrow: 'Vegano', lead: 'Vegano no es menos proteína.',
    text: 'Un buen polvo vegetal llega a 20 g de proteína o más por porción, sin lácteos ni ingredientes de origen animal. Sabor galleta, para el batido de la tarde.',
    points: ['100 % vegetal', 'Sabor galleta', 'Alto en proteína'], photos: [8], product: 'Protein Pulver Vegano', cta: 'Ver Pulver' },
  { id: 'body-tone-glow', style: 'glow', name: 'Body Tone & Glow', eyebrow: 'Forma y brillo', lead: 'Sculpt. Tone. Glow.',
    text: 'Moverte, dormir bien y comer suficiente proteína van juntos: la proteína ayuda a mantener el músculo que da forma y tono al cuerpo.',
    points: ['Movimiento', 'Descanso', 'Proteína'], photos: [10], product: 'Body Tone & Glow', cta: 'Ver Glow' },
];

/** The brands component, written into the store's own source after the template builds it. */
function brandsComponent(brands: Array<Brand & { href: string; srcs: string[] }>): string {
  return `import { Reveal } from '@pagosya/ui';

// GOODPROTEIN demo (owner 2026-10-22): one section per brand, each with its own layout, colour and motion.
type Brand = { id: string; style: string; name: string; eyebrow: string; lead: string; text: string; points: string[]; srcs: string[]; href: string; cta: string };
const BRANDS: Brand[] = ${JSON.stringify(brands.map(({ id, style, name, eyebrow, lead, text, points, srcs, href, cta }) => ({ id, style, name, eyebrow, lead, text, points, srcs, href, cta })))};

function Copy({ brand }: { brand: Brand }) {
  return <>
    <p className="gp-eyebrow">{brand.eyebrow}</p>
    <h2 id={\`gp-\${brand.id}-title\`} className="gp-name">{brand.name}</h2>
    <p className="gp-lead">{brand.lead}</p>
    <p className="gp-text">{brand.text}</p>
  </>;
}
const Cta = ({ brand }: { brand: Brand }) => <a className="gp-cta" href={brand.href}>{brand.cta} <span aria-hidden="true">→</span></a>;

function BrandSection({ brand }: { brand: Brand }) {
  const photo = brand.srcs[0];
  const props = { id: brand.id, className: \`gp-brand gp-brand--\${brand.style}\`, 'aria-labelledby': \`gp-\${brand.id}-title\` };
  switch (brand.style) {
    case 'cereal': return <section {...props}>
      <div className="gp-wrap gp-cereal">
        <Reveal className="gp-cereal__copy"><Copy brand={brand} /><ul className="gp-chips">{brand.points.map((point, index) => <li key={point} style={{ animationDelay: \`\${index * 120}ms\` }}>{point}</li>)}</ul><Cta brand={brand} /></Reveal>
        <div className="gp-cereal__media"><img className="gp-float" src={photo} alt="Cajas de cereal Best Behavior" loading="lazy" /></div>
      </div>
    </section>;
    case 'recovery': return <section {...props}>
      <img className="gp-recovery__bg" src={photo} alt="" aria-hidden="true" loading="lazy" />
      <div className="gp-wrap gp-recovery">
        <Reveal className="gp-recovery__copy"><Copy brand={brand} /><ol className="gp-lines">{brand.points.map((point, index) => <li key={point}><span>{String(index + 1).padStart(2, '0')}</span>{point}</li>)}</ol><Cta brand={brand} /></Reveal>
      </div>
    </section>;
    case 'prime': return <section {...props}>
      <p className="gp-prime__word" aria-hidden="true">PRIME</p>
      <div className="gp-wrap gp-prime">
        <div className="gp-prime__media"><img src={photo} alt="Bolsas de Equip Prime Protein" loading="lazy" /><span className="gp-sticker" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><path id="gp-ring" d="M60 60m-46 0a46 46 0 1 1 92 0a46 46 0 1 1 -92 0" /></defs><text><textPath href="#gp-ring" textLength="286" lengthAdjust="spacing">aislado de res · sin lácteos · </textPath></text></svg></span></div>
        <Reveal className="gp-prime__copy"><Copy brand={brand} /><ul className="gp-ticks">{brand.points.map(point => <li key={point}>{point}</li>)}</ul><Cta brand={brand} /></Reveal>
      </div>
    </section>;
    case 'allinone': return <section {...props}>
      <div className="gp-wrap gp-allinone">
        <div className="gp-allinone__media"><img className="gp-float" src={photo} alt="Bolsa de goodprotein All-in-One Shake" loading="lazy" /></div>
        <Reveal className="gp-allinone__copy"><Copy brand={brand} />
          <dl className="gp-stats">{brand.points.map((point, index) => { const [value, label] = point.split('|'); return <div key={point} style={{ animationDelay: \`\${index * 160}ms\` }}><dt>{value}</dt><dd>{label}</dd></div>; })}</dl>
          <Cta brand={brand} /></Reveal>
      </div>
    </section>;
    case 'clear': return <section {...props}>
      <div className="gp-bubbles" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7].map(index => <i key={index} />)}</div>
      <div className="gp-wrap gp-clear">
        <Reveal className="gp-clear__copy"><Copy brand={brand} /><p className="gp-pills">{brand.points.map(point => <span key={point}>{point}</span>)}</p><Cta brand={brand} /></Reveal>
        <div className="gp-clear__media">{brand.srcs.slice(0, 2).map((src, index) => <img key={src} className={index ? 'gp-clear__second' : 'gp-clear__first'} src={src} alt={index ? 'Pre-entreno Bloom sobre una alfombra de yoga' : 'Atleta con Bloom Clear Protein'} loading="lazy" />)}</div>
      </div>
    </section>;
    case 'plant': return <section {...props}>
      <div className="gp-marquee" aria-hidden="true"><p>{[0, 1].map(round => <span key={round}>PLANT PROTEIN · PROTEÍNA VEGETAL · PLANT PROTEIN · PROTEÍNA VEGETAL · </span>)}</p></div>
      <div className="gp-wrap gp-plant">
        <img className="gp-plant__photo" src={photo} alt="Proteína vegetal en una bolsa de tela" loading="lazy" />
        <Reveal className="gp-plant__copy"><Copy brand={brand} /><p className="gp-sum">{brand.points.join('  ·  ')}</p><Cta brand={brand} /></Reveal>
      </div>
    </section>;
    case 'vegan': return <section {...props}>
      <div className="gp-wrap gp-vegan">
        <Reveal className="gp-vegan__copy"><Copy brand={brand} /><ul className="gp-ticks">{brand.points.map(point => <li key={point}>{point}</li>)}</ul><Cta brand={brand} /></Reveal>
        <figure className="gp-polaroid"><img src={photo} alt="Bolsa de proteína vegana sabor galleta" loading="lazy" /><figcaption>sabor galleta</figcaption><span className="gp-stamp" aria-hidden="true">100 %<br />vegano</span></figure>
      </div>
    </section>;
    default: return <section {...props}>
      <div className="gp-wrap gp-glow">
        <div className="gp-glow__media"><span className="gp-glow__ring" aria-hidden="true" /><img src={photo} alt="Lata de Body Tone & Glow" loading="lazy" /></div>
        <Reveal className="gp-glow__copy"><p className="gp-eyebrow">{brand.eyebrow}</p><h2 id={\`gp-\${brand.id}-title\`} className="gp-name">{brand.name}</h2><p className="gp-glow__line">{brand.lead}</p><p className="gp-text">{brand.text}</p>
          <p className="gp-glow__words">{brand.points.map(point => <span key={point}>{point}</span>)}</p><Cta brand={brand} /></Reveal>
      </div>
    </section>;
  }
}

export default function BrandSections() {
  return <div className="gp-brands" id="marcas">
    <nav className="gp-brandnav" aria-label="Nuestras marcas"><p>Nuestras marcas</p><ul>{BRANDS.map(brand => <li key={brand.id}><a href={\`#\${brand.id}\`} data-gp-style={brand.style}>{brand.name}</a></li>)}</ul></nav>
    {BRANDS.map(brand => <BrandSection key={brand.id} brand={brand} />)}
  </div>;
}
`;
}

const BRANDS_CSS = `
/* GOODPROTEIN brand sections (2026-10-22): each brand its own colour, layout and motion. */
.gp-brands{--gp-max:1180px;font-family:var(--es-body,inherit)}
.gp-brandnav{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:12px max(16px,calc((100% - var(--gp-max)) / 2));background:color-mix(in srgb,var(--es-paper,#fffdf2) 88%,transparent);backdrop-filter:blur(10px);border-block:1px solid color-mix(in srgb,currentColor 12%,transparent)}
.gp-brandnav p{margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;white-space:nowrap}
.gp-brandnav ul{display:flex;gap:8px;margin:0;padding:0;list-style:none;overflow-x:auto;scrollbar-width:none}
.gp-brandnav a{display:inline-block;padding:7px 14px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:999px;font-size:13px;white-space:nowrap;text-decoration:none;color:inherit;transition:background .2s ease,color .2s ease,transform .2s ease}
.gp-brandnav a:hover{background:var(--es-accent,#ef5d1b);color:#fff;transform:translateY(-1px)}
.gp-brand{position:relative;overflow:hidden;padding:clamp(64px,9vw,120px) 0;scroll-margin-top:56px}
.gp-wrap{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:clamp(32px,6vw,88px);width:min(var(--gp-max),calc(100% - 40px));margin:0 auto}
.gp-eyebrow{margin:0 0 14px;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;opacity:.75}
.gp-name{margin:0 0 10px;font-family:var(--es-heading,inherit);font-size:clamp(40px,6vw,76px);line-height:.95;letter-spacing:-.03em}
.gp-lead{margin:0 0 16px;font-size:clamp(18px,2vw,23px);font-weight:600;line-height:1.3}
.gp-text{max-width:46ch;margin:0 0 24px;font-size:16px;line-height:1.65;opacity:.88}
.gp-cta{display:inline-flex;align-items:center;gap:10px;min-height:48px;margin-top:8px;padding:0 24px;border:1.5px solid currentColor;border-radius:999px;background:none;color:inherit;font-weight:600;text-decoration:none;transition:transform .2s ease}
.gp-cta:hover{transform:translateY(-2px)}
.gp-cta span{transition:transform .2s ease}.gp-cta:hover span{transform:translateX(4px)}
.gp-brand img{display:block;width:100%;height:auto}
.gp-ticks{display:grid;gap:8px;margin:0 0 20px;padding:0;list-style:none}
.gp-ticks li::before{content:'✓';display:inline-grid;place-items:center;width:22px;height:22px;margin-right:10px;border-radius:50%;font-size:12px}
/* Best Behavior: sunny yellow, the boxes bob, the flavours pop in. */
.gp-brand--cereal{background:radial-gradient(circle at 1px 1px,rgba(43,29,18,.12) 1.5px,transparent 0) 0 0/22px 22px,#ffe27a;color:#2b1d12}
.gp-cereal__media{transform:rotate(-3deg)}
.gp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;padding:0;list-style:none}
.gp-chips li{padding:8px 16px;border-radius:999px;background:#2b1d12;color:#ffe27a;font-size:14px;font-weight:600}
/* MAGNUS: the court photo fills the band, a slow zoom, monospaced lines on a dark veil. */
.gp-brand--recovery{min-height:min(88vh,760px);display:grid;align-items:end;background:#1d2420;color:#f1ead6}
.gp-recovery__bg{position:absolute;inset:0 0 0 40%;width:60%!important;height:100%!important;object-fit:cover;object-position:60% center;opacity:.8}
.gp-brand--recovery::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#1d2420 40%,rgba(29,36,32,.55) 62%,rgba(29,36,32,0) 85%)}
.gp-recovery{grid-template-columns:minmax(0,560px)}
.gp-recovery .gp-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;letter-spacing:.04em;color:#7fb2ff}
.gp-lines{display:grid;margin:0 0 24px;padding:0;list-style:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;letter-spacing:.06em;text-transform:uppercase}
.gp-lines li{display:flex;gap:16px;padding:12px 0;border-top:1px solid rgba(241,234,214,.25)}.gp-lines span{opacity:.6}
/* Equip: cream paper, a giant outlined PRIME behind, a spinning round sticker. */
.gp-brand--prime{background:#f6efe6;color:#3a1f1f}
.gp-prime__word{position:absolute;inset:auto 0 -0.18em;margin:0;font-family:var(--es-heading,inherit);font-size:clamp(120px,22vw,320px);font-weight:800;line-height:1;letter-spacing:-.04em;text-align:center;color:transparent;-webkit-text-stroke:2px rgba(224,74,79,.28);pointer-events:none}
.gp-prime{grid-template-columns:1.05fr 1fr}
.gp-prime__media{position:relative}
.gp-prime__media img{border-radius:6px;box-shadow:0 30px 60px -30px rgba(58,31,31,.45)}
.gp-prime .gp-name{color:#e04a4f}.gp-prime .gp-ticks li::before{color:#fff;background:#e04a4f}
.gp-sticker{position:absolute;right:-28px;top:-28px;width:132px;height:132px;border-radius:50%;background:#e04a4f;color:#fff;display:grid;place-items:center}
.gp-sticker svg{width:100%;height:100%;font-size:10.5px;font-weight:700;text-transform:uppercase;fill:currentColor}
/* goodprotein: warm orange, the pouch in an arch, the numbers pop. */
.gp-brand--allinone{background:linear-gradient(135deg,#ef5d1b,#ff9f43);color:#fff}
.gp-allinone{grid-template-columns:.9fr 1.1fr}
.gp-allinone__media{padding:24px 24px 0;border-radius:999px 999px 24px 24px;background:rgba(255,255,255,.18)}
.gp-allinone__media img{border-radius:999px 999px 16px 16px}
.gp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 24px}
.gp-stats div{padding:18px 14px;border-radius:20px;background:rgba(255,255,255,.16);text-align:center}
.gp-stats dt{font-family:var(--es-heading,inherit);font-size:clamp(28px,3.4vw,40px);font-weight:700;line-height:1}
.gp-stats dd{margin:6px 0 0;font-size:13px;line-height:1.3;opacity:.9}
/* Bloom: pastel pink, bubbles rising, two photos overlapping. */
.gp-brand--clear{background:linear-gradient(180deg,#ffe1ea,#ffd0df);color:#5b1f3a}
.gp-bubbles i{position:absolute;bottom:-60px;display:block;width:var(--s,28px);height:var(--s,28px);border-radius:50%;background:rgba(255,255,255,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7)}
.gp-bubbles i:nth-child(1){left:6%;--s:22px}.gp-bubbles i:nth-child(2){left:18%;--s:40px}.gp-bubbles i:nth-child(3){left:32%;--s:16px}.gp-bubbles i:nth-child(4){left:47%;--s:30px}
.gp-bubbles i:nth-child(5){left:61%;--s:20px}.gp-bubbles i:nth-child(6){left:73%;--s:46px}.gp-bubbles i:nth-child(7){left:86%;--s:18px}.gp-bubbles i:nth-child(8){left:94%;--s:28px}
.gp-pills{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}.gp-pills span{padding:8px 16px;border-radius:999px;background:#fff;font-size:14px;font-weight:600}
.gp-clear__media{position:relative;min-height:420px}
.gp-clear__first{width:68%!important;border-radius:28px;box-shadow:0 30px 60px -30px rgba(91,31,58,.5)}
.gp-clear__second{position:absolute;right:0;bottom:-24px;width:46%!important;border:8px solid #fff;border-radius:28px;box-shadow:0 30px 60px -30px rgba(91,31,58,.5)}
/* Love Sweat Fitness: nude editorial, a huge slow marquee behind, a tall photo. */
.gp-brand--plant{background:#ead7c4;color:#3d2a1e}
.gp-marquee{position:absolute;inset:50% 0 auto;transform:translateY(-50%);overflow:hidden;pointer-events:none}
.gp-marquee p{display:flex;width:max-content;margin:0;font-family:var(--es-heading,inherit);font-size:clamp(80px,13vw,180px);font-weight:700;line-height:1;white-space:nowrap;color:rgba(61,42,30,.08)}
.gp-plant{grid-template-columns:.8fr 1.2fr}
.gp-plant__photo{border-radius:220px 220px 12px 12px;aspect-ratio:3/4;object-fit:cover}
.gp-sum{margin:0 0 20px;font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
/* Protein Pulver: an oat-paper polaroid that tilts, a green stamp. */
.gp-brand--vegan{background:#f3ece2;color:#2d3a23}
.gp-vegan .gp-ticks li::before{color:#f3ece2;background:#4f6b34}
.gp-polaroid{position:relative;margin:0;padding:16px 16px 56px;background:#fff;box-shadow:0 24px 50px -24px rgba(45,58,35,.45);transform:rotate(3deg);transition:transform .4s ease}
.gp-polaroid:hover{transform:rotate(0deg) scale(1.02)}
.gp-polaroid figcaption{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-family:var(--es-heading,inherit);font-size:20px}
.gp-stamp{position:absolute;left:-26px;top:-26px;display:grid;place-items:center;width:112px;height:112px;border:3px solid #4f6b34;border-radius:50%;background:#f3ece2;color:#4f6b34;font-size:15px;font-weight:800;line-height:1.1;text-align:center;text-transform:uppercase;transform:rotate(-14deg)}
/* Body Tone & Glow: deep slate, a soft glow that breathes around the can, a serif line. */
.gp-brand--glow{background:radial-gradient(circle at 30% 50%,#3d5a6e,#22323d 70%);color:#eef4f7}
.gp-glow__media{position:relative;display:grid;place-items:center}
.gp-glow__media img{position:relative;z-index:1;width:78%!important;border-radius:50% 50% 28px 28px}
.gp-glow__ring{position:absolute;inset:4%;border-radius:50%;background:radial-gradient(circle,rgba(160,215,235,.45),transparent 65%)}
.gp-glow__line{margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:clamp(28px,3.6vw,44px);font-style:italic;line-height:1.1}
.gp-glow__words{display:flex;gap:18px;margin:0 0 20px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;opacity:.8}
@media (prefers-reduced-motion:no-preference){
  .gp-float{animation:gp-bob 5s ease-in-out infinite}
  .gp-chips li,.gp-stats div{animation:gp-pop .6s cubic-bezier(.34,1.56,.64,1) both}
  .gp-recovery__bg{animation:gp-zoom 22s ease-in-out infinite alternate}
  .gp-sticker svg{animation:gp-spin 14s linear infinite}
  .gp-bubbles i{animation:gp-rise 9s linear infinite}
  .gp-bubbles i:nth-child(2n){animation-duration:12s;animation-delay:-4s}.gp-bubbles i:nth-child(3n){animation-duration:7s;animation-delay:-2s}.gp-bubbles i:nth-child(5){animation-delay:-6s}
  .gp-clear__second{animation:gp-bob 6s ease-in-out infinite reverse}
  .gp-marquee p{animation:gp-slide 38s linear infinite}
  .gp-stamp{animation:gp-wobble 4s ease-in-out infinite}
  .gp-glow__ring{animation:gp-breathe 4.5s ease-in-out infinite}
}
@keyframes gp-bob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-14px) rotate(1.5deg)}}
@keyframes gp-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes gp-zoom{from{transform:scale(1)}to{transform:scale(1.12)}}
@keyframes gp-spin{to{transform:rotate(360deg)}}
@keyframes gp-rise{0%{transform:translateY(0);opacity:0}10%{opacity:1}100%{transform:translateY(-900px);opacity:0}}
@keyframes gp-slide{to{transform:translateX(-50%)}}
@keyframes gp-wobble{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(-6deg) scale(1.05)}}
@keyframes gp-breathe{0%,100%{transform:scale(.92);opacity:.7}50%{transform:scale(1.08);opacity:1}}
@media (max-width:760px){
  .gp-wrap,.gp-prime,.gp-allinone,.gp-plant{grid-template-columns:1fr}
  .gp-cereal__media,.gp-allinone__media,.gp-prime__media,.gp-glow__media{order:-1}
  .gp-stats{gap:8px}.gp-stats div{padding:14px 8px}
  .gp-sticker{right:-8px;top:-18px;width:96px;height:96px}
  .gp-recovery__bg{inset:0;width:100%!important;opacity:.35}
  .gp-clear__media{min-height:0;padding-bottom:40px}
  .gp-stamp{left:-8px;top:-18px;width:88px;height:88px;font-size:12px}
  .gp-brandnav{padding-inline:16px}
}
/* GOODPROTEIN brand sections end */
`;

async function main() {
  const folder = resolve(__dirname, '../../../examples/goodprotein');
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-goodprotein-demo requires a local database');
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'goodProtein', tagline: 'Proteína buena, de las marcas que te gustan.', backgroundColor: '#fffdf2', accentColor: '#ef5d1b', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const upload = async (file: string) => {
      if (record.photos[file]) return record.photos[file] as string;
      const asset = await uploads.saveBuffer(await readFile(resolve(FOLDER, file)), 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[file] = asset.url; await save(); return asset.url as string;
    };
    for (const file of PHOTOS) await upload(file);
    const photo = (index: number) => record.photos[PHOTOS[index]] as string;
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }

    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'goodProtein reúne proteínas, recuperación y snacks de varias marcas, con una explicación clara de cada una. Tienda de demostración.',
        policies: {
          returns: 'Puedes devolver un producto cerrado dentro de 15 días. Tienda de demostración: ningún pedido es real.',
          delivery: 'Entregamos en La Paz ciudad o puedes recoger en nuestra tienda de Sopocachi. Tienda de demostración: ningún envío es real.',
          privacy: 'Usamos tus datos solo para tu pedido. Tienda de demostración.',
          terms: 'Precios en bolivianos. Tienda de demostración para probar funciones de pagosYa. Las marcas pertenecen a sus dueños.',
        },
      } as never);
    });

    const product = async (name: string, dto: Record<string, unknown>) => {
      if (record.products[name]) return record.products[name] as string;
      const created: any = await links.create(merchantId, storeId, { name, currency: 'BOB', ...dto } as never);
      record.products[name] = created.id; await save(); return created.id as string;
    };
    const flavours = (amount: number, list: string[], image: number) => list.map((value, index) => ({ name: value, amount, stock: index === list.length - 1 ? 2 : 12, imageUrl: photo(image), options: [{ name: 'Sabor', value }] }));
    const demo = ' Producto de demostración.';
    await product('Best Behavior Cereal Proteico', { categoryId: record.categories['Snacks proteicos'], amount: 8900, imageUrls: [photo(0)], shippingWeightGrams: 400, badge: 'Nuevo',
      description: 'Cereal crocante con proteína en la masa, para el desayuno o un snack.' + demo, variants: flavours(8900, ['Mocha Latte', 'Cinnamon Brioche', 'Blueberry Buttermilk'], 0) });
    await product('MAGNUS Performance Recovery', { categoryId: record.categories['Recuperación y energía'], amount: 26000, imageUrls: [photo(5), photo(1)], stock: 14, shippingWeightGrams: 600,
      description: 'Sistema de recuperación con magnesio para después de entrenar.' + demo, highlights: [{ icon: 'dumbbell', label: 'Post entreno' }, { icon: 'drop', label: 'Rehidrata' }] });
    await product('Equip Prime Protein', { categoryId: record.categories['Proteínas'], amount: 32000, imageUrls: [photo(2)], shippingWeightGrams: 900,
      description: 'Proteína aislada de res, sin lácteos.' + demo, variants: flavours(32000, ['Frutilla', 'Vainilla', 'Chocolate'], 2),
      specifications: [{ label: 'Fuente', value: 'Aislado de res' }, { label: 'Lácteos', value: 'No contiene' }] });
    const shake = await product('goodprotein All-in-One Shake', { categoryId: record.categories['Proteínas'], amount: 28000, imageUrls: [photo(9), photo(11), photo(3)], stock: 30, shippingWeightGrams: 1000, badge: 'Favorito',
      discountPercent: 15, discountStartsAt: new Date().toISOString(), discountEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      description: 'Batido vegetal todo en uno: proteína, vitaminas y fibra en una porción.' + demo,
      contentBlocks: [{ type: 'features', title: 'En cada porción', items: [{ icon: 'sprout', label: 'Proteína vegetal', detail: 'Arveja, arroz y semillas' }, { icon: 'sparkle', label: 'Vitaminas', detail: 'Para un desayuno completo' }, { icon: 'drop', label: 'Sin azúcar añadida', detail: 'Endulzado con fruta' }] }] });
    await product('Bloom Clear Protein', { categoryId: record.categories['Proteínas'], amount: 24000, imageUrls: [photo(6)], stock: 20, shippingWeightGrams: 500,
      description: 'Proteína clara de suero aislado: liviana y frutal, se toma como un jugo.' + demo });
    await product('Bloom Pre-Entreno', { categoryId: record.categories['Recuperación y energía'], amount: 21000, imageUrls: [photo(7)], stock: 3, shippingWeightGrams: 400,
      description: 'Pre-entreno para empezar con energía.' + demo });
    await product('Love Sweat Fitness Plant Protein', { categoryId: record.categories['Proteínas'], amount: 30000, imageUrls: [photo(4)], stock: 16, shippingWeightGrams: 900,
      description: 'Proteína vegetal de arveja y arroz, vegana.' + demo });
    await product('Protein Pulver Vegano', { categoryId: record.categories['Proteínas'], amount: 23000, imageUrls: [photo(8)], stock: 0, shippingWeightGrams: 800,
      description: 'Proteína vegana sabor galleta. Agotado a propósito para probarlo.' + demo });
    await product('Body Tone & Glow', { categoryId: record.categories['Recuperación y energía'], amount: 27000, imageUrls: [photo(10)], stock: 10, shippingWeightGrams: 500,
      description: 'Para acompañar tu rutina de movimiento y descanso.' + demo });
    await step('subscriptions', async () => {
      await links.updateSubscriptions(merchantId, storeId, shake, { options: [{ cadence: 'MONTHLY', discountPercent: 10, label: 'Cada mes' }] } as never);
      await app.get(SubscribersService).setEnabled(merchantId, storeId, true);
    });
    await step('promo-codes', async () => { await app.get(PromoCodesService).create(merchantId, storeId, { code: 'GOOD10', discountType: 'PERCENT', discountValue: 10 } as never); });
    // Delivery in La Paz and one branch with an address, so pickup is offered (pickup needs an address since 2026-10-22).
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true, locations: [{ id: 'sopocachi', name: 'goodProtein Sopocachi', address: 'Av. 6 de Agosto 2170, Sopocachi, La Paz', department: 'LA_PAZ', city: 'La Paz', pickupEnabled: true, deliveryEnabled: true,
        openingHours: [1, 2, 3, 4, 5, 6].map(day => ({ day, open: '09:00', close: '20:00', closed: false })).concat([{ day: 0, open: '10:00', close: '14:00', closed: true }]) }] as never } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz ciudad', fee: 1200, departments: ['LA_PAZ'], freeAbove: 40000, estimatedMinutes: 180 } as never);
    });

    const templates = app.get(SourceTemplatesService), projects = app.get(SourceProjectsService);
    let current = await projects.current(merchantId, storeId);
    if (current.revision === 0 || process.argv.includes('--rebuild')) {
      await templates.applyMaster(merchantId, storeId, current.revision, async () => null);
      current = await projects.current(merchantId, storeId);
      const copy = { announcement: 'Envío gratis en La Paz desde Bs 400 · Usa GOOD10 en tu primera compra', eyebrow: 'Proteína buena', headline: 'Tu proteína, de las marcas que te gustan',
        subcopy: 'Batidos, recuperación y snacks con la explicación de cada uno, para elegir sin adivinar.', primaryCta: 'Ver proteínas', secondaryCta: 'Conocer las marcas',
        productsTitle: 'Lo más pedido', storyTitle: 'Proteína sin misterio', closingLine: 'Empieza hoy con GOOD10', closingCta: 'Ver la tienda', tagline: 'Proteína y bienestar. La Paz.',
        storyBody: 'goodProtein nació para que elegir una proteína no sea adivinar: juntamos marcas que nos gustan y explicamos qué hace cada una, de la proteína clara a la vegetal. Tienda de demostración.',
        values: [{ title: 'Ocho marcas', text: 'Proteína, recuperación y snacks.' }, { title: 'Envío en La Paz', text: 'Gratis desde Bs 400 o recoge en Sopocachi.' }, { title: 'Explicado', text: 'Cada marca con lo que hace por ti.' }] };
      const saved = await templates.refill(merchantId, storeId, current.revision, {
        copy, look: { palette: 'citrus', fonts: 'geometric', colors: { accent: '#ef5d1b' } }, heroPhoto: photo(11), storyPhoto: photo(6), sections: SECTIONS, variants: LOOK as never,
        featureCopy: {},
      }, 'goodProtein');
      const version = await projects.version(merchantId, storeId, saved.revision);
      const snapshot = version.snapshot as any;
      const brands = BRANDS.map(brand => ({ ...brand, srcs: brand.photos.map(photo), href: `product.html?id=${encodeURIComponent(record.products[brand.product])}` }));
      const files = snapshot.files.map((file: { path: string; content: string }) => {
        if (file.path === 'config.js') {
          const json = JSON.parse(file.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;?\s*$/, ''));
          return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...json, dna: { ...json.dna, motion: 'playful', hover: 'lift', press: 'pop' } })};\n` };
        }
        if (file.path === 'components/home.tsx') {
          let content = file.content.replace(/^(import Shell from '\.\/Shell';\n)/m, `$1import BrandSections from './brands';\n`);
          const anchor = content.includes('<section id="historia"') ? '<section id="historia"' : '{sections.map(';
          content = content.replace(anchor, `<BrandSections />\n\n      ${anchor}`);
          if (!content.includes('<BrandSections />') || !content.includes("from './brands'")) throw new Error('home.tsx: no place for the brand sections');
          return { ...file, content };
        }
        if (file.path === 'styles/globals.css') return { ...file, content: file.content + BRANDS_CSS };
        return file;
      }).concat([{ path: 'components/brands.tsx', content: brandsComponent(brands) }]);
      const moved = await projects.save(merchantId, storeId, { revision: saved.revision, label: 'goodProtein con marcas', brief: snapshot.brief, files } as never);
      record.built = (moved as any).revision; await save();
    }
    console.log(JSON.stringify({ storeId, slug: record.slug, revision: (await projects.current(merchantId, storeId)).revision, products: Object.keys(record.products).length }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
