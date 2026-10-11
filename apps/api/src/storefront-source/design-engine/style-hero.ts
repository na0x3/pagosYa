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

export type HeroFacts = { storeName: string; logoPath?: string; photoPath?: string; headline: string; line: string; action: string; palette: { paper: string; ink: string; accent: string; accent2: string }; fonts: { display: string; text: string }; mode: 'calm' | 'bold';
  /** The concept's eyebrow (story.eyebrow), shown uppercase and tracked above the intense card's headline. */
  eyebrow?: string;
  /** The calm card's playbook family: its button shapes (first = the template's) and its corner radius. */
  buttons?: string[]; radius?: string };

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
const ARROW = '<svg class="ty-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

export function templateHero(facts: HeroFacts): string {
  if (facts.mode === 'bold') return intenseTemplateHero(facts);
  const display = fontOf(facts.fonts.display), text = fontOf(facts.fonts.text);
  const p = { paper: hexColour(facts.palette.paper, '#ffffff'), ink: hexColour(facts.palette.ink, '#111111'), accent: hexColour(facts.palette.accent, '#111111'), accent2: hexColour(facts.palette.accent2, '#f2f2f2') };
  const photo = facts.photoPath ? `<img class="th-photo" src="${escape(facts.photoPath)}" alt="">` : '';
  const logo = facts.logoPath ? `<img class="th-logo" src="${escape(facts.logoPath)}" alt="">` : '';
  // The family's own button shape and radius, with a small offset: never a default button.
  const radius = facts.radius === 'square' ? '2px' : facts.radius === 'soft' ? '10px' : '6px';
  const form = facts.buttons?.[0] ?? 'pill';
  const button = form === 'outline' ? `background:transparent;color:${p.accent};border:2px solid ${p.accent};border-radius:${radius};box-shadow:3px 3px 0 ${p.accent2}`
    : form === 'underline' ? `background:transparent;color:${p.ink};border:0;border-bottom:2px solid ${p.accent};border-radius:0;padding:8px 0`
    : `background:${p.accent};color:${p.paper};border:2px solid ${p.accent};border-radius:${form === 'pill' ? '999px' : radius};box-shadow:3px 3px 0 ${p.accent2}`;
  return `<style>${heroFontFaces(facts.fonts)}
.th{background:${p.paper};color:${p.ink};font-family:"${text.family}",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column}
.th-bar{display:flex;align-items:center;justify-content:space-between;padding:20px 5vw;gap:16px}
.th-name{font-family:"${display.family}",serif;font-size:22px;display:flex;align-items:center;gap:10px}.th-logo{height:36px;width:auto}
.th-nav{display:flex;gap:20px;font-size:15px}.th-main{flex:1;display:grid;grid-template-columns:${photo ? '1.1fr 1fr' : '1fr'};align-items:center;gap:5vw;padding:4vw 5vw}
.th h1{font-family:"${display.family}",serif;font-size:clamp(34px,5vw,64px);line-height:1.02;margin:0 0 18px;text-wrap:balance}.th p{font-size:18px;max-width:46ch;margin:0 0 28px}
.th-cta{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;text-decoration:none;font-weight:600;${button}}
.th-photo{width:100%;height:min(70vh,620px);object-fit:cover;border-radius:12px}
@media (max-width:640px){.th-main{grid-template-columns:1fr}.th-nav{display:none}}</style>
<div class="th"><header class="th-bar"><span class="th-name">${logo}<span data-store-name>${escape(facts.storeName)}</span></span><nav class="th-nav"><a href="#">Productos</a><a href="#">Nosotros</a><a href="#">Contacto</a></nav><span>Carrito (0)</span></header>
<section class="th-main"><div><h1>${escape(facts.headline)}</h1><p>${escape(facts.line)}</p><a class="th-cta" href="#">${escape(facts.action)} <span aria-hidden="true">→</span></a></div>${photo}</section></div>`;
}

