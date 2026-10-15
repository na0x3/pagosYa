/**
 * Store voice (spec docs/superpowers/specs/2026-10-14-store-voice-design.md, part 2): the voice sheet YAPI writes once per store
 * and every writer reads (the Sep-5 author and review, the product-page writer, the email designer, the chat notes and the
 * store-controls call). voice.json is a project file beside frame-draw.json, sanitized like config.look. Pure: the call that
 * writes it lives in store-voice-design.ts, the prompt text in store-voice-prompt.ts.
 */
export const VOICE_FILE = 'voice.json';
export const VOICE_LIMITS = { voice: 200, specifics: 8, specificText: 200, texture: 5, textureText: 120, assumed: 6, assumedText: 160, word: 40, avoid: 20, avoidText: 60 } as const;
export const SPECIFIC_SOURCES = ['merchant', 'product', 'photo', 'brain'] as const;
export const ASSUMED_KINDS = ['origin', 'number', 'history', 'process', 'place'] as const;
export const ASSUMED_STATUSES = ['assumed', 'confirmed'] as const;
export const VOICE_WORDS = ['products', 'customers', 'order', 'team'] as const;
export type SpecificSource = (typeof SPECIFIC_SOURCES)[number];
export type AssumedKind = (typeof ASSUMED_KINDS)[number];
export type AssumedStatus = (typeof ASSUMED_STATUSES)[number];
export type VoiceSpecific = { id: string; text: string; source: SpecificSource };
export type AssumedFact = { id: string; text: string; kind: AssumedKind; status: AssumedStatus };
export type StoreVoice = {
  version: 1;
  /** One sentence, at most 200 characters: how the store talks. */
  voice: string;
  specifics: VoiceSpecific[];
  /** Invented small images that cannot be wrong, at most 120 characters each. */
  texture: string[];
  /** Plausible facts YAPI assumed; each must be confirmed, corrected or removed before publishing. */
  assumed: AssumedFact[];
  /** The store's own nouns; `order` becomes the controls' cart word. */
  words: { products?: string; customers?: string; order?: string; team?: string };
  /** The store's own phrases to avoid; the shared list and the kind's list are added by code, not stored. */
  avoid: string[];
};
export type VoiceRejection = { field: string; text?: string; reason: string };
/** What a saved revision's sheet tells the chat reply (source-chat.service.ts revisionReply). */
export type VoiceReceipt = { pending: number; questions: string[] };

/** Ids travel into page markup as data-assumed="…", so only short lower-case slugs are ever kept. */
export const VOICE_ID = /^[a-z0-9-]{1,16}$/;
/** Accent- and case-folded: every comparison of Spanish text in the voice code goes through this. */
export const foldText = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function cleanText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text && text.length <= max && !/[<>]/.test(text) ? text : undefined;
}
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

/** Never invented, even as a tracked assumption (spec, owner decisions): money, reviews and quotes, health or results claims.
 *  Matched on folded text, so accents and case never let one through. */
