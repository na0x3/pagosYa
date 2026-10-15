/**
 * The copy check (spec 2026-10-14 store voice, part 4). Pure: the store's files, its voice sheet, every source of fact and the
 * text of sibling stores in, findings out. It reads what a visitor reads on each page YAPI wrote (no scripts, styles, templates,
 * hidden elements or header) and flags generic phrases, echoes of the merchant's words, repeats, narrated missing data and facts
 * with no source. It never blocks a build: the background review rewrites the lines it lists, and what is left is logged.
 */
import { parse } from 'parse5';
import { PLAYBOOK, type PlaybookKind } from './design-engine/playbook';
import { FILLER } from './sketch/sketch-specificity';
import { SOURCE_EMPTY_COPY_WORDS } from './source-signature';
import { authoredPages, foldText, type StoreVoice } from './store-voice';

/** The spec's seed list: phrases that would be true of any store on the platform. */
export const SHARED_AVOID: readonly string[] = ['calidad que se nota', 'hecho con amor', 'Descubre', 'Eleva', 'Vive la experiencia', 'sin apuro', 'a otro nivel', 'experiencia única', 'pasión por', 'lo mejor para ti'];
/** Writing rule 4: checkout steps and the platform's name belong to the kit and the footer, never to the store's copy. */
export const PLATFORM_MECHANICS: readonly string[] = ['pagosYa', 'al carrito', 'continúa al pago', 'el pago se completa', 'la plataforma'];
/** Writing rule 1 allows 6 consecutive words of the merchant's text; 7 is an echo. */
export const ECHO_WORDS = 7;
/** Writing rule 2, on folded text: the ways the 2026-10-14 stores narrated data they did not have. */
export const MISSING_DATA_PATTERNS: readonly RegExp[] = [
  /\baun no\b/,
  /\btodavia (?:no|debe|esta|estan|falta)\b/,
  /\b(?:publicad|configurad|definid|confirmad)[oa]s? todavia\b/,
  /\bse confirmar(?:a|an)\b/, /\bdebe confirmarse\b/, /\bse confirma al\b/, /\bpor confirmar\b/,
  /\baparecer(?:a|an) aqui\b/,
  /\bno hay\b[^.]{0,60}\b(?:publicad|configurad|definid)/,
  /\b(?:sin|no)\b[^.]{0,50}\b(?:publicad|configurad)[oa]s?\b/,
  /\bpendiente de (?:configuracion|confirmacion|publicacion)\b/,
  /\bcuando (?:este|esten) (?:definid|configurad|confirmad|disponible)/,
  /\bproximamente\b/, /\bprovisional\b/,
];

export type CopyFindingKind = 'avoid' | 'echo' | 'repeat' | 'missing' | 'unsourced';
export type CopyFinding = { kind: CopyFindingKind; page: string; line: string; problem: string };
export type CopyCheckInput = {
  files: ReadonlyArray<{ path: string; content: string; encoding?: string }>;
  voice?: StoreVoice;
  kind?: PlaybookKind;
  /** The merchant's own words: chat messages, onboarding answers, what/story, and the brief text that repeats them. */
  merchantText: readonly string[];
  /** Every other place a fact may come from: the public store data, the Store Brain, photo descriptions. */
  sources: readonly string[];
  /** Real product, variant, extra and membership prices, in bolivianos (Bs 25 is 25). */
  prices: readonly number[];
  /** Visible sentences of the six most recent sibling and same-kind stores. */
  siblings: readonly string[];
};

/** The shared list, the agent's empty copy words, the sketch filler, the kind's list and the sheet's own, each once. */
export function avoidPhrases(kind?: PlaybookKind, voice?: StoreVoice): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...SHARED_AVOID, ...SOURCE_EMPTY_COPY_WORDS, ...FILLER, ...(kind ? PLAYBOOK[kind].avoid : []), ...(voice?.avoid ?? [])]) {
    const phrase = raw.trim(), key = foldText(phrase);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A phrase as a whole-word pattern over folded text: «Eleva» never matches «elevador», «pasión por» matches «PASION POR». */
export function phrasePattern(phrase: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(foldText(phrase.trim())).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'u');
}

type HtmlNode = { nodeName: string; tagName?: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: HtmlNode[] };
// Only the platform header is chrome; a section's own <header> holds authored copy (final review 2026-10-15).
const SKIP = new Set(['head', 'script', 'style', 'template', 'noscript', 'svg']);
const CHROME = new Set(['footer', 'nav']);
const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'dt', 'dd', 'td', 'th', 'figcaption', 'blockquote', 'div', 'section', 'article', 'main', 'aside', 'footer', 'nav', 'ul', 'ol', 'dl', 'table', 'tr', 'form', 'label', 'button', 'br', 'figure']);
export type PageText = { page: string; blocks: string[]; bare: string[]; assumedIds: string[] };
/** A page's visible text by block. `bare` is the same blocks with every data-assumed span's text taken out. `chrome` false skips the
 *  footer and nav too: on pages other than the home they repeat the home's own. */