/** The intense card's template (spec amendment "two cards"), after the owner's reference store: a dark side rail with the
 * name rotated, a tilted photo in a thick white frame with a hard offset shadow (a giant type field without a photo), a
 * rotating SVG stamp of the store's name, a giant tight headline and an arrow pill with an accent offset shadow. */
function intenseTemplateHero(facts: HeroFacts): string {
  const display = fontOf(facts.fonts.display), text = fontOf(facts.fonts.text);
  const p = { paper: hexColour(facts.palette.paper, '#f2b705'), ink: hexColour(facts.palette.ink, '#111111'), accent: hexColour(facts.palette.accent, '#e5371f'), accent2: hexColour(facts.palette.accent2, '#fff6d6') };
  const dark = luminance(p.paper) < 0.35;
  // A black shadow and button on a light colour field; on a dark one they take the light ink, so they still read.
  const hard = dark ? p.accent : '#111111';
  const fill = dark ? p.ink : '#111111', fillText = dark ? p.paper : '#ffffff';
  const buttonShadow = p.accent.toLowerCase() === fill.toLowerCase() ? p.accent2 : p.accent;
  const upper = facts.storeName.toUpperCase();
  const ring = Array.from({ length: Math.max(1, Math.round(34 / (upper.length + 3))) }, () => `${upper} · `).join('');
  const logo = facts.logoPath ? `<img class="ty-logo" src="${escape(facts.logoPath)}" alt="">` : '';
  const words = facts.storeName.split(/\s+/).filter(Boolean).slice(0, 3);
  const art = facts.photoPath
    ? `<figure class="ty-frame"><img class="ty-photo" src="${escape(facts.photoPath)}" alt=""></figure>`
    : `<div class="ty-type" aria-hidden="true">${(words.length ? words : [facts.storeName]).map(word => `<span>${escape(word)}</span>`).join('')}</div>`;
  const stamp = `<svg class="ty-stamp" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="ty-ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"></path></defs><circle cx="100" cy="100" r="98" fill="${p.accent2}"></circle><circle cx="100" cy="100" r="46" fill="${p.accent}"></circle><text font-size="16" font-weight="700" letter-spacing="3" fill="${luminance(p.accent2) < 0.4 ? '#ffffff' : '#111111'}"><textPath href="#ty-ring">${escape(ring)}</textPath></text></svg>`;
  return `<style>${heroFontFaces(facts.fonts)}
.ty{background:${p.paper};color:${p.ink};font-family:"${text.family}",system-ui,sans-serif;min-height:100vh;display:grid;grid-template-columns:96px 1fr;overflow:hidden}
.ty-rail{background:${fill};color:${fillText};display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:24px;padding:28px 0}
.ty-logo{width:48px;height:auto}
.ty-name{font-family:"${display.family}",sans-serif;font-weight:800;font-size:26px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg)}
.ty-nav{display:flex;gap:18px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg)}.ty-nav a{color:inherit;text-decoration:none}
.ty-cart{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.ty-main{display:grid;grid-template-columns:1.05fr 1fr;align-items:center;gap:5vw;padding:6vw 6vw 6vw 5vw}
.ty-eyebrow{font-size:13px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;margin:0 0 22px}
.ty h1{font-family:"${display.family}",sans-serif;font-size:clamp(64px,10vw,140px);line-height:.9;letter-spacing:-0.04em;font-weight:900;margin:0 0 24px;overflow-wrap:normal;word-break:normal;hyphens:manual}
.ty-line{font-size:19px;max-width:40ch;margin:0 0 34px}
.ty-cta{display:inline-flex;align-items:center;gap:14px;background:${fill};color:${fillText};padding:18px 30px;font-size:17px;font-weight:700;text-decoration:none;border-radius:999px;box-shadow:6px 6px 0 ${buttonShadow}}.ty-arrow{width:22px;height:22px}
.ty-art{position:relative;justify-self:center;width:min(100%,520px)}
.ty-frame{margin:0;background:#ffffff;padding:16px;transform:rotate(-3deg);box-shadow:16px 16px 0 ${hard}}
.ty-photo{display:block;width:100%;height:min(62vh,560px);object-fit:cover}
.ty-type{display:flex;flex-direction:column;background:${p.accent};color:${p.paper};padding:36px;transform:rotate(-3deg);box-shadow:16px 16px 0 ${hard};font-family:"${display.family}",sans-serif;font-weight:900;font-size:clamp(56px,8vw,120px);line-height:.88;letter-spacing:-0.04em;text-transform:uppercase;overflow-wrap:normal}.ty-type span:nth-child(2n){color:${p.ink}}
.ty-stamp{position:absolute;width:150px;height:150px;top:-48px;right:-36px;animation:ty-spin 24s linear infinite}
@keyframes ty-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ty-stamp{animation:none}}
@media (max-width:640px){.ty{grid-template-columns:1fr}.ty-rail{flex-direction:row;padding:14px 18px}.ty-name{writing-mode:horizontal-tb;transform:none;font-size:20px}.ty-nav{display:none}.ty-main{grid-template-columns:1fr;padding:32px 18px 56px}.ty h1{font-size:clamp(40px,12vw,64px)}.ty-stamp{width:104px;height:104px;top:-30px;right:-6px}}</style>
<div class="ty"><header class="ty-rail">${logo}<span class="ty-name" data-store-name>${escape(facts.storeName)}</span><nav class="ty-nav"><a href="#">Productos</a><a href="#">Nosotros</a><a href="#">Contacto</a></nav><span class="ty-cart">Carrito (0)</span></header>
<section class="ty-main"><div><p class="ty-eyebrow">${escape(facts.eyebrow?.trim() || facts.storeName)}</p><h1>${escape(facts.headline)}</h1><p class="ty-line">${escape(facts.line)}</p><a class="ty-cta" href="#">${escape(facts.action)} ${ARROW}</a></div><div class="ty-art">${art}${stamp}</div></section></div>`;
}