export const NEVER_ASSUMED: ReadonlyArray<{ reason: string; pattern: RegExp }> = [
  { reason: 'precio, monto o descuento', pattern: /(?:\bbs\.?|\$|\busd\b|€)\s?\d|\d+(?:[.,]\d+)?\s?(?:%|por ?ciento\b|bs\b|bolivianos\b|dolares\b|usd\b|€)|\bpor ?ciento\b|\b(?:descuentos?|ofertas?|promocion|rebaja|gratis|precios?|cuesta|2x1|liquidacion)\b/ },
  { reason: 'reseña o cita', pattern: /[«»"“”‘’]|\b(?:testimonios?|resenas?|opinion|opiniones|opina|dijo|dicen|comento|recomiendan|estrellas|calificacion)\b/ },
  { reason: 'salud o resultados', pattern: /\b(?:cura|curan|curar|sana|sanar|alivia|aliviar|adelgaza\w*|baja(?:r)? de peso|perder peso|quema grasa|desintoxica\w*|detox|previene|prevenir|inmun\w*|antiinflamatori\w*|antioxidante\w*|clinicamente|comprobad\w*|garantiza\w*|resultados|saludables?)\b/ },
];
export function neverAssumedReason(text: string): string | undefined {
  const folded = foldText(text);
  return NEVER_ASSUMED.find(rule => rule.pattern.test(folded))?.reason;
}

const entriesOf = (list: unknown) => (Array.isArray(list) ? list : []).map(entry => (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>);

/** The sheet made safe, with what was rejected and why. A sheet without a usable voice line, or of another version, is rejected
 *  whole; anything else over its limits, with an unknown enum, markup or a repeated id is dropped on its own. */
export function sanitizeVoiceReport(raw: unknown): { voice?: StoreVoice; rejected: VoiceRejection[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { rejected: [{ field: 'voice', reason: 'no es una hoja de voz' }] };
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) return { rejected: [{ field: 'version', reason: 'versión desconocida' }] };
  const line = cleanText(value.voice, VOICE_LIMITS.voice);
  if (!line) return { rejected: [{ field: 'voice', reason: 'falta la voz o pasa de 200 caracteres' }] };
  const rejected: VoiceRejection[] = [];
  const ids = new Set<string>();
  const freshId = (id: unknown): id is string => typeof id === 'string' && VOICE_ID.test(id) && !ids.has(id);

  const specifics: VoiceSpecific[] = [];
  for (const entry of entriesOf(value.specifics)) {
    const id = entry.id, source = entry.source, text = cleanText(entry.text, VOICE_LIMITS.specificText);
    const quoted = typeof entry.text === 'string' ? entry.text : undefined;
    if (!freshId(id)) { rejected.push({ field: 'specifics', text: quoted, reason: 'id repetido o inválido' }); continue; }
    if (!text || !oneOf(SPECIFIC_SOURCES, source)) { rejected.push({ field: 'specifics', text: quoted, reason: 'texto o fuente inválidos' }); continue; }
    if (specifics.length === VOICE_LIMITS.specifics) { rejected.push({ field: 'specifics', text, reason: 'más de 8' }); continue; }
    ids.add(id);
    specifics.push({ id, text, source });
  }

  const texture: string[] = [];
  for (const entry of Array.isArray(value.texture) ? value.texture : []) {
    const text = cleanText(entry, VOICE_LIMITS.textureText);
    if (!text) { rejected.push({ field: 'texture', text: typeof entry === 'string' ? entry : undefined, reason: 'pasa de 120 caracteres o no es texto' }); continue; }
    if (texture.length === VOICE_LIMITS.texture) { rejected.push({ field: 'texture', text, reason: 'más de 5' }); continue; }
    texture.push(text);
  }

  const assumed: AssumedFact[] = [];
  for (const entry of entriesOf(value.assumed)) {
    const id = entry.id, kind = entry.kind, status = entry.status, text = cleanText(entry.text, VOICE_LIMITS.assumedText);
    const quoted = typeof entry.text === 'string' ? entry.text : undefined;
    if (!freshId(id)) { rejected.push({ field: 'assumed', text: quoted, reason: 'id repetido o inválido' }); continue; }
    if (!text || !oneOf(ASSUMED_KINDS, kind) || !oneOf(ASSUMED_STATUSES, status)) { rejected.push({ field: 'assumed', text: quoted, reason: 'texto, tipo o estado inválidos' }); continue; }
    // The merchant's confirmed word is theirs to state; only YAPI's own assumptions are held to the never-assumed classes.
    const never = status === 'assumed' ? neverAssumedReason(text) : undefined;
    if (never) { rejected.push({ field: 'assumed', text, reason: never }); continue; }
    if (assumed.length === VOICE_LIMITS.assumed) { rejected.push({ field: 'assumed', text, reason: 'más de 6' }); continue; }
    ids.add(id);
    assumed.push({ id, text, kind, status });
  }

  const words: StoreVoice['words'] = {};
  const rawWords = value.words && typeof value.words === 'object' ? value.words as Record<string, unknown> : {};
  for (const key of VOICE_WORDS) {
    const word = cleanText(rawWords[key], VOICE_LIMITS.word);
    if (word) words[key] = word;
  }

  const avoid: string[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(value.avoid) ? value.avoid : []) {
    const phrase = cleanText(entry, VOICE_LIMITS.avoidText);
    if (!phrase || seen.has(foldText(phrase))) continue;
    if (avoid.length === VOICE_LIMITS.avoid) { rejected.push({ field: 'avoid', text: phrase, reason: 'más de 20' }); continue; }
    seen.add(foldText(phrase));
    avoid.push(phrase);
  }
  return { voice: { version: 1, voice: line, specifics, texture, assumed, words, avoid }, rejected };
}

export function sanitizeVoice(raw: unknown): StoreVoice | undefined {
  return sanitizeVoiceReport(raw).voice;
}

export function readVoice(files: ReadonlyArray<{ path: string; content: string; encoding?: string }>): StoreVoice | undefined {
  const file = files.find(entry => entry.path === VOICE_FILE && entry.encoding !== 'base64');
  if (!file) return undefined;
  try { return sanitizeVoice(JSON.parse(file.content)); } catch { return undefined; }
}

export function voiceFile(voice: StoreVoice): { path: string; content: string } {
  return { path: VOICE_FILE, content: `${JSON.stringify(voice, null, 2)}\n` };
}

/** voice.json written (or removed, for undefined) in a file list. */
export function withVoiceFile<T extends { path: string; content: string }>(files: T[], voice: StoreVoice | undefined): T[] {
  const rest = files.filter(file => file.path !== VOICE_FILE);
  return voice ? [...rest, voiceFile(voice) as T] : rest;
}

const KIT_PAGES = new Set(['product.html', 'checkout.html', 'productos.html', 'coleccion.html']);
/** A standard page the platform built from the home (source-static-pages.ts): its main is only the runtime mount. */
const PLATFORM_COPY = /\sdata-(?:pagosya-page|account-gate)\s*=/i;
/** The pages YAPI wrote: authored html, not the kit's commerce pages and not the platform's copies of the home around a mount. */
export function authoredPages<T extends { path: string; content: string; encoding?: string }>(files: readonly T[]): T[] {
  return files.filter(file => file.encoding !== 'base64' && /\.html$/i.test(file.path) && !KIT_PAGES.has(file.path) && !PLATFORM_COPY.test(file.content));
}

const ASSUMED_SPAN = /<span\b[^>]*?\sdata-assumed\s*=\s*(["'])([^"'<>]{1,40})\1/gi;
/** Every data-assumed id each authored page carries. A cheap scan: edits use the parser (assumed-facts.ts). */
export function assumedIdsByPage(files: ReadonlyArray<{ path: string; content: string; encoding?: string }>): Map<string, string[]> {
  const pages = new Map<string, string[]>();
  for (const file of authoredPages(files)) {
    const ids = [...new Set([...file.content.matchAll(ASSUMED_SPAN)].map(match => match[2]))];
    if (ids.length) pages.set(file.path, ids);
  }
  return pages;
}

/** At most 8: YAPI-sourced specifics go first (the newest of them), then the oldest of the merchant's own. */
function capSpecifics(list: VoiceSpecific[]): VoiceSpecific[] {
  const out = [...list];
  while (out.length > VOICE_LIMITS.specifics) {
    let drop = -1;
    for (let index = out.length - 1; index >= 0; index--) if (out[index].source !== 'merchant') { drop = index; break; }
    out.splice(drop >= 0 ? drop : 0, 1);
  }
  return out;
}

/** What a YAPI save writes as voice.json (spec part 5): pending facts no authored page carries any more are dropped (an edit
 *  removed them, or the author never used them), and facts the merchant confirmed move to the specifics as the merchant's own. */
export function voiceForSave(voice: StoreVoice, files: ReadonlyArray<{ path: string; content: string; encoding?: string }>): StoreVoice {
  const onPages = new Set([...assumedIdsByPage(files).values()].flat());
  // Final review 2026-10-15: a fact the author wrote without its mark (or that an edit unwrapped) is still on the page; it stays
  // pending, so it is listed and the publish gate holds, until no authored page states it.
  const pageText = authoredPages(files).map(file => foldText(file.content.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')).join(' \n ');
  const stated = (fact: AssumedFact) => pageText.includes(foldText(fact.text).replace(/\s+/g, ' ').trim());
  const confirmed = voice.assumed.filter(fact => fact.status === 'confirmed');
  return {
    ...voice,
    specifics: capSpecifics([...voice.specifics, ...confirmed.map(fact => ({ id: fact.id, text: fact.text, source: 'merchant' as const }))]),
    assumed: voice.assumed.filter(fact => fact.status === 'assumed' && (onPages.has(fact.id) || stated(fact))),
  };
}

export function pendingAssumptions(voice: StoreVoice | undefined): AssumedFact[] {
  return voice?.assumed.filter(fact => fact.status === 'assumed') ?? [];
}
export function merchantSpecificCount(voice: StoreVoice | undefined): number {
  return voice?.specifics.filter(entry => entry.source === 'merchant').length ?? 0;
}

/** The merchant's own chat messages (spec part 1), latest first, cut at `max` characters. */
export function merchantMessagesText(messages: ReadonlyArray<{ content: string }>, max = 2000): string {
  let out = '';
  for (const message of messages) {
    const piece = typeof message.content === 'string' ? message.content.trim() : '';
    if (!piece) continue;
    const next = out ? `${out}\n${piece}` : piece;
    if (next.length > max) { out = next.slice(0, max); break; }
    out = next;
  }
  return out;
}

export type OnboardingMaterial = { what?: string; story?: string; answers: Array<{ question: string; answer: string }> };
/** Store.onboarding as voice material, read defensively: any shape, any age. */
export function readOnboardingMaterial(raw: unknown): OnboardingMaterial {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const text = (entry: unknown) => (typeof entry === 'string' && entry.trim() ? entry.trim() : undefined);
  const answers = (Array.isArray(value.answers) ? value.answers : []).flatMap(entry => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const question = text(row.question), answer = text(row.answer);
    return question && answer ? [{ question, answer }] : [];
  });
  const what = text(value.what), story = text(value.story);
  return { ...(what ? { what } : {}), ...(story ? { story } : {}), answers };
}
/** The merchant's own words, as writing rule 1 and the echo check read them. */
export function merchantTextOf(messages: string, onboarding: OnboardingMaterial): string[] {
  return [messages, onboarding.what, onboarding.story, ...onboarding.answers.map(entry => entry.answer)].filter((text): text is string => Boolean(text && text.trim()));
}

/** Answers given after the sheet was written (onboarding, or a kind question in chat) join it as the merchant's own specifics. */
export function withOnboardingAnswers(voice: StoreVoice, answers: ReadonlyArray<{ question: string; answer: string }>): StoreVoice {
  // A specific that already says the answer (or that the answer already says) is the same fact: not added twice.
  const key = (text: string) => foldText(text).replace(/[\s.!?…]+$/, '');
  const known = voice.specifics.map(entry => key(entry.text));
  const ids = new Set([...voice.specifics, ...voice.assumed].map(entry => entry.id));
  const added: VoiceSpecific[] = [];
  for (const { answer } of answers) {
    const text = cleanText(answer.slice(0, VOICE_LIMITS.specificText), VOICE_LIMITS.specificText);
    if (!text || known.some(entry => entry.includes(key(text)) || key(text).includes(entry))) continue;
    let n = 1;
    while (ids.has(`m${n}`)) n++;
    ids.add(`m${n}`);
    known.push(key(text));
    added.push({ id: `m${n}`, text, source: 'merchant' });
  }
  return added.length ? { ...voice, specifics: capSpecifics([...voice.specifics, ...added]) } : voice;
}

export function nextKindQuestion(questions: readonly string[], asked: readonly string[]): string | undefined {
  const done = new Set(asked.map(foldText));
  return questions.find(question => !done.has(foldText(question)));
}
export function pendingFactsNote(count: number): string {
  return count === 1
    ? 'Supuse 1 dato de tu negocio: confírmalo, corrígelo o quítalo en «Datos que YAPI supuso» antes de publicar.'
    : `Supuse ${count} datos de tu negocio: confírmalos, corrígelos o quítalos en «Datos que YAPI supuso» antes de publicar.`;
}
export function kindQuestionNote(question: string): string {
  return `Una pregunta para que tu tienda suene más tuya: ${question} Si me respondes, lo uso en los próximos cambios.`;
}

/** Another store's sheet and home sentences, with the kind its frame draw recorded (SourceProjectsService.recentVoices). */
export type RecentVoice = { kind?: string; voice?: StoreVoice; sentences: string[] };
/** The voices a new sheet differs from (spec part 2): the same-kind stores first, then the newest others. */
export function voicesToDiffer(rows: readonly RecentVoice[], kind: string, limit = 6): RecentVoice[] {
  return [...rows.filter(row => row.kind === kind), ...rows.filter(row => row.kind !== kind)].slice(0, limit);
}
