/**
 * One header + hero per style card (spec 2026-10-11 Elige tu estilo). The model writes it in the concept's fonts and
 * colours; it is sanitised here and shown only in a script-less sandbox. A failed or unusable answer gets the template.
 */
import { BadGatewayException } from '@nestjs/common';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { sourceResponseJson } from '../source-response';
import { sourceUsage, type SourceModel } from '../source-generation-policy';
import type { SourceRequestBudget } from '../source-request-budget';
import type { DesignPlanningAttempt } from '../source-design-planner';
import type { SourceDesignConcept } from '../source-design';
import { checkSourceProviderQuota, isProviderRejection, providerRetryPause } from '../source-provider-error';
import type { SignatureDevice } from './style-draws';

export type HeroFacts = { storeName: string; logoPath?: string; photoPath?: string; headline: string; line: string; action: string; palette: { paper: string; ink: string; accent: string; accent2: string }; fonts: { display: string; text: string }; mode: 'calm' | 'bold';
  /** The concept's eyebrow (story.eyebrow), shown uppercase and tracked above the intense card's headline. */
  eyebrow?: string;
  /** The calm card's playbook family: its button shapes (first = the template's) and its corner radius. */
  buttons?: string[]; radius?: string;
  /** The card's drawn header and hero (slot.draw): the template takes its layout from them. */
  frame?: { header?: string; hero?: string };
  /** The bold card's drawn signature device (slot.device); none = the circular stamp. */
  device?: SignatureDevice;
  /** The bold template's layout; derived from `frame` when absent (see boldLayout). */
  layout?: BoldLayout;
  /** Real numbers from the brief for the numbers device, e.g. { value: '1.800', label: 'msnm' }. Never invented. */
  numbers?: Array<{ value: string; label: string }> };

export type BoldLayout = 'rail' | 'band' | 'poster';
/** The bold template's layout from the drawn frame: the header decides, then the hero; the side rail is the default. */
export function boldLayout(frame: HeroFacts['frame'] = {}): BoldLayout {
  if (frame.header === 'side-rail') return 'rail';
  if (frame.header === 'wordmark-band') return 'band';
  if (frame.header === 'overlay' || frame.header === 'bottom-pill') return 'poster';
  if (frame.hero === 'statement-strip') return 'band';
  if (frame.hero === 'type-only' || frame.hero === 'collage') return 'poster';
  return 'rail';
}

