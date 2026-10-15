/**
 * «Datos que YAPI supuso» (spec 2026-10-14 store voice, part 5): the facts the sheet assumed, where they appear, and the three
 * actions on them. Pure. Confirmar and Editar are normal saves with no model call (store-voice.service.ts); Quitar is a short YAPI
 * edit whose instruction is written here. The publish gate's message and check row live here too.
 */
import { parse } from 'parse5';
import { pageText } from './copy-check';
import { assumedIdsByPage, authoredPages, foldText, readVoice, VOICE_LIMITS, withVoiceFile, type AssumedFact, type AssumedKind, type AssumedStatus } from './store-voice';

export type AssumedFactView = { id: string; text: string; kind: AssumedKind; status: AssumedStatus; pages: string[]; unwrapped: string[] };
/** A Quitar edit is one short local edit: this caps its credits. */
export const ASSUMED_REMOVAL_MAX_CREDITS = 40;

type Files = ReadonlyArray<{ path: string; content: string; encoding?: string }>;
/** Every fact the sheet still lists, the authored pages that mark it, and the ones that state its text without the mark. */
export function assumedFactsView(files: Files): AssumedFactView[] {
  const voice = readVoice(files);
  if (!voice) return [];
  const marked = assumedIdsByPage(files);
  const bare = authoredPages(files).map(file => ({ path: file.path, text: foldText(pageText(file.path, file.content, file.path === 'index.html').bare.join(' ')) }));
  return voice.assumed.map(fact => ({
    ...fact,
    pages: [...marked].filter(([, ids]) => ids.includes(fact.id)).map(([path]) => path),
    unwrapped: bare.filter(page => page.text.includes(foldText(fact.text))).map(page => page.path),
  }));
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char]);
type LocatedNode = { nodeName: string; tagName?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: LocatedNode[]; content?: { childNodes?: LocatedNode[] }; sourceCodeLocation?: { startTag?: { endOffset: number }; endTag?: { startOffset: number } } | null };
/** Editar: the content of every <span data-assumed="id"> replaced by the merchant's text, escaped, with no model call. The page is
 *  parsed, so only a real span's content changes: never an attribute, a script string, a comment or text outside the span. */
export function replaceAssumedText(html: string, id: string, text: string): { html: string; count: number } {
  const ranges: Array<[number, number]> = [];
  const walk = (node: LocatedNode, inside: boolean) => {
    for (const child of [...(node.childNodes ?? []), ...(node.content?.childNodes ?? [])]) {
      const match = child.tagName === 'span' && Boolean(child.attrs?.some(attr => attr.name === 'data-assumed' && attr.value === id));
      const location = child.sourceCodeLocation;
      if (match && !inside && location?.startTag && location.endTag) ranges.push([location.startTag.endOffset, location.endTag.startOffset]);
      walk(child, inside || match);
    }
  };
  walk(parse(html, { sourceCodeLocationInfo: true }) as unknown as LocatedNode, false);
  let out = html;
  for (const [start, end] of [...ranges].sort((a, b) => b[0] - a[0])) out = `${out.slice(0, start)}${escapeHtml(text)}${out.slice(end)}`;
  return { html: out, count: ranges.length };
}

/** The merchant's true text for a fact: one line, at most 160 characters, no markup. */
export function cleanFactText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text && text.length <= VOICE_LIMITS.assumedText && !/[<>]/.test(text) ? text : undefined;
}

/** voice.json with one fact's status (and, for Editar, its text) changed; undefined when the sheet does not list it. */
export function withAssumedStatus<T extends { path: string; content: string; encoding?: string }>(files: T[], id: string, status: AssumedStatus, text?: string): T[] | undefined {
  const voice = readVoice(files);
  if (!voice?.assumed.some(fact => fact.id === id)) return undefined;
  return withVoiceFile(files, { ...voice, assumed: voice.assumed.map(fact => (fact.id === id ? { ...fact, status, ...(text ? { text } : {}) } : fact)) });
}

/** Editar: every marked copy replaced on every page and the fact confirmed with the merchant's text, in one set of files. */
export function withAssumedEdit<T extends { path: string; content: string; encoding?: string }>(files: T[], id: string, text: string): { files: T[]; replaced: number } | undefined {
  const confirmed = withAssumedStatus(files, id, 'confirmed', text);
  if (!confirmed) return undefined;
  let replaced = 0;
  const edited = confirmed.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path)) return file;
    const result = replaceAssumedText(file.content, id, text);
    replaced += result.count;
    return result.count ? { ...file, content: result.html } : file;
  });
  return { files: edited, replaced };
}

/** Quitar: the local chat edit's instruction. Naming the pages makes the edit read exactly those (sourceTaskContext). */
export function assumedRemovalInstruction(fact: Pick<AssumedFactView, 'id' | 'text' | 'pages'>): string {
  const pages = fact.pages.length ? fact.pages.join(', ') : 'index.html';
  return `Quita de la tienda el dato «${fact.text}»: YAPI lo supuso y el comercio no lo confirmó. Está marcado con <span data-assumed="${fact.id}"> en ${pages}. Reescribe cada frase que lo usa para que diga lo mismo sin ese dato y sin inventar otro, y quita ese <span data-assumed="${fact.id}"> (deja solo el texto nuevo). No cambies nada más de la tienda.`;
}

/** The publish gate's message (spec part 5): the facts listed, with where to settle them. */
export function assumedFactsBlockMessage(pending: ReadonlyArray<Pick<AssumedFact, 'text'>>): string {
  const one = pending.length === 1;
  return `Antes de publicar, confirma, corrige o quita ${one ? 'el dato' : `los ${pending.length} datos`} que YAPI supuso: ${pending.map(fact => `«${fact.text}»`).join(', ')}. ${one ? 'Está' : 'Están'} en «Datos que YAPI supuso».`;
}
export function assumedFactsCheckRow(pending: ReadonlyArray<Pick<AssumedFact, 'text'>>): { label: 'Datos que YAPI supuso'; status: 'failed'; blocking: true; detail: string } {
  return { label: 'Datos que YAPI supuso', status: 'failed', blocking: true, detail: assumedFactsBlockMessage(pending) };
}
