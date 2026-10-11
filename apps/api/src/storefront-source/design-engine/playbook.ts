/**
 * The business playbook (spec docs/superpowers/specs/2026-10-11-business-playbook-design.md, references in
 * docs/superpowers/research/2026-10-11-playbook-references.md). What a real, professional site of each kind of
 * business always has, two style families it suits, and a shop-led or story-led craft profile.
 */
import type { Palette } from './frame-draw';

export type PlaybookKind = 'cafe-food' | 'bakery-sweets' | 'clothing' | 'beauty' | 'services' | 'fitness-wellness' | 'crafts-home' | 'flowers-gifts' | 'general';
export type CraftProfile = 'shop' | 'story';
export type StyleFamily = { id: string; name: string; palettes: Palette[]; fonts: Array<{ display: string; text: string }>; buttons: string[]; radius: string; photoShape: string };
export type Evidence = 'hours' | 'location' | 'delivery';
/** `evidence`: shown only when the store has that fact (never invented); `kitPage`: the platform's own information pages carry it. */
export type PlaybookSection = { id: string; label: string; must: string; detect: RegExp; evidence?: Evidence; kitPage?: boolean };
export type PlaybookEntry = { kind: PlaybookKind; name: string; profile: CraftProfile; sections: PlaybookSection[]; families: StyleFamily[]; tone: string; footer: string; references: string[];
  /** Story angles (DESIGN_CATALOGUE.angle) that suit this kind; a calm build draws only these. */
  angles: string[] };

export const CONVENTIONAL_HEADERS = ['centered-split', 'menu-button', 'info-bar', 'stacked', 'shrinking'] as const;

const p = (id: string, name: string, paper: string, ink: string, accent: string, accent2: string): Palette => ({ id, name, paper, ink, accent, accent2, dark: false });
const HOURS: PlaybookSection = { id: 'hours', label: 'horario', must: 'opening hours from the brief', evidence: 'hours', detect: /(horario|abrimos|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}:\d{2}|\d{1,2}\s*(a|-|–)\s*\d{1,2}\s*h)/i };
const LOCATION: PlaybookSection = { id: 'location', label: 'ubicación', must: 'where to find it: address and a map link', evidence: 'location', detect: /(calle|avenida|av\.|zona|barrio|direcci[oó]n|ubicaci[oó]n|mapa|c\/|esquina)/i };
const DELIVERY: PlaybookSection = { id: 'delivery', label: 'envío o retiro', must: 'how the shopper receives it: delivery area and pickup', evidence: 'delivery', detect: /(env[ií]os?|delivery|retiro|recojo|pickup|entrega)/i };
const ABOUT: PlaybookSection = { id: 'about', label: 'quiénes somos', must: 'a short real story from the brief: who makes it (dates and numbers only when the brief gives them)', detect: /(nosotros|historia|qui[eé]nes somos|desde \d{4}|nuestro|nuestra|fundad)/i };
const FAQ: PlaybookSection = { kitPage: true, id: 'faq', label: 'preguntas frecuentes', must: 'answers to the real questions a buyer asks', detect: /(preguntas|frecuentes|\?)/i };
const CONTACT: PlaybookSection = { kitPage: true, id: 'contact', label: 'contacto', must: 'how to reach a person: phone, email or form', detect: /(contacto|cont[aá]ctanos|escr[ií]benos|whatsapp|tel[eé]fono|correo|@)/i };
const LEGAL = 'a multi-column footer (shop, information pages, contact and hours) with a legal row: store name, NIT when set, address, and the information pages';

