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

export type HeroFacts = { storeName: string; logoPath?: string; photoPath?: string; headline: string; line: string; action: string; palette: { paper: string; ink: string; accent: string; accent2: string }; fonts: { display: string; text: string }; mode: 'calm' | 'bold' };

const MAX_HERO = 40_000;
const escape = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const fontOf = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id) ?? SOURCE_FONT_CATALOG.find(font => font.id === 'instrument')!;
// Local paths only: the kit's assets/, uploads and inline images. Everything else is dropped.
const LOCAL_URL = /^(assets\/[\w./-]+|\/v1\/uploads\/[\w.-]+|data:image\/(png|jpe?g|webp|svg\+xml)[;,])/i;
const BLOCKED = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'frame', 'frameset', 'noscript', 'template', 'animate', 'set', 'animatemotion', 'animatetransform', 'discard', 'foreignobject']);
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
        if (text.value.includes('\\')) return false;
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
    const out = serialize(fragment).trim();
    const inert = out.replace(/\sxmlns(:[\w-]+)?\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/data:image\/[^"')\s]*/gi, '');
    if (/\b(?:https?|ftp|wss?):/i.test(inert) || /(?:^|[\s"'(=,>])\/\/[^\s"'/]/.test(inert)) return null;
    return out && /data-store-name/.test(out) ? out : null;
  } catch { return null; }
}

export function templateHero(facts: HeroFacts): string {
  const display = fontOf(facts.fonts.display), text = fontOf(facts.fonts.text);
  const color = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const p = { paper: color(facts.palette.paper, '#ffffff'), ink: color(facts.palette.ink, '#111111'), accent: color(facts.palette.accent, '#111111'), accent2: color(facts.palette.accent2, '#f2f2f2') };
  const photo = facts.photoPath ? `<img class="th-photo" src="${escape(facts.photoPath)}" alt="">` : '';
  const logo = facts.logoPath ? `<img class="th-logo" src="${escape(facts.logoPath)}" alt="">` : '';
  const big = facts.mode === 'bold' ? 'clamp(48px,8vw,112px)' : 'clamp(34px,5vw,64px)';
  return `<style>${heroFontFaces(facts.fonts)}
.th{background:${p.paper};color:${p.ink};font-family:"${text.family}",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column}
.th-bar{display:flex;align-items:center;justify-content:space-between;padding:20px 5vw;gap:16px}
.th-name{font-family:"${display.family}",serif;font-size:22px;display:flex;align-items:center;gap:10px}.th-logo{height:36px;width:auto}
.th-nav{display:flex;gap:20px;font-size:15px}.th-main{flex:1;display:grid;grid-template-columns:${photo ? '1.1fr 1fr' : '1fr'};align-items:center;gap:5vw;padding:4vw 5vw}
.th h1{font-family:"${display.family}",serif;font-size:${big};line-height:1.02;margin:0 0 18px;text-wrap:balance}.th p{font-size:18px;max-width:46ch;margin:0 0 28px}
.th-cta{display:inline-block;background:${p.accent};color:${p.paper};padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:600}
.th-photo{width:100%;height:min(70vh,620px);object-fit:cover;border-radius:${facts.mode === 'bold' ? '0' : '12px'}}
@media (max-width:640px){.th-main{grid-template-columns:1fr}.th-nav{display:none}}</style>
<div class="th"><header class="th-bar"><span class="th-name">${logo}<span data-store-name>${escape(facts.storeName)}</span></span><nav class="th-nav"><a href="#">Productos</a><a href="#">Nosotros</a><a href="#">Contacto</a></nav><span>Carrito (0)</span></header>
<section class="th-main"><div><h1>${escape(facts.headline)}</h1><p>${escape(facts.line)}</p><a class="th-cta" href="#">${escape(facts.action)}</a></div>${photo}</section></div>`;
}

const HERO_SCHEMA = { type: 'object', additionalProperties: false, required: ['html'], properties: { html: { type: 'string' } } };

export async function writeStyleHero(input: { facts: HeroFacts; concept: SourceDesignConcept; direction: string; model: SourceModel; provider: { endpoint: string; name: string }; apiKey: string; budget: SourceRequestBudget; signal: AbortSignal; attempts: DesignPlanningAttempt[] }): Promise<{ html: string; source: 'model' | 'template' }> {
  const { facts } = input;
  const prompt = [
    'Write ONLY the header and the first screen (hero) of this storefront as one self-contained HTML fragment: a <style> block followed by markup. No <script>, no external URLs, no event handlers. It is a preview card, so nothing needs to work; it must look like the real store.',
    `Put the whole store name inside one [data-store-name] element. Load fonts exactly like this: ${heroFontFaces(facts.fonts)}`,
    `Use these colours: background ${facts.palette.paper}, text ${facts.palette.ink}, accent ${facts.palette.accent}, panels ${facts.palette.accent2}.`,
    facts.photoPath ? `Use this real photo where the hero needs one: ${facts.photoPath}` : 'There is no photo: make the hero typographic or drawn, never a placeholder image.',
    facts.logoPath ? `The logo image is ${facts.logoPath}.` : 'There is no logo: set the store name in the display font as the logo.',
    `Real copy: store "${facts.storeName}", headline "${facts.headline}", line "${facts.line}", action "${facts.action}". The header shows navigation, Buscar, Mi cuenta and a cart.`,
    `It must work at 1280px and at 390px wide. ${facts.mode === 'bold' ? 'This card is bold: poster type, colour fields, one memorable device.' : 'This card is calm: a normal, professionally made website of this kind.'}`,
    input.direction,
    `Concept (reference data): ${JSON.stringify({ name: input.concept.name, opening: input.concept.opening, typography: input.concept.typography, imagery: input.concept.imagery, signature: input.concept.signature, story: input.concept.story && { eyebrow: input.concept.story.eyebrow, headline: input.concept.story.headline, primaryAction: input.concept.story.primaryAction } })}`,
  ].join('\n');
  const attempt: DesignPlanningAttempt = { model: input.model, phase: 'design', durationMs: 0, status: 'FAILED', usage: null, reasoningEffort: 'low' };
  input.attempts.push(attempt);
  const started = Date.now();
  let body: any = null;
  try {
    const allocation = input.budget.reserve(input.model, Math.ceil(prompt.length / 3) + 500, 9000, 500);
    try {
      const response = await fetch(input.provider.endpoint, { method: 'POST', signal: AbortSignal.any([input.signal, AbortSignal.timeout(180_000)]), headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: input.model, store: false, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], max_output_tokens: allocation.outputTokens, reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', name: 'style_hero', strict: true, schema: HERO_SCHEMA } } }) });
      body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== 'completed') throw new BadGatewayException('hero incompleto');
    } finally { allocation.settle(body?.usage); }
    attempt.usage = sourceUsage(input.model, body?.usage);
    const html = sanitizeHeroHtml((sourceResponseJson(body) as { html?: string })?.html ?? '');
    if (!html) throw new Error('hero inutilizable');
    attempt.status = 'COMPLETED';
    return { html, source: 'model' };
  } catch (error) {
    input.signal.throwIfAborted();
    attempt.failureReason = (error instanceof Error ? error.message : 'hero falló').slice(0, 300);
    attempt.usage ??= sourceUsage(input.model, body?.usage);
    return { html: templateHero(facts), source: 'template' };
  } finally { attempt.durationMs = Date.now() - started; }
}