export function pageText(page: string, html: string, chrome = true): PageText {
  const blocks: string[] = [], bare: string[] = [], ids = new Set<string>();
  let text = '', plain = '';
  const flush = () => {
    const full = text.replace(/\s+/g, ' ').trim();
    if (full) { blocks.push(full); bare.push(plain.replace(/\s+/g, ' ').trim()); }
    text = ''; plain = '';
  };
  const walk = (node: HtmlNode, assumed: boolean) => {
    if (node.nodeName === '#text') { text += node.value ?? ''; plain += assumed ? ' ' : node.value ?? ''; return; }
    const tag = node.tagName;
    if (tag && (SKIP.has(tag) || (!chrome && CHROME.has(tag)) || node.attrs?.some(attr => attr.name === 'hidden' || (tag === 'header' && attr.name === 'data-pagosya-header')))) return;
    const id = tag === 'span' ? node.attrs?.find(attr => attr.name === 'data-assumed')?.value : undefined;
    if (id) ids.add(id);
    const block = Boolean(tag && BLOCK.has(tag));
    if (block) flush();
    for (const child of node.childNodes ?? []) walk(child, assumed || Boolean(id));
    if (block) flush();
  };
  walk(parse(html) as unknown as HtmlNode, false);
  flush();
  return { page, blocks, bare, assumedIds: [...ids] };
}
const sentencesOf = (block: string) => block.split(/(?<=[.!?…])\s+/).map(sentence => sentence.trim()).filter(sentence => /\p{L}/u.test(sentence));
/** What a visitor reads on a page, sentence by sentence (sibling stores in SourceProjectsService.recentVoices). */
export function visibleSentences(html: string): string[] {
  return pageText('', html).blocks.flatMap(sentencesOf);
}

const wordsOf = (text: string) => foldText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const grams = (list: string[], size: number) => list.length < size ? [] : Array.from({ length: list.length - size + 1 }, (_, index) => list.slice(index, index + size).join(' '));
const normalized = (sentence: string) => wordsOf(sentence).join(' ');
const MONEY = /(?:\bBs\.?|\bBOB\b|\bUSD\b|\$)\s?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2})(?!\d))?/gi;
/** Money amounts written in a text, in bolivianos or dollars as written: «Bs 3.500» is 3500, «Bs 18,00» and «Bs 35.50» are 18 and 35.5; a three-digit group after . or , is thousands, a space never is. */
export function moneyIn(text: string): number[] {
  return [...text.matchAll(MONEY)].map(match => Number(match[1].replace(/[.,]/g, '')) + (match[2] ? Number(match[2].padEnd(2, '0')) / 100 : 0));
}
const UNIT = '(?:km|kilometros?|metros?|m|msnm|cuadras?|minutos?|min|horas?|h|dias?|anos?|kg|kilos?|g|gramos?|ml|litros?|l|%|hectareas?|ha)';
const ORIGIN = /(?:origen|proveniente|traíd[oa]s?|cultivad[oa]s?|cosechad[oa]s?|criad[oa]s?|tostad[oa]s?|hech[oa]s?|tejid[oa]s?|nacid[oa]s?)\s+(?:en|de|del|desde)\s+(?:la |el |los |las )?(\p{Lu}[\p{L}]+(?:\s\p{Lu}[\p{L}]+)*)/gu;
/** The fact-like tokens of a sentence (money taken out first): numbers with a unit, numbers of two or more digits (not step
 *  numbers like 01) and the place after an origin word. */