export const PLAYBOOK: Record<PlaybookKind, PlaybookEntry> = {
  'cafe-food': { kind: 'cafe-food', angles: ['origin-place', 'ritual-time', 'the-maker', 'senses', 'neighbourhood', 'field-guide'], name: 'café and food', profile: 'shop', references: ['buna.mx', 'pukupuku.pe'], sections: [ABOUT, HOURS, LOCATION, DELIVERY], footer: LEGAL,
    tone: 'warm and concrete: origin, process and taste in real words from the brief; no poetry about pauses or moments',
    families: [
      { id: 'cafe-shop', name: 'clean roaster shop', radius: 'square', photoShape: 'plain', buttons: ['block', 'outline', 'underline'], fonts: [{ display: 'outfit', text: 'outfit' }, { display: 'manrope', text: 'manrope' }, { display: 'familjen-grotesk', text: 'figtree' }],
        palettes: [p('cafe-white-red', 'white and deep red', '#ffffff', '#161616', '#8f1d14', '#f4efe9'), p('cafe-white-green', 'white and forest green', '#ffffff', '#141a17', '#1f5c4a', '#eef2ee')] },
      { id: 'cafe-editorial', name: 'editorial café', radius: 'soft', photoShape: 'rounded-corner', buttons: ['outline', 'split', 'pill'], fonts: [{ display: 'young-serif', text: 'instrument' }, { display: 'newsreader', text: 'manrope' }],
        palettes: [p('cafe-paper-blue', 'warm paper and ink blue', '#f7f4ef', '#1a1f2b', '#2f4bb8', '#ebe5db'), p('cafe-paper-olive', 'warm paper and olive', '#f6f4ee', '#1c1d17', '#56602a', '#e9e6db')] },
    ] },
  'bakery-sweets': { kind: 'bakery-sweets', angles: ['ritual-time', 'the-maker', 'senses', 'neighbourhood'], name: 'bakery and sweets', profile: 'shop', references: ['panio.mx', 'rapanui.com.ar', 'pumpstreetchocolate.com'], sections: [ABOUT, HOURS, LOCATION, DELIVERY, FAQ], footer: LEGAL,
    tone: 'generous and specific: ingredients, baking times and real flavours; gifts and occasions when the brief has them',
    families: [
      { id: 'bakery-editorial', name: 'calm editorial bakery', radius: 'soft', photoShape: 'plain', buttons: ['pill', 'outline'], fonts: [{ display: 'libre-caslon-text', text: 'figtree' }, { display: 'dm-serif-display', text: 'manrope' }],
        palettes: [p('bakery-cream-rose', 'cream and rose', '#fbf7f2', '#221a17', '#b0475a', '#f1e6e1'), p('bakery-cream-plum', 'cream and plum', '#faf6f1', '#20161f', '#5b2a52', '#ece3e8')] },
      { id: 'bakery-shop', name: 'chocolate counter', radius: 'square', photoShape: 'plain', buttons: ['block', 'outline'], fonts: [{ display: 'epilogue', text: 'epilogue' }, { display: 'sora', text: 'manrope' }],
        palettes: [p('bakery-white-blush', 'white and blush', '#ffffff', '#1a1515', '#c1543f', '#f0d3c9'), p('bakery-white-navy', 'white and navy', '#ffffff', '#121826', '#23365f', '#e7ebf2')] },
    ] },
  clothing: { kind: 'clothing', angles: ['the-maker', 'origin-place', 'field-guide', 'neighbourhood'], name: 'clothing and accessories', profile: 'shop', references: ['carlafernandez.com', 'juanadearco.net', 'solalpaca.com', 'thinkingmu.com'], footer: LEGAL,
    sections: [ABOUT, DELIVERY, { id: 'sizes', label: 'tallas', must: 'sizes and how to choose them', detect: /(talla|tallas|medidas|size)/i }, { kitPage: true, id: 'returns', label: 'cambios y devoluciones', must: 'exchanges and returns in one line', detect: /(cambio|devoluci[oó]n|devoluciones)/i }],
    tone: 'short and confident: collections, materials and fit; never hype',
    families: [
      { id: 'clothing-minimal', name: 'minimal boutique', radius: 'square', photoShape: 'plain', buttons: ['block', 'underline', 'outline'], fonts: [{ display: 'instrument', text: 'instrument' }, { display: 'manrope', text: 'manrope' }],
        palettes: [p('clothing-white-black', 'white and black', '#ffffff', '#111111', '#111111', '#efefef'), p('clothing-white-orange', 'white and burnt orange', '#ffffff', '#151515', '#c2410c', '#ecf0f1')] },
      { id: 'clothing-crafted', name: 'crafted label', radius: 'square', photoShape: 'tall', buttons: ['outline', 'pill'], fonts: [{ display: 'bodoni-moda', text: 'figtree' }, { display: 'instrument-serif', text: 'instrument' }],
        palettes: [p('clothing-sand-ink', 'sand and ink', '#f5f1ea', '#161616', '#7a3e1d', '#e8e1d5'), p('clothing-stone-teal', 'stone and teal', '#f2f2ee', '#141816', '#1d5b5b', '#e2e4df')] },
    ] },
  beauty: { kind: 'beauty', angles: ['ritual-time', 'the-maker', 'origin-place', 'field-guide'], name: 'beauty and personal care', profile: 'shop', references: ['xinu.mx', 'matarrania.com'], footer: LEGAL,
    sections: [ABOUT, { id: 'ingredients', label: 'ingredientes o servicios', must: 'what is inside or what the service does, from the brief', detect: /(ingrediente|f[oó]rmula|natural|servicio|tratamiento|piel|cabello)/i }, DELIVERY, CONTACT],
    tone: 'calm and exact: ingredients, routines and results the brief supports; never medical claims',
    families: [
      { id: 'beauty-quiet', name: 'quiet luxury', radius: 'square', photoShape: 'plain', buttons: ['outline', 'block'], fonts: [{ display: 'newsreader', text: 'figtree' }, { display: 'libre-caslon-text', text: 'manrope' }],
        palettes: [p('beauty-ivory-taupe', 'ivory and taupe', '#f6f4ec', '#1b1a17', '#7d6a55', '#ebe7dc'), p('beauty-white-sage', 'white and sage', '#ffffff', '#16201b', '#4f6b5a', '#eef1ec')] },
      { id: 'beauty-fresh', name: 'fresh natural', radius: 'round', photoShape: 'rounded-corner', buttons: ['pill', 'outline'], fonts: [{ display: 'nunito', text: 'nunito' }, { display: 'sora', text: 'figtree' }],
        palettes: [p('beauty-white-leaf', 'white and leaf green', '#ffffff', '#132017', '#2e7d4f', '#e8f2ec'), p('beauty-white-coral', 'white and coral', '#ffffff', '#1e1716', '#c84d3f', '#f6e6e2')] },
    ] },
  services: { kind: 'services', angles: ['field-guide', 'the-maker', 'neighbourhood'], name: 'professional services and finance', profile: 'story', references: ['kambista.com', 'p-narayan-and-associates-15999.boosterpack.xyz', 'pagosya.boosterpack.xyz'], footer: LEGAL,
    sections: [{ id: 'offer', label: 'qué ofrecemos', must: 'what is offered, in plain words', detect: /(servicio|ofrecemos|asesor|contab|legal|financ|cr[eé]dito|tr[aá]mite)/i }, { id: 'steps', label: 'cómo funciona', must: 'how it works in 3-4 numbered steps', detect: /(c[oó]mo funciona|paso|primero|1\.|01)/i }, { id: 'proof', label: 'confianza', must: 'proof from the brief only: years, clients, registrations or reviews it states', detect: /(a[nñ]os|clientes|registr|rese[nñ]a|confian|certific)/i }, FAQ, CONTACT],
    tone: 'clear and trustworthy: what you get, what it costs and what happens next; no jargon',
    families: [
      { id: 'services-editorial', name: 'editorial trust', radius: 'square', photoShape: 'rounded-corner', buttons: ['outline', 'split', 'block'], fonts: [{ display: 'young-serif', text: 'instrument' }, { display: 'playfair-display', text: 'lora' }, { display: 'newsreader', text: 'manrope' }],
        palettes: [p('services-cream-terracotta', 'cream and terracotta', '#f8f5ef', '#262b24', '#9e4a3a', '#ede5d8'), p('services-stone-navy', 'stone and navy', '#f5f5f0', '#1c2133', '#4d5471', '#eaeae4')] },
      { id: 'services-clear', name: 'clear modern', radius: 'soft', photoShape: 'plain', buttons: ['block', 'pill'], fonts: [{ display: 'manrope', text: 'manrope' }, { display: 'sora', text: 'figtree' }],
        palettes: [p('services-white-blue', 'white and trust blue', '#ffffff', '#111827', '#1d4ed8', '#eef2fb'), p('services-white-teal', 'white and teal', '#ffffff', '#10201f', '#0f766e', '#e7f3f1')] },
    ] },
  'fitness-wellness': { kind: 'fitness-wellness', angles: ['ritual-time', 'the-maker', 'neighbourhood', 'field-guide'], name: 'fitness and wellness', profile: 'story', references: ['yoko-studio-gent-19475.boosterpack.xyz', 'moonpilates.mx'], footer: LEGAL,
    sections: [{ id: 'classes', label: 'clases', must: 'the classes or services with level and length', detect: /(clase|clases|sesi[oó]n|nivel|minutos)/i }, { id: 'prices', label: 'precios', must: 'prices or memberships from the catalogue', detect: /(precio|plan|membres|paquete|Bs\.?|\$)/i }, HOURS, LOCATION, CONTACT],
    tone: 'encouraging and practical: who it is for, what a class feels like, how to start',
    families: [
      { id: 'fitness-studio', name: 'studio warm', radius: 'pill', photoShape: 'arch', buttons: ['pill', 'outline'], fonts: [{ display: 'outfit', text: 'figtree' }, { display: 'bricolage', text: 'manrope' }],
        palettes: [p('fitness-cream-forest', 'cream and forest', '#fdf8e8', '#13221a', '#024526', '#f3e5ab'), p('fitness-cream-clay', 'cream and clay', '#fbf6ee', '#211813', '#a4502f', '#efe1cf')] },
      { id: 'fitness-clean', name: 'clean performance', radius: 'soft', photoShape: 'plain', buttons: ['block', 'outline'], fonts: [{ display: 'sora', text: 'manrope' }, { display: 'epilogue', text: 'epilogue' }],
        palettes: [p('fitness-white-black', 'white and black', '#ffffff', '#0f0f0f', '#0f0f0f', '#f0f0f0'), p('fitness-white-violet', 'white and violet', '#ffffff', '#16131f', '#5b3fd1', '#efecfb')] },
    ] },
  'crafts-home': { kind: 'crafts-home', angles: ['the-maker', 'origin-place', 'field-guide', 'neighbourhood'], name: 'crafts and home', profile: 'shop', references: ['onoracasa.com', 'utilitariomexicano.com'], footer: LEGAL,
    sections: [ABOUT, { id: 'craft', label: 'cómo se hace', must: 'materials and how each piece is made', detect: /(hecho a mano|artesan|material|barro|cer[aá]mica|madera|tejid|proceso)/i }, LOCATION, DELIVERY],
    tone: 'honest and tactile: materials, makers and care; each piece is real',
    families: [
      { id: 'crafts-gallery', name: 'gallery shop', radius: 'square', photoShape: 'plain', buttons: ['outline', 'block', 'underline'], fonts: [{ display: 'dm-serif-display', text: 'manrope' }, { display: 'instrument-serif', text: 'instrument' }],
        palettes: [p('crafts-white-charcoal', 'white and charcoal', '#ffffff', '#1b1a19', '#393634', '#efede9'), p('crafts-white-clay', 'white and clay', '#ffffff', '#1d1714', '#a2512e', '#f2e8e1')] },
      { id: 'crafts-market', name: 'market catalogue', radius: 'soft', photoShape: 'plain', buttons: ['block', 'pill'], fonts: [{ display: 'figtree', text: 'figtree' }, { display: 'chivo', text: 'manrope' }],
        palettes: [p('crafts-bone-cobalt', 'bone and cobalt', '#f6f3ec', '#141823', '#2846a8', '#e9e5da'), p('crafts-bone-green', 'bone and green', '#f5f3ec', '#151c16', '#2f6b3a', '#e7e8de')] },
    ] },
  'flowers-gifts': { kind: 'flowers-gifts', angles: ['ritual-time', 'the-maker', 'senses', 'neighbourhood'], name: 'flowers and gifts', profile: 'shop', references: ['margaritasellamamiamor.com'], footer: LEGAL,
    sections: [{ id: 'occasions', label: 'ocasiones', must: 'shop by occasion or category', detect: /(ocasi[oó]n|cumplea|aniversario|boda|regalo|ramo|arreglo)/i }, DELIVERY, ABOUT, CONTACT],
    tone: 'kind and helpful: occasions, delivery times and care, without clichés',
    families: [
      { id: 'flowers-classic', name: 'classic florist', radius: 'soft', photoShape: 'plain', buttons: ['outline', 'block'], fonts: [{ display: 'libre-caslon-text', text: 'figtree' }, { display: 'newsreader', text: 'manrope' }],
        palettes: [p('flowers-white-black', 'white and black', '#ffffff', '#111111', '#111111', '#f3f3f3'), p('flowers-white-rose', 'white and rose', '#ffffff', '#1f1416', '#b23a5b', '#f8e8ec')] },
      { id: 'flowers-garden', name: 'garden fresh', radius: 'round', photoShape: 'rounded-corner', buttons: ['pill', 'outline'], fonts: [{ display: 'fraunces', text: 'figtree' }, { display: 'dm-serif-display', text: 'nunito' }],
        palettes: [p('flowers-cream-green', 'cream and leaf green', '#fbf8f1', '#152017', '#2f6b3a', '#ebe9dc'), p('flowers-cream-coral', 'cream and coral', '#fbf7f2', '#1f1715', '#c4553d', '#efe2d9')] },
    ] },
  general: { kind: 'general', angles: ['the-maker', 'field-guide', 'neighbourhood', 'origin-place'], name: 'professional store', profile: 'shop', references: ['pagosya.boosterpack.xyz'], sections: [ABOUT, DELIVERY, CONTACT], footer: LEGAL,
    tone: 'plain and specific: what is sold, for whom and how to buy it',
    families: [
      { id: 'general-clean', name: 'clean shop', radius: 'soft', photoShape: 'plain', buttons: ['block', 'outline'], fonts: [{ display: 'manrope', text: 'manrope' }, { display: 'figtree', text: 'figtree' }],
        palettes: [p('general-white-blue', 'white and blue', '#ffffff', '#111827', '#1d4ed8', '#eef2fb'), p('general-white-green', 'white and green', '#ffffff', '#132017', '#2f6b3a', '#e8f2ec')] },
      { id: 'general-editorial', name: 'editorial shop', radius: 'square', photoShape: 'rounded-corner', buttons: ['outline', 'split'], fonts: [{ display: 'young-serif', text: 'instrument' }, { display: 'newsreader', text: 'figtree' }],
        palettes: [p('general-paper-terracotta', 'paper and terracotta', '#f8f5ef', '#262b24', '#9e4a3a', '#ede5d8'), p('general-paper-navy', 'paper and navy', '#f6f5f0', '#1c2133', '#3a4a8a', '#e9e8e1')] },
    ] },
};