const HERO_SCHEMA = { type: 'object', additionalProperties: false, required: ['html'], properties: { html: { type: 'string' } } };

/** A 400/404 that names the model: the provider (or the ChatGPT bridge) does not offer the fast hero model. */
const modelRejected = (status: number, text: string) => (status === 400 || status === 404) && /model/i.test(text);

/** The calm hero is a short fragment on the fast model (spec 2026-10-11 speed-up): small cap, short timeout. The intense
 * hero carries more devices, so it is written on the run model with more room (the bridge itself stops a call at 240 s). */
const HERO_CAPS = { calm: { outputTokens: 4000, timeoutMs: 120_000 }, bold: { outputTokens: 7000, timeoutMs: 200_000 } } as const;

/** The intense card's art direction (spec amendment "two cards"): the reference store's devices, each one required. */
function intenseDirection(facts: HeroFacts): string {
  const { ink, accent } = facts.palette;
  return [
    "This card is INTENSE: the bold option shown next to a calm one, a poster-like shop with a strong point of view. Every move below is required, made in this card's colours, fonts and the store's own words:",
    "- HEADER (required): an unusual header taken from this card's frame draw below, e.g. a dark vertical side rail with the store name rotated 90 degrees, a giant wordmark across the top, or a header laid over the photo; never a plain bar of links.",
    facts.photoPath
      ? `- PHOTO (required): the real photo large, in a thick frame (14-20px of white or the panel colour), rotated 2-4 degrees, with a hard offset shadow (no blur, e.g. box-shadow: 16px 16px 0 ${ink}).`
      : "- PHOTO (required): there is no photo, so make a giant type collage of the store's own words on blocks of colour instead, rotated a few degrees, with a hard offset shadow (no blur).",
    `- STAMP (required): a circular rotating-text stamp overlapping a corner of the photo, drawn as inline SVG: <svg viewBox="0 0 200 200"><defs><path id="stamp-ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"/></defs><text><textPath href="#stamp-ring">...</textPath></text></svg>, turned slowly by a CSS animation. Its text uses only the store's own words: the store name, its city and what it sells, e.g. "${facts.storeName.toUpperCase()} · " and then the city or the product when the brief names them. Never invent a fact, a date or a place.`,
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