export function factTokens(sentence: string): string[] {
  const text = sentence.replace(MONEY, ' ');
  const folded = foldText(text);
  const tokens = new Set<string>();
  for (const match of folded.matchAll(new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s?${UNIT}(?![a-z])`, 'g'))) tokens.add(match[0]);
  for (const match of folded.matchAll(/\b\d{2,}(?:[.,]\d+)?\b/g)) if (!/^0\d$/.test(match[0])) tokens.add(match[0]);
  for (const match of text.matchAll(ORIGIN)) tokens.add(match[1]);
  return [...tokens];
}
/** Every real price a page may state, in bolivianos: products, their variants and extras, membership periods. */
export function storePrices(items: ReadonlyArray<unknown>): number[] {
  const prices = new Set<number>();
  const add = (amount: unknown) => { if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) prices.add(amount / 100); };
  for (const raw of items) {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    add(item.amount);
    for (const list of [item.variants, item.extras, item.membershipPeriods]) for (const entry of Array.isArray(list) ? list : []) add((entry as { amount?: unknown } | null)?.amount);
  }
  return [...prices];
}

export function checkCopy(input: CopyCheckInput): CopyFinding[] {
  const findings: CopyFinding[] = [];
  const seen = new Set<string>();
  const add = (kind: CopyFindingKind, page: string, line: string, problem: string) => {
    const key = `${kind}|${page}|${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ kind, page, line: line.slice(0, 200), problem });
  };
  const pages = authoredPages(input.files).map(file => pageText(file.path, file.content, file.path === 'index.html'));
  const avoid = avoidPhrases(input.kind, input.voice).map(phrase => ({ phrase, pattern: phrasePattern(phrase) }));
  const mechanics = PLATFORM_MECHANICS.map(phrase => ({ phrase, pattern: phrasePattern(phrase) }));
  const echoes = new Set(input.merchantText.flatMap(text => grams(wordsOf(text), ECHO_WORDS)));
  const voice = input.voice;
  // The sheet sources a fact only through what it states as true: its line, specifics, texture and words. Its assumed facts
  // are sourced only inside their own data-assumed spans.
  const sourced = foldText([...input.sources, ...input.merchantText, ...(voice ? [voice.voice, ...voice.specifics.map(entry => entry.text), ...voice.texture, ...Object.values(voice.words)] : [])].join('\n'));
  const assumedTexts = (voice?.assumed ?? []).map(fact => foldText(fact.text));
  const knownIds = new Set([...(voice?.assumed ?? []), ...(voice?.specifics ?? [])].map(entry => entry.id));
  const siblings = new Set(input.siblings.map(normalized).filter(sentence => sentence.split(' ').length >= 5));
  const counts = new Map<string, number>();
  for (const page of pages) for (const block of page.blocks) for (const sentence of sentencesOf(block)) {
    const key = normalized(sentence);
    if (key.split(' ').length >= 5) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const page of pages) {
    for (const id of page.assumedIds) if (!knownIds.has(id)) add('unsourced', page.page, `data-assumed="${id}"`, `data-assumed="${id}" no está en la hoja de voz`);
    page.blocks.forEach((block, index) => {
      for (const sentence of sentencesOf(block)) {
        const folded = foldText(sentence);
        for (const { phrase, pattern } of avoid) if (pattern.test(folded)) add('avoid', page.page, sentence, `frase genérica «${phrase}»`);
        for (const { phrase, pattern } of mechanics) if (pattern.test(folded)) add('avoid', page.page, sentence, `explica la compra o nombra la plataforma («${phrase}»)`);
        if (grams(wordsOf(sentence), ECHO_WORDS).some(gram => echoes.has(gram))) add('echo', page.page, sentence, 'copia 7 o más palabras seguidas del texto del comercio');
        const key = normalized(sentence);
        if (key.split(' ').length >= 5 && (counts.get(key) ?? 0) > 1) add('repeat', page.page, sentence, 'la misma frase aparece dos veces en el sitio');
        if (key.split(' ').length >= 5 && siblings.has(key)) add('repeat', page.page, sentence, 'la misma frase aparece en otra tienda');
        if (MISSING_DATA_PATTERNS.some(pattern => pattern.test(folded))) add('missing', page.page, sentence, 'narra un dato que falta');
        for (const amount of moneyIn(sentence)) if (!input.prices.some(price => Math.abs(price - amount) < 0.005)) add('unsourced', page.page, sentence, `el monto Bs ${amount} no es el precio de un producto`);
      }
      for (const sentence of sentencesOf(page.bare[index] ?? '')) {
        for (const token of factTokens(sentence)) {
          const key = foldText(token);
          if (sourced.includes(key)) continue;
          add('unsourced', page.page, sentence, assumedTexts.some(text => text.includes(key)) ? `dato supuesto sin marcar con data-assumed («${token}»)` : `dato sin fuente («${token}»)`);
        }
      }
    });
  }
  return findings;
}

export function copyFindingCounts(findings: readonly CopyFinding[]): Record<CopyFindingKind, number> {
  const counts: Record<CopyFindingKind, number> = { avoid: 0, echo: 0, repeat: 0, missing: 0, unsourced: 0 };
  for (const finding of findings) counts[finding.kind]++;
  return counts;
}
/** The review's list (spec part 4: «línea: …; problema: frase genérica; reescribe con un specific de la hoja»). */
export function copyFindingLines(findings: readonly CopyFinding[], max = 12): string[] {
  return findings.slice(0, max).map(finding => `línea: «${finding.line}» (${finding.page}); problema: ${finding.problem}; reescribe con un specific o una textura de la hoja`);
}