/** Keyword lists in priority order: most hits wins, ties go to the earlier (more specific) kind. */
const KIND_WORDS: Array<[PlaybookKind, RegExp]> = [
  ['bakery-sweets', /(?<!\p{L})(panader[ií]a|pasteler[ií]a|reposter[ií]a|tortas?|pan|masa madre|galletas?|chocolates?|dulces|helados?)(?!\p{L})/giu],
  ['cafe-food', /(?<!\p{L})(caf[eé]|cafeter[ií]a|tostader[oa]|tostadur[ií]a|barista|restaurante|comida|cocina|men[uú] del d[ií]a|t[eé]|salte[nñ]as?|empanadas?|almuerzos?|viandas?|comidas? saludables?|sandwich(es)?|jugos?)(?!\p{L})/giu],
  ['flowers-gifts', /(?<!\p{L})(flor(es|er[ií]a)?|ramos? de flores|arreglos? florales?|regaler[ií]a)(?!\p{L})/giu],
  ['fitness-wellness', /(?<!\p{L})(gimnasio|gym|yoga|pilates|crossfit|entrenamiento|fitness|bienestar|meditaci[oó]n)(?!\p{L})/giu],
  ['beauty', /(?<!\p{L})(belleza|sal[oó]n|peluquer[ií]a|barber[ií]a|u[nñ]as|maquillaje|cosm[eé]tica|skincare|spa|perfumes?|champ[uú]s?|shampoos?|cabello|cuidado personal|cremas?|jab[oó]n(es)?|piel|skin)(?!\p{L})/giu],
  ['clothing', /(?<!\p{L})(ropa|moda|poleras?|vestidos?|camisas?|pantalones?|zapatos?|calzado|accesorios|boutique|joyer[ií]a|carteras?|chompas?|ponchos?|alpaca|polos?|chaquetas?|bufandas?|gorras?)(?!\p{L})/giu],
  ['crafts-home', /(?<!\p{L})(artesan[ií]as?|cer[aá]mica|alfarer[ií]a|muebles?|decoraci[oó]n|hogar|textiles?|tejidos?|velas|cuadros?|impresiones? de arte|l[aá]minas?|arte para tu casa|posters? de arte)(?!\p{L})/giu],
  // Generic shop words ("pago seguro", "tarjeta de crédito", "garantía legal") are not services; only phrases are.
  ['services', /(?<!\p{L})(contador|contable|contabilidad|abogad[oa]s?|asesor[ií]a (legal|contable|financiera|tributaria)|consultor[ií]a|estudio (contable|jur[ií]dico)|financier[oa]|cr[eé]ditos? (para|a) (pymes|personas|empresas)|seguros de (vida|salud|autos?)|tr[aá]mites)(?!\p{L})/giu],
];
export function detectKind(text: string): PlaybookKind {
  let best: PlaybookKind = 'general', bestHits = 0;
  for (const [kind, words] of KIND_WORDS) {
    const hits = (text.match(words) || []).length;
    if (hits > bestHits) { best = kind; bestHits = hits; }
  }
  return best;
}