const MAX_HERO = 40_000;
const escape = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const fontOf = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id) ?? SOURCE_FONT_CATALOG.find(font => font.id === 'instrument')!;
// Local paths only: the kit's assets/, uploads and inline images. Everything else is dropped.
const LOCAL_URL = /^(assets\/[\w./-]+|\/v1\/uploads\/[\w.-]+|data:image\/(png|jpe?g|webp|svg\+xml)[;,])/i;
const BLOCKED = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'frame', 'frameset', 'noscript', 'template', 'math', 'xmp', 'noembed', 'noframes', 'plaintext', 'applet', 'animate', 'set', 'animatemotion', 'animatetransform', 'discard', 'foreignobject']);
const URL_ATTRS = new Set(['src', 'href', 'xlink:href', 'srcset', 'poster', 'action', 'formaction', 'data', 'background', 'ping']);
// Checked on DECODED text (attribute values, <style> bodies): anything that can spell a fetch or an escape.
const LOCAL_CSS_URL = /^url\(\s*["']?(assets\/|\/v1\/uploads\/|data:image\/)/i;
function cssIsUnsafe(text: string): boolean {
  if (/[\\]|@import|expression\s*\(|image-set\s*\(|-moz-binding/i.test(text)) return true;
  for (const m of text.matchAll(/url\(/gi)) if (!LOCAL_CSS_URL.test(text.slice(m.index!, m.index! + 80))) return true;
  return false;
}

export function heroFontFaces(fonts: { display: string; text: string }): string {
  return [...new Map([fontOf(fonts.display), fontOf(fonts.text)].map(font => [font.id, font])).values()]
    .map(font => `@font-face{font-family:"${font.family}";src:url("assets/${font.id}.ttf") format("truetype");font-display:swap}`).join('');
}

type Node = DefaultTreeAdapterMap['node'];

// Rebuilds the tree from an allowlist; returns false when something cannot be proved harmless.
function cleanNode(parent: { childNodes: Node[] }): boolean {
  const kept: Node[] = [];
  for (const node of parent.childNodes) {
    if (node.nodeName === '#comment') continue;
    if (node.nodeName === '#text') { kept.push(node); continue; }
    const el = node as DefaultTreeAdapterMap['element'];
    const tag = el.tagName.toLowerCase();
    if (BLOCKED.has(tag) || !/^[a-z][a-z0-9:-]*$/.test(tag)) continue;
    el.attrs = el.attrs.filter(attr => {
      const name = (attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name).toLowerCase(), value = attr.value.trim();
      if (name.startsWith('on')) return false;
      if (URL_ATTRS.has(name)) {
        if (name === 'href' && (value === '' || value.startsWith('#') || /^[\w-]+\.html$/.test(value))) return true;
        const local = name === 'srcset' ? value.split(',').every(candidate => LOCAL_URL.test(candidate.trim())) : LOCAL_URL.test(value);
        if (!local) { if (name === 'href') attr.value = '#'; else return false; }
        return true;
      }
      return !cssIsUnsafe(attr.value);
    });
    if (tag === 'style') {
      for (const child of el.childNodes) {
        if (child.nodeName !== '#text') return false;
        const text = child as DefaultTreeAdapterMap['textNode'];
        if (/[\\<]/.test(text.value)) return false;
        // Decoded, escape-free CSS: foreign url()s and @import become inert, anything stranger fails closed.
        text.value = text.value.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(["']?)([^"'()\s]*)\1\s*\)/gi, (match, _quote, url: string) => LOCAL_URL.test(url) ? match : 'none');
        if (cssIsUnsafe(text.value)) return false;
      }
    }
    if (!cleanNode(el)) return false;
    kept.push(node);
  }
  parent.childNodes = kept;
  return true;
}

/** Parses with parse5 (which decodes entities the way a browser does) and rebuilds from an allowlist; null = unusable. */
export function sanitizeHeroHtml(html: string): string | null {
  if (typeof html !== 'string' || !html.trim() || html.length > MAX_HERO) return null;
  // A real hero has a few hundred tags; thousands only come from nesting bombs that make the parser slow.
  if (html.split('<').length > 2500) return null;
  try {
    const fragment = parseFragment(html);
    if (!cleanNode(fragment)) return null;
    const raw = serialize(fragment);
    // The browser re-parses what we emit: unless parse -> serialise is a fixed point, the tree we checked is not the tree it builds.
    if (raw.length > MAX_HERO || serialize(parseFragment(raw)) !== raw) return null;
    const out = raw.trim();
    const inert = out.replace(/\sxmlns(:[\w-]+)?\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/data:image\/[^"')\s]*/gi, '');
    if (/\b(?:https?|ftp|wss?):/i.test(inert) || /(?:^|[\s"'(=,>])\/\/[^\s"'/]/.test(inert)) return null;
    return out && /data-store-name/.test(out) ? out : null;
  } catch { return null; }
}

const hexColour = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
// WCAG relative luminance and contrast, to keep the type field's colours readable on any palette.
const channel = (v: number) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const relativeLuminance = (hex: string) => [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16) / 255)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: string, b: string) => { const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** The first candidate that reads on `background` (contrast 3 or more), else the one that reads best. */
const readableOn = (background: string, candidates: string[]) => candidates.find(colour => contrast(colour, background) >= 3) ?? [...candidates].sort((a, b) => contrast(b, background) - contrast(a, background))[0];
/** Font-size divisor that keeps a word of `letters` inside its box: a heavy display glyph is about 0.66em wide in mixed case and up to 0.92em in capitals (Archivo Black). */
const wordDivisor = (letters: number, em: number) => Math.ceil(Math.max(1, letters) * em * 100) / 100;
const longestWord = (text: string) => Math.max(1, ...text.split(/\s+/).filter(Boolean).map(word => [...word].length));
// The ring the stamp's text runs on: a circle of radius 74 in a 200-unit box.
/** The stamp sits in the art box's top-right padding, its centre `out` px beyond the block's corner on both axes: it covers
 * the corner and never reaches the text, which starts 36px inside the block (√2·(36 + out) ≥ size/2). */
const stampBox = (size: number, out: number) => ({ size, out, inset: size / 2 + out });
const STAMP = { desktop: stampBox(150, 28), phone: stampBox(96, 4) };
const RING_LENGTH = Math.round(2 * Math.PI * 74 * 10) / 10;

const ARROW = '<svg class="ty-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

export function templateHero(facts: HeroFacts): string {
  if (facts.mode === 'bold') return intenseTemplateHero(facts);
  const display = fontOf(facts.fonts.display), text = fontOf(facts.fonts.text);
  const p = { paper: hexColour(facts.palette.paper, '#ffffff'), ink: hexColour(facts.palette.ink, '#111111'), accent: hexColour(facts.palette.accent, '#111111'), accent2: hexColour(facts.palette.accent2, '#f2f2f2') };
  const logo = facts.logoPath ? `<img class="th-logo" src="${escape(facts.logoPath)}" alt="">` : '';
  // The family's own button shape and radius, with a small offset: never a default button.
  const radius = facts.radius === 'square' ? '2px' : facts.radius === 'soft' ? '10px' : '6px';
  const form = facts.buttons?.[0] ?? 'pill';
  const button = form === 'outline' ? `background:transparent;color:${p.accent};border:2px solid ${p.accent};border-radius:${radius};box-shadow:3px 3px 0 ${p.accent2}`
    : form === 'underline' ? `background:transparent;color:${p.ink};border:0;border-bottom:2px solid ${p.accent};border-radius:0;padding:8px 0`
    : `background:${p.accent};color:${p.paper};border:2px solid ${p.accent};border-radius:${form === 'pill' ? '999px' : radius};box-shadow:3px 3px 0 ${p.accent2}`;
  // The drawn hero where it is cheap: a full-bleed photo, a facts panel, a calm line drawing, else the photo split.
  const drawnHero = facts.frame?.hero, header = facts.frame?.header;
  const variant = drawnHero === 'full-bleed' && facts.photoPath ? 'bleed' : drawnHero === 'facts-panel' ? 'panel' : drawnHero === 'illustration' || (drawnHero && !facts.photoPath && drawnHero !== 'catalog-lead') ? 'drawing' : 'split';
  const photo = facts.photoPath && variant !== 'drawing' ? `<img class="th-photo" src="${escape(facts.photoPath)}" alt="">` : '';
  const drawing = `<svg class="th-draw" viewBox="0 0 320 320" aria-hidden="true"><circle cx="160" cy="160" r="128" fill="${p.accent2}"></circle><circle cx="206" cy="116" r="28" fill="none" stroke="${p.accent}" stroke-width="3"></circle><path d="M44 206 Q104 150 164 200 T 284 196" fill="none" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"></path><path d="M62 242 Q150 204 262 238" fill="none" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"></path></svg>`;
  const name = `<span class="th-name">${logo}<span data-store-name>${escape(facts.storeName)}</span></span>`;
  const links = ['Productos', 'Nosotros', 'Contacto'].map(link => `<a href="#">${link}</a>`);
  // The drawn header where it is cheap: an info bar, a centred split, a stacked name or a menu button.
  const bar = header === 'centered-split' ? `<header class="th-bar th-split"><nav class="th-nav">${links.slice(0, 2).join('')}</nav>${name}<span class="th-tools"><a href="#">Contacto</a><span>Carrito (0)</span></span></header>`
    : header === 'stacked' ? `<header class="th-bar th-stack">${name}<span class="th-tools"><nav class="th-nav">${links.join('')}<a href="#">Buscar</a></nav><span>Carrito (0)</span></span></header>`
    : header === 'menu-button' ? `<header class="th-bar">${name}<span class="th-tools"><span class="th-menu">Menú</span><span>Carrito (0)</span></span></header>`
    : `<header class="th-bar">${name}<nav class="th-nav">${links.join('')}</nav><span>Carrito (0)</span></header>`;
  const info = header === 'info-bar' ? `<p class="th-info">${escape(facts.eyebrow?.trim() || facts.line)}</p>` : '';
  const copy = variant === 'panel'
    ? `<div><h1>${escape(facts.headline)}</h1><a class="th-cta" href="#">${escape(facts.action)} <span aria-hidden="true">→</span></a></div><aside class="th-panel">${photo}<p class="th-panel-name">${escape(facts.storeName)}</p><p>${escape(facts.line)}</p></aside>`
    : `<div><h1>${escape(facts.headline)}</h1><p>${escape(facts.line)}</p><a class="th-cta" href="#">${escape(facts.action)} <span aria-hidden="true">→</span></a></div>${variant === 'drawing' ? drawing : variant === 'bleed' ? '' : photo}`;
  const columns = variant === 'panel' || variant === 'drawing' || photo && variant === 'split' ? '1.1fr 1fr' : '1fr';
  const extra = [
    info ? `.th .th-info{max-width:none;margin:0;background:${p.accent};color:${p.paper};text-align:center;font-size:13px;padding:8px 5vw}` : '',
    header === 'centered-split' ? '.th-split{display:grid;grid-template-columns:1fr auto 1fr}.th-split .th-tools{justify-self:end;display:flex;gap:20px}' : '',
    header === 'stacked' ? '.th-stack{flex-direction:column;justify-content:center}.th-stack .th-name{font-size:30px}.th-stack .th-tools{display:flex;gap:20px;align-items:center}' : '',
    header === 'menu-button' ? `.th-tools{display:flex;gap:16px;align-items:center}.th-menu{border:1.5px solid ${p.ink};border-radius:${radius};padding:8px 14px;font-size:14px}` : '',
    variant === 'bleed' ? '.th-bleed{position:relative;min-height:72vh;color:#ffffff}.th-bleed .th-photo{position:absolute;inset:0;width:100%;height:100%;border-radius:0;z-index:0}.th-bleed::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.1));z-index:1}.th-bleed > div{position:relative;z-index:2}.th-bleed .th-cta{background:#ffffff;color:#111111;border-color:#ffffff;box-shadow:none}' : '',
    variant === 'panel' ? `.th-panel{background:${p.accent2};border-radius:${radius};padding:28px;display:flex;flex-direction:column;gap:12px}.th-panel .th-photo{height:min(36vh,300px)}.th-panel-name{font-family:"${display.family}",serif;font-size:24px;margin:0}.th-panel p{margin:0}` : '',
    variant === 'drawing' ? '.th-draw{width:min(100%,440px);height:auto;justify-self:center}' : '',
  ].join('');
  return `<style>${heroFontFaces(facts.fonts)}
.th{background:${p.paper};color:${p.ink};font-family:"${text.family}",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column}
.th-bar{display:flex;align-items:center;justify-content:space-between;padding:20px 5vw;gap:16px}
.th-name{font-family:"${display.family}",serif;font-size:22px;display:flex;align-items:center;gap:10px}.th-logo{height:36px;width:auto}
.th-nav{display:flex;gap:20px;font-size:15px}${header ? '.th-nav a,.th-tools a{color:inherit}' : ''}.th-main{flex:1;display:grid;grid-template-columns:${columns};align-items:center;gap:5vw;padding:4vw 5vw}
.th h1{font-family:"${display.family}",serif;font-size:clamp(34px,5vw,64px);line-height:1.02;margin:0 0 18px;text-wrap:balance}.th p{font-size:18px;max-width:46ch;margin:0 0 28px}
.th-cta{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;text-decoration:none;font-weight:600;${button}}
.th-photo{width:100%;height:min(70vh,620px);object-fit:cover;border-radius:12px}${extra}
@media (max-width:640px){.th-main{grid-template-columns:1fr}.th-nav{display:none}}</style>
<div class="th">${info}${bar}
<section class="th-main${variant === 'bleed' ? ' th-bleed' : ''}">${variant === 'bleed' ? photo : ''}${copy}</section></div>`;
}

type BoldContext = { facts: HeroFacts; display: ReturnType<typeof fontOf>; text: ReturnType<typeof fontOf>; p: { paper: string; ink: string; accent: string; accent2: string }; hard: string; fill: string; fillText: string; buttonShadow: string; upper: string; headlineDivisor: number; typeDivisor: number; logo: string; words: string[] };

function boldContext(facts: HeroFacts): BoldContext {
  const p = { paper: hexColour(facts.palette.paper, '#f2b705'), ink: hexColour(facts.palette.ink, '#111111'), accent: hexColour(facts.palette.accent, '#e5371f'), accent2: hexColour(facts.palette.accent2, '#fff6d6') };
  const dark = luminance(p.paper) < 0.35;
  // A black shadow and button on a light colour field; on a dark one they take the light ink, so they still read.
  const hard = dark ? p.accent : '#111111';
  const fill = dark ? p.ink : '#111111', fillText = dark ? p.paper : '#ffffff';
  const words = facts.storeName.split(/\s+/).filter(Boolean).slice(0, 3);
  return { facts, display: fontOf(facts.fonts.display), text: fontOf(facts.fonts.text), p, hard, fill, fillText, buttonShadow: p.accent.toLowerCase() === fill.toLowerCase() ? p.accent2 : p.accent, upper: facts.storeName.toUpperCase(),
    // Giant type is sized by its longest word against its own column (container units), so no word breaks or clips.
    headlineDivisor: wordDivisor(longestWord(facts.headline), 0.66), typeDivisor: wordDivisor(longestWord(facts.storeName), 0.92),
    logo: facts.logoPath ? `<img class="ty-logo" src="${escape(facts.logoPath)}" alt="">` : '', words: words.length ? words : [facts.storeName] };
}

/** The circular stamp: as many repeats of the name as fill the ring at 16px, then a size that never overfills it; textLength spaces it to the full circle. */
function stampSvg(c: BoldContext, cls: string, id: string): string {
  const unit = [...c.upper].length + 3;
  const ring = Array.from({ length: Math.max(1, Math.round(RING_LENGTH / (unit * 16 * 0.62))) }, () => `${c.upper} · `).join('');
  const ringSize = Math.min(16, Math.floor(RING_LENGTH / ([...ring].length * 0.62) * 10) / 10);
  return `<svg class="${cls}" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="${id}" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"></path></defs><circle cx="100" cy="100" r="98" fill="${c.p.accent2}"></circle><circle cx="100" cy="100" r="46" fill="${c.p.accent}"></circle><text font-size="${ringSize}" font-weight="700" fill="${luminance(c.p.accent2) < 0.4 ? '#ffffff' : '#111111'}"><textPath href="#${id}" textLength="${RING_LENGTH}" lengthAdjust="spacing">${escape(ring)}</textPath></text></svg>`;
}

/** Real numbers for the numbers device: only the brief's own (HeroFacts.numbers), and at least two; never the card copy. */
export const MIN_DEVICE_NUMBERS = 2;
function realNumbers(facts: HeroFacts): Array<{ value: string; label: string }> {
  const numbers = (facts.numbers ?? []).slice(0, 4);
  return numbers.length >= MIN_DEVICE_NUMBERS ? numbers : [];
}
const NUMBER_STOPWORDS = new Set(['del', 'las', 'los', 'por', 'para', 'con', 'que', 'hasta', 'desde', 'and', 'the', 'nro', 'zona']);
/** An address or contact number follows these words: never a fact for the numbers row. */
const CONTACT_BEFORE = /(?:^|[^\p{L}])(calle|c|av|avda|avenida|nro|num|n[°º]|no|#|whatsapp|wsp|tel|tel[eé]fono|cel|celular|casilla|zona|km)\.?\s*:?\s*$/iu;
/** Numbers with a unit word after them ("1.800 msnm", "12 cafés", "30 %") or a time ("8:00"). Phone, address and
 *  bare numbers are never taken: nothing next to + or -, nothing followed by more digits, nothing after calle/nro/tel. */
export function numbersIn(text: string): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (const m of text.matchAll(/(?<![\p{L}\d.,:+\-#°º/])(?<!-\s{1,2})(\d{1,2}:\d{2}|\d{1,4}(?:[.,]\d{1,3})?)(?![\d.,:/]?\d)(?!\s*-\s*\d)(?!\s+\d)(?:\s*(%|\p{L}{3,14}))?/gu)) {
    const time = /^\d{1,2}:\d{2}$/.test(m[1]);
    const label = m[2] && (m[2] === '%' || !NUMBER_STOPWORDS.has(m[2].toLowerCase())) ? m[2] : '';
    if (!time && !label) continue;
    if (CONTACT_BEFORE.test(text.slice(Math.max(0, m.index! - 24), m.index!))) continue;
    if (!out.some(item => item.value === m[1])) out.push({ value: m[1], label });
    if (out.length === 4) break;
  }
  return out;
}

/** The words a marquee, a sticker or a ticket may use: the store's own copy, never invented. */
const ownWords = (facts: HeroFacts) => [...new Set([facts.storeName, facts.eyebrow?.trim(), facts.action].filter((word): word is string => Boolean(word && word.trim())))];

/** Where a layout puts the drawn device: a corner piece over the art, a row in the copy, a band below, a wordmark
 * behind the headline, or a treatment of the photos (torn edge, polaroids). */
type DevicePiece = { css: string; corner: string; copy: string; band: string; behind: string; torn: boolean; polaroids: boolean };

function devicePiece(device: SignatureDevice, c: BoldContext): DevicePiece {
  const { p, facts, display } = c;
  const piece: DevicePiece = { css: '', corner: '', copy: '', band: '', behind: '', torn: false, polaroids: false };
  const marquee = () => {
    const phrase = ownWords(facts).map(word => escape(word.toUpperCase())).join(' · ') + ' · ';
    const half = `<span>${Array.from({ length: 4 }, () => phrase).join('')}</span>`;
    piece.band = `<div class="xd-marquee" aria-hidden="true"><div class="xd-track">${half}${half}</div></div>`;
    piece.css += `.xd-marquee{overflow:hidden;contain:inline-size;min-width:0;max-width:100%;background:${c.fill};color:${c.fillText};border-block:3px solid ${c.hard};padding:14px 0;font-family:"${display.family}",sans-serif;font-weight:900;font-size:clamp(20px,3.2vw,42px);line-height:1;white-space:nowrap;grid-column:1/-1}
.xd-track{display:flex;width:max-content;animation:xd-slide 30s linear infinite}.xd-track span{padding-right:.4em}
@keyframes xd-slide{to{transform:translateX(-50%)}}@media (prefers-reduced-motion:reduce){.xd-track{animation:none}}`;
  };
  switch (device) {
    case 'stamp':
      piece.corner = stampSvg(c, 'xd-stamp', 'xd-ring');
      piece.css += '.xd-stamp{display:block;width:150px;height:150px;animation:xd-spin 24s linear infinite}@keyframes xd-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.xd-stamp{animation:none}}@media (max-width:640px){.xd-stamp{width:96px;height:96px}}';
      break;
    case 'stickers': {
      const words = ownWords(facts).slice(0, 3);
      // Uppercase heavy letters are about 0.78em wide; the circle's text box is 64px on the phone (84px less its padding and a margin).
      const size = (word: string, box: number) => Math.max(8, Math.min(16, Math.floor(box / (longestWord(word) * 0.78))));
      piece.corner = `<div class="xd-stickers" aria-hidden="true">${words.map((word, i) => `<span class="xd-st xd-st${i + 1}">${escape(word)}</span>`).join('')}</div>`;
      const sizes = words.map((word, i) => [`.xd-st${i + 1}{font-size:${size(word, i === 0 ? 88 : 136)}px}`, `.xd-st${i + 1}{font-size:${size(word, i === 0 ? 64 : 96)}px}`]);
      const on = (bg: string) => readableOn(bg, [p.ink, '#111111', '#ffffff']);
      piece.css += `.xd-stickers{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.xd-st{font-family:"${display.family}",sans-serif;font-weight:800;text-transform:uppercase;text-align:center;line-height:1.05;border:3px solid ${c.hard};box-shadow:4px 4px 0 ${c.hard};max-width:170px;overflow-wrap:normal;word-break:normal}
.xd-st1{display:flex;align-items:center;justify-content:center;width:112px;height:112px;border-radius:50%;padding:8px;box-sizing:border-box;background:${p.accent};color:${on(p.accent)};transform:rotate(-10deg)}
.xd-st2{padding:8px 14px;border-radius:999px;background:${p.accent2};color:${on(p.accent2)};transform:rotate(6deg)}
.xd-st3{padding:6px 12px;background:${c.fill};color:${c.fillText};transform:rotate(-4deg)}
${sizes.map(pair => pair[0]).join('')}
@media (max-width:640px){.xd-st1{width:84px;height:84px}.xd-st{max-width:130px}${sizes.map(pair => pair[1]).join('')}}`;
      break;
    }
    case 'ticket': {
      const nameSize = Math.max(11, Math.min(20, Math.floor(150 / (longestWord(facts.storeName) * 0.92))));
      const ink = readableOn(p.accent2, [p.ink, '#111111', '#ffffff']);
      piece.corner = `<div class="xd-ticket" aria-hidden="true"><span class="xd-ticket-name">${escape(c.upper)}</span><span class="xd-ticket-line">${escape(facts.action)}</span></div>`;
      piece.css += `.xd-ticket{position:relative;display:block;max-width:210px;box-sizing:border-box;background:${p.accent2};color:${ink};padding:16px 20px 16px 38px;border:3px solid ${c.hard};box-shadow:6px 6px 0 ${c.hard};transform:rotate(7deg);font-family:"${display.family}",sans-serif;font-weight:800}
.xd-ticket::before{content:"";position:absolute;left:12px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:${p.paper};border:2px solid ${c.hard}}
.xd-ticket-name{display:block;font-size:${nameSize}px;line-height:1.05;overflow-wrap:normal;word-break:normal}.xd-ticket-line{display:block;font-size:12px;letter-spacing:.16em;text-transform:uppercase;border-top:2px dashed currentColor;margin-top:8px;padding-top:8px}`;
      break;
    }
    case 'numbers': {
      const numbers = realNumbers(facts);
      if (!numbers.length) { marquee(); break; }
      piece.copy = `<div class="xd-numbers">${numbers.map(n => `<span class="xd-num"><b>${escape(n.value)}</b>${n.label ? `<small>${escape(n.label)}</small>` : ''}</span>`).join('')}</div>`;
      piece.css += `.xd-numbers{display:flex;flex-wrap:wrap;gap:12px 32px;margin:0 0 30px}.xd-num{display:flex;flex-direction:column}.xd-num b{font-family:"${display.family}",sans-serif;font-weight:900;font-size:clamp(40px,6vw,84px);line-height:.9;letter-spacing:-0.03em}.xd-num small{font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin-top:6px}`;
      break;
    }
    case 'marquee': marquee(); break;
    case 'outline-wordmark':
      piece.behind = `<span class="xd-ghost" aria-hidden="true">${escape(c.upper)}</span>`;
      piece.css += `.xd-host{position:relative}.xd-host > *{position:relative;z-index:1}.xd-host > .xd-ghost{position:absolute;left:0;top:-0.4em;z-index:0;font-family:"${display.family}",sans-serif;font-weight:900;font-size:min(240px,calc(100cqi/${c.typeDivisor}));line-height:.85;letter-spacing:-0.03em;color:transparent;-webkit-text-stroke:2px ${p.accent};opacity:.35;pointer-events:none;overflow-wrap:normal;word-break:normal}`;
      break;
    case 'torn-edge': piece.torn = true; break;
    case 'polaroids': piece.polaroids = true; break;
  }
  return piece;
}

/** A torn-paper edge along the bottom: an irregular zigzag, the same for every render. */
const TORN = `polygon(0 0,100% 0,${Array.from({ length: 15 }, (_, i) => `${(100 - i * 100 / 14).toFixed(1)}% ${[100, 94, 98, 92, 99, 95, 100, 93, 97, 94, 100, 92, 98, 95, 100][i]}%`).join(',')})`;

/** Polaroid stack of the one real photo (three crops), or of the store's words on colour without one. */
function polaroids(c: BoldContext, cls: string): string {
  const crops = ['30% 50%', '75% 40%', '50% 50%'];
  const card = (i: number) => c.facts.photoPath
    ? `<img src="${escape(c.facts.photoPath)}" alt="" style="object-position:${crops[i]}">`
    : `<span class="${cls}-word">${escape((c.words[i % c.words.length] ?? '').toUpperCase())}</span>`;
  return `<div class="${cls}">${[0, 1, 2].map(i => `<figure class="${cls}-card ${cls}-card${i + 1}">${card(i)}${i === 2 ? `<figcaption>${escape(c.facts.storeName)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}
const polaroidCss = (c: BoldContext, cls: string, height: number, phone: number) => `.${cls}{position:relative;height:${height}px;container-type:inline-size}
.${cls}-card{position:absolute;margin:0;width:70%;box-sizing:border-box;background:#ffffff;padding:12px 12px 46px;box-shadow:10px 10px 0 ${c.hard}}
.${cls}-card img{display:block;width:100%;height:${Math.round(height * 0.66)}px;object-fit:cover}
.${cls}-word{display:flex;align-items:center;justify-content:center;height:${Math.round(height * 0.66)}px;background:${c.p.accent};color:${readableOn(c.p.accent, [c.p.paper, '#ffffff', '#111111'])};font-family:"${c.display.family}",sans-serif;font-weight:900;font-size:min(56px,calc((70cqi - 24px)/${c.typeDivisor}));overflow-wrap:normal;word-break:normal}
.${cls}-card1{left:0;top:8%;transform:rotate(-8deg)}.${cls}-card2{right:0;top:0;transform:rotate(6deg)}.${cls}-card3{left:15%;top:16%;transform:rotate(-2deg)}
.${cls} figcaption{position:absolute;left:14px;right:14px;bottom:12px;color:#111111;font-family:"${c.display.family}",sans-serif;font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:640px){.${cls}{height:${phone}px}.${cls}-card img,.${cls}-word{height:${Math.round(phone * 0.62)}px}}`;

const ctaCss = (c: BoldContext, cls: string, background = c.fill, color = c.fillText, shadow = c.buttonShadow) =>
  `.${cls}{display:inline-flex;align-items:center;gap:14px;background:${background};color:${color};padding:18px 30px;font-size:17px;font-weight:700;text-decoration:none;border-radius:999px;box-shadow:6px 6px 0 ${shadow}}.ty-arrow{width:22px;height:22px}`;
const H1_RULES = 'line-height:.9;letter-spacing:-0.04em;font-weight:900;margin:0 0 24px;overflow-wrap:normal;word-break:normal;hyphens:manual';

/** The intense card's template: one of three poster layouts (rail, band, poster) taken from the drawn header and hero,
 * each with the card's drawn signature device. */
function intenseTemplateHero(facts: HeroFacts): string {
  const c = boldContext(facts);
  const device = facts.device ?? 'stamp';
  const layout = facts.layout ?? boldLayout(facts.frame);
  return layout === 'band' ? bandHero(c, device) : layout === 'poster' ? posterHero(c, device) : railHero(c, device);
}

/** Side rail + offset frame, after the owner's reference store: a dark side rail with the name rotated, a tilted photo in a
 * thick white frame with a hard offset shadow (a giant type field without a photo), the drawn device (by default a
 * rotating SVG stamp of the store's name), a giant tight headline and an arrow pill with an accent offset shadow. */
function railHero(c: BoldContext, device: SignatureDevice): string {
  const { facts, p, display, text } = c;
  // The phone rail holds the name and the cart in one row: a long name gets smaller, and an ellipsis is the last resort.
  const phoneName = Math.max(12, Math.min(20, Math.floor(230 / ([...c.upper].length * 0.7) * 10) / 10));
  // The type field's words alternate two colours that both read on the accent field, whatever the palette.
  const typeOdd = readableOn(p.accent, [p.paper, '#ffffff', '#111111']);
  const typeEven = readableOn(p.accent, [p.ink, '#ffffff', '#111111'].filter(colour => colour !== typeOdd));
  const piece = device === 'stamp' ? undefined : devicePiece(device, c);
  // The art box keeps the stamp's corner room only for a corner device (stamp, stickers, ticket).
  const cornered = !piece || Boolean(piece.corner);
  const frame = `<figure class="ty-frame${piece?.torn ? ' ty-torn' : ''}"><img class="ty-photo" src="${escape(facts.photoPath ?? '')}" alt=""></figure>`;
  const typeField = `<div class="ty-type${piece?.torn ? ' ty-torn' : ''}" aria-hidden="true">${c.words.map(word => `<span>${escape(word)}</span>`).join('')}</div>`;
  const art = piece?.polaroids ? polaroids(c, 'ty-pol') : facts.photoPath ? (piece?.torn ? `<div class="ty-tear">${frame}</div>` : frame) : piece?.torn ? `<div class="ty-tear">${typeField}</div>` : typeField;
  const corner = piece ? (piece.corner ? `<div class="xd-corner">${piece.corner}</div>` : '') : stampSvg(c, 'ty-stamp', 'ty-ring');
  const deviceCss = piece ? [piece.css,
    piece.corner ? '.xd-corner{position:absolute;top:0;right:0;z-index:2}' : '',
    piece.torn ? `.ty-tear{filter:drop-shadow(16px 16px 0 ${c.hard})}.ty-tear .ty-torn{box-shadow:none;clip-path:${TORN}}` : '',
    piece.polaroids ? polaroidCss(c, 'ty-pol', 520, 380) : ''].join('\n') : `.ty-stamp{position:absolute;width:${STAMP.desktop.size}px;height:${STAMP.desktop.size}px;top:0;right:0;animation:ty-spin 24s linear infinite}
@keyframes ty-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ty-stamp{animation:none}}`;
  const phoneStamp = piece ? '' : `.ty-stamp{width:${STAMP.phone.size}px;height:${STAMP.phone.size}px}`;
  return `<style>${heroFontFaces(facts.fonts)}
.ty{background:${p.paper};color:${p.ink};font-family:"${text.family}",system-ui,sans-serif;min-height:100vh;display:grid;grid-template-columns:96px 1fr;overflow:hidden}
.ty-rail{background:${c.fill};color:${c.fillText};display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:24px;padding:28px 0}
.ty-logo{width:48px;height:auto}
.ty-name{font-family:"${display.family}",sans-serif;font-weight:800;font-size:26px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg)}
.ty-nav{display:flex;gap:18px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg)}.ty-nav a{color:inherit;text-decoration:none}
.ty-cart{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg)}
.ty-main{display:grid;grid-template-columns:1.05fr 1fr;align-items:center;gap:5vw;padding:6vw 6vw 6vw 5vw;min-width:0}
.ty-copy{container-type:inline-size;min-width:0}
.ty-eyebrow{font-size:13px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;margin:0 0 22px}
.ty h1{font-family:"${display.family}",sans-serif;font-size:min(140px,calc(100cqi/${c.headlineDivisor}));${H1_RULES}}
.ty-line{font-size:19px;max-width:40ch;margin:0 0 34px}
${ctaCss(c, 'ty-cta')}
.ty-art{position:relative;justify-self:center;width:min(100%,520px);box-sizing:border-box;padding:${cornered ? `${STAMP.desktop.inset}px ${STAMP.desktop.inset}px 0 0` : '0'};container-type:inline-size}
.ty-frame{margin:0;background:#ffffff;padding:16px;transform:rotate(-3deg);box-shadow:16px 16px 0 ${c.hard}}
.ty-photo{display:block;width:100%;height:min(62vh,560px);object-fit:cover}
.ty-type{display:flex;flex-direction:column;background:${p.accent};color:${typeOdd};padding:36px;transform:rotate(-3deg);box-shadow:16px 16px 0 ${c.hard};font-family:"${display.family}",sans-serif;font-weight:900;font-size:min(120px,calc((100cqi - 72px)/${c.typeDivisor}));line-height:.88;letter-spacing:-0.04em;text-transform:uppercase;overflow-wrap:normal;word-break:normal}.ty-type span:nth-child(2n){color:${typeEven}}
${deviceCss}
@media (max-width:640px){.ty{grid-template-columns:1fr}.ty-rail{flex-direction:row;padding:14px 18px}.ty-name{writing-mode:horizontal-tb;transform:none;font-size:${phoneName}px;min-width:0;overflow:hidden;text-overflow:ellipsis}.ty-cart{writing-mode:horizontal-tb;transform:none;flex:none}.ty-nav{display:none}.ty-main{grid-template-columns:1fr;padding:32px 18px 56px}.ty h1{font-size:min(72px,calc(100cqi/${c.headlineDivisor}))}${cornered ? `.ty-art{padding:${STAMP.phone.inset}px ${STAMP.phone.inset}px 0 0}` : ''}${phoneStamp}}</style>
<div class="ty"><header class="ty-rail">${c.logo}<span class="ty-name" data-store-name>${escape(facts.storeName)}</span><nav class="ty-nav"><a href="#">Productos</a><a href="#">Nosotros</a><a href="#">Contacto</a></nav><span class="ty-cart">Carrito (0)</span></header>
<section class="ty-main"><div class="ty-copy${piece?.behind ? ' xd-host' : ''}">${piece?.behind ?? ''}<p class="ty-eyebrow">${escape(facts.eyebrow?.trim() || facts.storeName)}</p><h1>${escape(facts.headline)}</h1><p class="ty-line">${escape(facts.line)}</p>${piece?.copy ?? ''}<a class="ty-cta" href="#">${escape(facts.action)} ${ARROW}</a></div><div class="ty-art">${art}${corner}</div>${piece?.band ?? ''}</section></div>`;
}

/** Wordmark band / statement strip: the store name as a giant full-width wordmark over a thin bar, a giant statement
 * beside the support copy, a horizontal strip of the photo (colour blocks without one) and a marquee band. */
function bandHero(c: BoldContext, device: SignatureDevice): string {
  const { facts, p, display, text } = c;
  const piece = devicePiece(device, c);
  // One ornament per card: the band carries a marquee only when that is the drawn device (or the numbers fallback).
  const band = piece.band;
  const crops = ['20% 50%', '50% 40%', '80% 60%'];
  const blockColours = [p.accent, c.fill, p.accent2];
  const blockWords = [c.words[0], facts.action, c.words[1] ?? facts.eyebrow?.trim() ?? c.words[0]].map(word => word ?? '');
  const shot = (i: number) => facts.photoPath
    ? (piece.polaroids ? `<img src="${escape(facts.photoPath)}" alt="" style="object-position:${crops[i]}">` : `<img class="tb-shot${piece.torn ? ' tb-torn' : ''}" src="${escape(facts.photoPath)}" alt="" style="object-position:${crops[i]}">`)
    : `<div class="tb-block${piece.torn ? ' tb-torn' : ''}" style="background:${blockColours[i]};color:${readableOn(blockColours[i], [p.paper, p.ink, '#ffffff', '#111111'])}"><span style="font-size:min(64px,calc(100cqi/${wordDivisor(longestWord(blockWords[i]), 0.92)}))">${escape(blockWords[i].toUpperCase())}</span></div>`;
  const cell = (i: number) => piece.polaroids ? `<figure class="tb-pc">${shot(i)}</figure>` : shot(i);
  const tools = '<span class="tb-tools"><a href="#">Buscar</a><a href="#">Mi cuenta</a><span>Carrito (0)</span></span>';
  return `<style>${heroFontFaces(facts.fonts)}
.tb{background:${p.paper};color:${p.ink};font-family:"${text.family}",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;overflow:hidden}
.tb-top{padding:24px 4vw 8px;display:flex;align-items:flex-end;gap:16px}.tb-wordbox{flex:1;min-width:0;container-type:inline-size}
.tb-logo{width:56px;height:auto;flex:none}
.tb-word{margin:0;font-family:"${display.family}",sans-serif;font-weight:900;font-size:min(300px,calc(100cqi/${c.typeDivisor}));line-height:.82;letter-spacing:-0.04em;text-transform:uppercase;overflow-wrap:normal;word-break:normal}
.tb-bar{display:flex;align-items:center;gap:22px;margin:0 4vw;padding:12px 0;border-block:3px solid ${p.ink};font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.tb-bar a{color:inherit;text-decoration:none}.tb-tools{margin-left:auto;display:flex;gap:18px}
.tb-main{display:grid;grid-template-columns:1.4fr 1fr;align-items:end;gap:5vw;padding:5vw 4vw 4vw;min-width:0}
.tb-copy{container-type:inline-size;min-width:0}
.tb h1{font-family:"${display.family}",sans-serif;font-size:min(150px,calc(100cqi/${c.headlineDivisor}));${H1_RULES.replace('margin:0 0 24px', 'margin:0')}}
.tb-eyebrow{font-size:13px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;margin:0 0 18px}.tb-line{font-size:19px;max-width:40ch;margin:0 0 30px}
${ctaCss(c, 'tb-cta')}
.tb-strip{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:0 4vw 32px}
.tb-shot{display:block;width:100%;height:clamp(150px,30vh,320px);object-fit:cover;border:3px solid ${c.hard};box-sizing:border-box}
.tb-block{container-type:inline-size;display:flex;align-items:flex-end;height:clamp(150px,30vh,320px);padding:18px;box-sizing:border-box;border:3px solid ${c.hard}}.tb-block span{font-family:"${display.family}",sans-serif;font-weight:900;line-height:.9;overflow-wrap:normal;word-break:normal}
.tb-pc{margin:0;background:#ffffff;padding:10px 10px 34px;box-shadow:8px 8px 0 ${c.hard}}.tb-pc:nth-child(odd){transform:rotate(-3deg)}.tb-pc:nth-child(even){transform:rotate(3deg)}.tb-pc img{display:block;width:100%;height:clamp(130px,26vh,280px);object-fit:cover}
.tb-torn{clip-path:${TORN};border:0}
.tb-strip .xd-corner{position:absolute;right:6vw;top:-56px;z-index:2}
${piece.css}
@media (max-width:640px){.tb-top{padding:18px 18px 6px}.tb-bar{margin:0 18px;gap:14px;font-size:11px}.tb-bar > a{display:none}.tb-tools a{display:none}.tb-main{grid-template-columns:1fr;padding:28px 18px}.tb h1{font-size:min(72px,calc(100cqi/${c.headlineDivisor}))}.tb-strip{gap:8px;padding:0 18px 24px}.tb-blocks{grid-template-columns:1fr}.tb-block{height:auto;min-height:104px}.tb-strip .xd-corner{right:18px;top:-40px}}</style>
<div class="tb"><header><div class="tb-top">${facts.logoPath ? `<img class="tb-logo" src="${escape(facts.logoPath)}" alt="">` : ''}<div class="tb-wordbox"><p class="tb-word" data-store-name>${escape(facts.storeName)}</p></div></div><nav class="tb-bar"><a href="#">Productos</a><a href="#">Nosotros</a><a href="#">Contacto</a>${tools}</nav></header>
<section class="tb-main"><div class="tb-copy${piece.behind ? ' xd-host' : ''}">${piece.behind}<h1>${escape(facts.headline)}</h1></div><div class="tb-side"><p class="tb-eyebrow">${escape(facts.eyebrow?.trim() || facts.storeName)}</p><p class="tb-line">${escape(facts.line)}</p>${piece.copy}<a class="tb-cta" href="#">${escape(facts.action)} ${ARROW}</a></div></section>
<div class="tb-strip${facts.photoPath ? '' : ' tb-blocks'}">${[0, 1, 2].map(cell).join('')}${piece.corner ? `<div class="xd-corner">${piece.corner}</div>` : ''}</div>${band}</div>`;
}

/** Poster split: two colour fields side by side, the copy giant on the first, an overlapping collage of the photo (or the
 * store's words alone) on the second, a sticker over the seam and the drawn device; a floating pill when the header is one. */
function posterHero(c: BoldContext, device: SignatureDevice): string {
  const { facts, p, display, text } = c;
  const piece = devicePiece(device, c);
  const pill = facts.frame?.header === 'bottom-pill';
  const onA = readableOn(p.accent, [p.paper, p.ink, '#ffffff', '#111111']);
  const ctaBg = readableOn(p.accent, [c.fill, p.ink, '#111111', '#ffffff']);
  const ctaText = readableOn(ctaBg, [p.paper, '#ffffff', '#111111']);
  const onB = readableOn(p.accent2, [p.ink, '#111111', '#ffffff']);
  const typeOnly = !facts.photoPath || facts.frame?.hero === 'type-only';
  const crops = ['25% 50%', '70% 40%', '50% 55%'];
  const collage = piece.polaroids ? polaroids(c, 'tp-pol')
    : typeOnly ? `<div class="tp-words${piece.torn ? ' tp-torn' : ''}" aria-hidden="true">${c.words.map(word => `<span>${escape(word)}</span>`).join('')}</div>`
    : `<div class="tp-collage">${[0, 1, 2].map(i => `<div class="tp-shot tp-shot${i + 1}"><img${piece.torn ? ' class="tp-torn"' : ''} src="${escape(facts.photoPath!)}" alt="" style="object-position:${crops[i]}"></div>`).join('')}</div>`;
  const links = '<a href="#">Productos</a><a href="#">Nosotros</a><a href="#">Buscar</a>';
  return `<style>${heroFontFaces(facts.fonts)}
.tp{position:relative;background:${p.paper};color:${p.ink};font-family:"${text.family}",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;overflow:hidden}
.tp-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 4vw;border-bottom:3px solid ${c.hard}}
.tp-name{display:flex;align-items:center;gap:10px;min-width:0;font-family:"${display.family}",sans-serif;font-weight:900;font-size:26px;letter-spacing:-0.01em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tp-logo{height:40px;width:auto}
.tp-tools{display:flex;align-items:center;gap:14px;flex:none;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.tp-tools a{color:inherit;text-decoration:none}
.tp-menu{background:${c.fill};color:${c.fillText};border-radius:999px;padding:10px 18px}
.tp-main{flex:1;display:grid;grid-template-columns:1fr 1fr;min-width:0}
.tp-a{background:${p.accent};color:${onA};padding:6vw max(5vw,64px) 6vw 5vw;display:flex;align-items:center;min-width:0}
.tp-b{position:relative;background:${p.accent2};color:${onB};padding:5vw;display:flex;align-items:center;justify-content:center;min-width:0;container-type:inline-size}
.tp-copy{container-type:inline-size;width:100%;min-width:0}
.tp-eyebrow{font-size:13px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;margin:0 0 22px}
.tp h1{font-family:"${display.family}",sans-serif;font-size:min(130px,calc(100cqi/${c.headlineDivisor}));${H1_RULES}}
.tp-line{font-size:19px;max-width:40ch;margin:0 0 34px}
${ctaCss(c, 'tp-cta', ctaBg, ctaText, p.accent2)}
.tp-collage{position:relative;width:100%;height:min(64vh,560px)}
.tp-shot{position:absolute;width:62%;filter:drop-shadow(12px 12px 0 ${c.hard})}.tp-shot img{display:block;width:100%;height:min(40vh,340px);object-fit:cover;border:4px solid #ffffff;box-sizing:border-box}
.tp-shot1{left:0;top:4%;transform:rotate(-6deg)}.tp-shot2{right:0;top:18%;transform:rotate(5deg)}.tp-shot3{left:16%;bottom:0;transform:rotate(-1deg)}
.tp-torn{clip-path:${TORN}}
.tp-words{display:flex;flex-direction:column;width:100%;font-family:"${display.family}",sans-serif;font-weight:900;font-size:min(150px,calc(100cqi/${c.typeDivisor}));line-height:.86;letter-spacing:-0.04em;text-transform:uppercase;overflow-wrap:normal;word-break:normal}.tp-words span:nth-child(2n){color:${readableOn(p.accent2, [p.accent, c.fill, '#111111'])}}
.tp-b .xd-corner{position:absolute;top:24px;right:24px;z-index:3}
.tp-pill{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:4;display:flex;gap:18px;align-items:center;background:${c.fill};color:${c.fillText};border-radius:999px;padding:12px 22px;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;box-shadow:5px 5px 0 ${p.accent}}.tp-pill a{color:inherit;text-decoration:none}
${piece.polaroids ? polaroidCss(c, 'tp-pol', 500, 360) : ''}
${piece.css}
@media (max-width:640px){.tp-bar{padding:14px 18px}.tp-name{font-size:20px}.tp-tools a{display:none}.tp-main{grid-template-columns:1fr}.tp-a{padding:36px 18px}.tp-b{padding:48px 18px 72px}.tp h1{font-size:min(72px,calc(100cqi/${c.headlineDivisor}))}.tp-collage{height:340px}.tp-shot img{height:200px}.tp-pill{gap:12px;padding:10px 16px;font-size:11px}.tp-pill a:nth-child(2){display:none}}</style>
<div class="tp"><header class="tp-bar"><span class="tp-name">${facts.logoPath ? `<img class="tp-logo" src="${escape(facts.logoPath)}" alt="">` : ''}<span data-store-name>${escape(facts.storeName)}</span></span>${pill ? '' : '<span class="tp-tools"><a href="#">Buscar</a><span class="tp-menu">Menú</span><span>Carrito (0)</span></span>'}</header>
<section class="tp-main"><div class="tp-a"><div class="tp-copy${piece.behind ? ' xd-host' : ''}">${piece.behind}<p class="tp-eyebrow">${escape(facts.eyebrow?.trim() || facts.storeName)}</p><h1>${escape(facts.headline)}</h1><p class="tp-line">${escape(facts.line)}</p>${piece.copy}<a class="tp-cta" href="#">${escape(facts.action)} ${ARROW}</a></div></div><div class="tp-b">${collage}${piece.corner ? `<div class="xd-corner">${piece.corner}</div>` : ''}</div></section>${piece.band}${pill ? `<nav class="tp-pill">${links}<span>Carrito (0)</span></nav>` : ''}</div>`;
}

const HERO_SCHEMA = { type: 'object', additionalProperties: false, required: ['html'], properties: { html: { type: 'string' } } };

/** A 400/404 that names the model: the provider (or the ChatGPT bridge) does not offer the fast hero model. */
const modelRejected = (status: number, text: string) => (status === 400 || status === 404) && /model/i.test(text);

/** The calm hero is a short fragment on the fast model (spec 2026-10-11 speed-up): small cap, short timeout. The intense
 * hero carries more devices, so it is written on the run model with more room (the bridge itself stops a call at 240 s). */
const HERO_CAPS = { calm: { outputTokens: 4000, timeoutMs: 120_000 }, bold: { outputTokens: 7000, timeoutMs: 200_000 } } as const;

/** How the model builds each signature device: the store's own words only, never an invented fact. */
const DEVICE_DIRECTION: Record<SignatureDevice, (facts: HeroFacts) => string> = {
  stamp: facts => `a circular rotating-text stamp overlapping a corner of the main image or colour block, drawn as inline SVG: <svg viewBox="0 0 200 200"><defs><path id="stamp-ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"/></defs><text><textPath href="#stamp-ring">...</textPath></text></svg>, turned slowly by a CSS animation. Its text uses only the store's own words: the store name, its city and what it sells, e.g. "${facts.storeName.toUpperCase()} · " and then the city or the product when the brief names them.`,
  marquee: () => "a full-width marquee band: one line of heavy uppercase type on a colour field, the business's own words (the store name, what it sells, the city when the brief names it) repeated and sliding slowly with a CSS animation (still under prefers-reduced-motion); the band hides its overflow so it never widens the page.",
  stickers: () => "a cluster of two or three stickers (a circle, a pill, a cut shape) overlapping a corner of the main image, each turned 5-15 degrees with a thick outline or a hard shadow, each carrying two or three real words from the store's copy.",
  numbers: () => "a row of two to four oversized numbers in the display font, each with a small uppercase label, using only numbers the brief or the store data gives (hours, years, altitude, sizes, prices). With fewer than two real numbers, make a marquee band of the business's own words instead.",
  'torn-edge': () => "the main photo with a torn-paper edge (a jagged clip-path polygon along one or two sides, the paper colour showing behind it) and a hard offset shadow (filter: drop-shadow with no blur); nothing else on the card is torn.",
  polaroids: () => "the real photo as a small stack of two or three overlapping polaroid frames (white border, thicker at the bottom, each turned a few degrees, a hard offset shadow), with a short caption of real words on the front one.",
  ticket: () => "a label or ticket tag (a punched hole or notched edges, a dashed rule) pinned at an angle over a corner of the hero, carrying a real detail: the store name with what it sells, or the main action.",
  'outline-wordmark': () => "the store name as a giant outline wordmark (text stroke only, no fill, low contrast) set behind the headline and sized so its longest word fits the width; the headline stays fully readable on top of it.",
};

/** The intense card's art direction: THIS card's drawn header and hero at poster intensity, with its drawn signature device. */
function intenseDirection(facts: HeroFacts): string {
  const { accent } = facts.palette;
  const device = facts.device ?? 'stamp';
  return [
    "This card is INTENSE: the bold option shown next to a calm one, a poster-like shop with a strong point of view. Every move below is required, made in this card's colours, fonts and the store's own words:",
    "- HEADER AND HERO (required): build exactly this card's drawn header and hero (DESIGN DRAW below) at poster intensity: oversized, cropped, colour-blocked; never a plain bar of links over an ordinary hero.",
    facts.photoPath
      ? '- PHOTO (required): the real photo large and cropped with intent, placed the way the drawn hero says, with a hard edge or a hard offset shadow (no blur).'
      : "- PHOTO (required): there is no photo, so make a giant type collage of the store's own words on blocks of colour instead.",
    `- SIGNATURE DEVICE (required, drawn for this card; it is the card's one ornament): ${DEVICE_DIRECTION[device](facts)} Never invent a fact, a number, a date or a place.`,
    '- EYEBROW (required): a short uppercase line above the headline with wide letter-spacing (0.2em or more).',
    '- HEADLINE (required): giant and very heavy in the display font: font-size clamp(64px, 10vw, 140px) on desktop, font-weight 800-900 where the font has it, line-height 0.95 or less, letter-spacing tight but no tighter than -0.04em, never break a word (no hyphenation, no word-break; wrap only between words, and step the size down on phones so the longest word fits).',
    '- SUPPORT (required): one line of support copy under the headline.',
    `- BUTTON (required): a custom button shape (pill, block or split) with an arrow icon and a hard offset shadow in the accent colour (e.g. box-shadow: 6px 6px 0 ${accent}); never a default grey button.`,
    '- COLOUR (required): at least one strong colour field from this palette (the page background or a large block), never a plain white page.',
  ].join('\n');
}

/** The calm card: a professional page, still with its family's own button shape and radius. */
function calmDirection(facts: HeroFacts): string {
  const shapes = facts.buttons?.length ? `from this family's buttons (${facts.buttons.join(', ')})${facts.radius ? ` with the family's ${facts.radius} radius` : ''}` : '(pill, block, outline or split)';
  return `This card is calm: a normal, professionally made website of this kind. Still give its main action a custom button shape ${shapes}, in the accent colour; never a default grey button.`;
}

export async function writeStyleHero(input: { facts: HeroFacts; concept: SourceDesignConcept; direction: string; /** The run model: used when `heroModel` is absent, and once more when the provider rejects `heroModel`. */ model: SourceModel; /** The model the hero is written on (e.g. gpt-5.6-luna); metering records whichever model actually answered. */ heroModel?: SourceModel; provider: { endpoint: string; name: string }; apiKey: string; budget: SourceRequestBudget; signal: AbortSignal; attempts: DesignPlanningAttempt[]; /** Meters each call (attempt.model is the model called), like the planner's record; a failure here never costs the card. */ record?: (body: unknown, attempt: DesignPlanningAttempt) => Promise<unknown> }): Promise<{ html: string; source: 'model' | 'template' }> {
  const { facts } = input;
  const caps = HERO_CAPS[facts.mode === 'bold' ? 'bold' : 'calm'];
  const prompt = [
    'Write ONLY the header and the first screen (hero) of this storefront as one self-contained HTML fragment: a <style> block followed by markup. No <script>, no external URLs, no event handlers. It is a preview card, so nothing needs to work; it must look like the real store.',
    `Put the whole store name inside one [data-store-name] element. Load fonts exactly like this: ${heroFontFaces(facts.fonts)}`,
    `Use these colours: background ${facts.palette.paper}, text ${facts.palette.ink}, accent ${facts.palette.accent}, panels ${facts.palette.accent2}.`,
    facts.photoPath ? `Use this real photo where the hero needs one: ${facts.photoPath}` : 'There is no photo: make the hero typographic or drawn, never a placeholder image.',
    facts.logoPath ? `The logo image is ${facts.logoPath}.` : 'There is no logo: set the store name in the display font as the logo.',
    `Real copy: store "${facts.storeName}", headline "${facts.headline}", line "${facts.line}", action "${facts.action}". The header shows navigation, Buscar, Mi cuenta and a cart.`,
    'It must work at 1280px and at 390px wide.',
    facts.mode === 'bold' ? intenseDirection(facts) : calmDirection(facts),
    input.direction,
    `Concept (reference data): ${JSON.stringify({ name: input.concept.name, opening: input.concept.opening, typography: input.concept.typography, imagery: input.concept.imagery, signature: input.concept.signature, story: input.concept.story && { eyebrow: input.concept.story.eyebrow, headline: input.concept.story.headline, primaryAction: input.concept.story.primaryAction } })}`,
  ].join('\n');
  /** One provider call, one attempt, one metering record. `retry`: the provider rejected this model, so another may answer.
   * `refused`: the provider refused the call itself (ChatGPT plan authorization or usage limit, quota), so it waits and tries again. */
  const call = async (model: SourceModel): Promise<{ html: string } | { retry: true } | { refused: true } | null> => {
    const attempt: DesignPlanningAttempt = { model, phase: 'design', durationMs: 0, status: 'FAILED', usage: null, reasoningEffort: 'low' };
    input.attempts.push(attempt);
    const started = Date.now();
    let body: any = null, rejected = false;
    try {
      const allocation = input.budget.reserve(model, Math.ceil(prompt.length / 3) + 500, caps.outputTokens, 500);
      try {
        const response = await fetch(input.provider.endpoint, { method: 'POST', signal: AbortSignal.any([input.signal, AbortSignal.timeout(caps.timeoutMs)]), headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, store: false, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], max_output_tokens: allocation.outputTokens, reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', name: 'style_hero', strict: true, schema: HERO_SCHEMA } } }) });
        const text = await response.text().catch(() => '');
        try { body = JSON.parse(text); } catch { body = null; }
        rejected = modelRejected(response.status, text);
        checkSourceProviderQuota(response.status, body, input.provider.name);
        if (!response.ok || body?.status !== 'completed') throw new BadGatewayException(rejected ? `modelo rechazado (${response.status})` : 'hero incompleto');
      } finally { allocation.settle(body?.usage); }
      attempt.usage = sourceUsage(model, body?.usage);
      const html = sanitizeHeroHtml((sourceResponseJson(body) as { html?: string })?.html ?? '');
      if (!html) throw new Error('hero inutilizable');
      attempt.status = 'COMPLETED';
      return { html };
    } catch (error) {
      input.signal.throwIfAborted();
      attempt.failureReason = (error instanceof Error ? error.message : 'hero falló').slice(0, 300);
      attempt.usage ??= sourceUsage(model, body?.usage);
      return isProviderRejection(error) ? { refused: true } : rejected ? { retry: true } : null;
    } finally {
      attempt.durationMs = Date.now() - started;
      await Promise.resolve().then(() => input.record?.(body, attempt)).catch(() => undefined);
    }
  };
  // The intense hero is always written on the run model; the calm one on the fast model when one is given.
  const first = facts.mode === 'bold' ? input.model : input.heroModel ?? input.model;
  let result = await call(first);
  // A refused call (the bridge allows about two at once) waits 3 s and is tried once more, on the same model.
  if (result && 'refused' in result) { await providerRetryPause(input.signal); result = await call(first); }
  // The bridge may not offer the fast model: one more try on the run model, never a loop.
  if (result && 'retry' in result && first !== input.model) result = await call(input.model);
  return result && 'html' in result ? { html: result.html, source: 'model' } : { html: templateHero(facts), source: 'template' };
}