export function pickFamily(entry: PlaybookEntry, random: () => number, recentFamilies: string[]): StyleFamily {
  const uses = entry.families.map(family => recentFamilies.filter(id => id === family.id).length);
  const fewest = Math.min(...uses);
  const options = entry.families.filter((_, i) => uses[i] === fewest);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

const PROFILE_LINE: Record<CraftProfile, string> = {
  shop: 'Craft profile shop-led: products lead early (the catalog within the first two screens), h1 28-48px, body 14-16px, a white or near-white page with one brand colour band, compact rhythm.',
  story: 'Craft profile story-led: h1 56-96px, body 16-20px, calm alternating tinted backgrounds with at most one dark band, 96-144px between sections.',
};
export type PlaybookOptions = { bold?: boolean; palette?: Palette; button?: string; brandColours?: boolean; evidence?: Partial<Record<Evidence, boolean>> };
const shown = (section: PlaybookSection, evidence: Partial<Record<Evidence, boolean>>) => !section.evidence || evidence[section.evidence] !== false;
export function playbookDirection(entry: PlaybookEntry, family: StyleFamily, options: PlaybookOptions = {}): string {
  const evidence = options.evidence ?? {};
  const palettes = options.palette ? [options.palette] : family.palettes;
  const colours = options.brandColours ? '' : `, colours ${palettes.map(pl => `${pl.name} (background ${pl.paper}, text ${pl.ink}, accent ${pl.accent}, panels ${pl.accent2})`).join(' or ')}`;
  return [
    options.bold
      ? `PLAYBOOK: This is a ${entry.name} business. The merchant asked for a bold look; keep the sections below and the footer, and make the layout as bold as they asked.`
      : `PLAYBOOK: This is a ${entry.name} business. Make it read like a normal, professionally made website of that kind, like the best real ones, not an art experiment.`,
    `- It must show: ${entry.sections.filter(section => shown(section, evidence)).map(section => section.must).join('; ')}. Only real facts from the brief and the store data; never invent hours, addresses, dates, numbers or reviews.`,
    `- ${options.bold ? '' : PROFILE_LINE[entry.profile] + ' '}One content container 1140-1320px wide with 64-80px side margins; standard header (logo, 3-5 links, one action, cart); ${entry.footer}.`,
    `- Style family "${family.name}": ${family.radius} corners, ${family.photoShape} photos, fonts ${family.fonts.map(f => `${f.display} + ${f.text}`).join(' or ')}, buttons ${options.button ?? family.buttons.join(' or ')}${colours}.`,
    '- Modern and professional details: a header that stays usable while scrolling, a footer with columns, small headings, line icons and the legal row on every page; consistent line icons (inline SVG, 1.5px stroke, currentColor) for contact, hours, location, delivery and features; never emoji.',
    `- Voice: ${entry.tone}.`,
  ].join('\n');
}

export function contractMisses(entry: PlaybookEntry, pageText: string, evidence: Partial<Record<Evidence, boolean>> = {}): string[] {
  return entry.sections.filter(section => !section.kitPage && shown(section, evidence) && !section.detect.test(pageText)).map(section => section.label);
}

const LIMITS: Record<CraftProfile, { h1: [number, number]; body: [number, number] }> = { shop: { h1: [22, 64], body: [13, 17] }, story: { h1: [44, 112], body: [15, 21] } };
/** Desktop type sizes against the profile; generous margins so a fact appears only when clearly out of range. */
export function craftFacts(profile: CraftProfile, width: number, h1Size: number, bodySize: number): string[] {
  // One desktop width only: 1280 and 1024 would report the same size twice.
  if (width !== 1280) return [];
  const limit = LIMITS[profile];
  return [
    ...(h1Size && (h1Size < limit.h1[0] || h1Size > limit.h1[1]) ? [`${width}px: el título principal mide ${h1Size}px; para este tipo de tienda va entre ${limit.h1[0]} y ${limit.h1[1]}px.`] : []),
    ...(bodySize && (bodySize < limit.body[0] || bodySize > limit.body[1]) ? [`${width}px: el texto de párrafo mide ${bodySize}px; va entre ${limit.body[0]} y ${limit.body[1]}px.`] : []),
  ];
}
