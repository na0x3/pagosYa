/** Signature look (spec 2026-10-09-yapi-signature-look-design): an idea grown from the business itself, carried in words
 * and visuals. Direction only: it is repaired in code and never fails a plan, a verify or a finish. */
export type SourceSignature = { idea: string; source: string; vocabulary: string[]; device: string; carries: string[] };

const SECTION_ID = /^[a-z][a-z0-9-]{0,47}$/;

/** Strict mode needs every field listed; none has a minimum, so the model is never forced to invent a device. */
export const SOURCE_SIGNATURE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['idea', 'source', 'vocabulary', 'device', 'carries'], properties: {
    idea: { type: 'string', maxLength: 200 },
    source: { type: 'string', maxLength: 200 },
    vocabulary: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 40 } },
    device: { type: 'string', maxLength: 300 },
    carries: { type: 'array', maxItems: 12, items: { type: 'string', pattern: SECTION_ID.source } },
  },
};

/** Prose a little past a limit is a formatting slip: cut at a sentence, else a word. */
export function fitProse(text: string, max: number) {
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence >= max * 0.5) return cut.slice(0, sentence + 1).trim();
  const word = cut.lastIndexOf(' ');
  return (word >= max * 0.5 ? cut.slice(0, word) : cut).trim();
}

function prose(value: unknown, max: number, path: string, repairs: string[]) {
  if (typeof value !== 'string') { if (value !== undefined) repairs.push(`${path}: not text, cleared`); return ''; }
  const text = value.trim();
  if (text.length <= max) return text;
  repairs.push(`${path}: ${text.length} chars cut to ${max}`);
  return fitProse(text, max);
}

/** Repairs instead of rejecting: a weak signature costs nothing, a rejected plan costs the merchant a paid retry. */
export function normalizeSourceSignature(value: unknown, sections: string[] | undefined, at: string): { signature?: SourceSignature; repairs: string[] } {
  const repairs: string[] = [];
  if (value === undefined || value === null) return { repairs };
  if (typeof value !== 'object' || Array.isArray(value)) return { repairs: [`${at}.signature: not an object, dropped`] };
  const raw = value as Record<string, unknown>;
  const idea = prose(raw.idea, 200, `${at}.signature.idea`, repairs);
  if (!idea) return { repairs: [...repairs, `${at}.signature: no idea, dropped`] };
  const source = prose(raw.source, 200, `${at}.signature.source`, repairs);
  const device = prose(raw.device, 300, `${at}.signature.device`, repairs);
  const vocabulary: string[] = [];
  for (const word of Array.isArray(raw.vocabulary) ? raw.vocabulary : []) {
    const clean = typeof word === 'string' ? word.trim() : '';
    if (!clean || clean.length > 40) { repairs.push(`${at}.signature.vocabulary: dropped ${JSON.stringify(String(word).slice(0, 60))}`); continue; }
    if (!vocabulary.some(kept => kept.toLowerCase() === clean.toLowerCase())) vocabulary.push(clean);
  }
  if (vocabulary.length > 8) { repairs.push(`${at}.signature.vocabulary: ${vocabulary.length} entries cut to 8`); vocabulary.length = 8; }
  const ids = Array.isArray(raw.carries) ? raw.carries.filter((id): id is string => typeof id === 'string') : [];
  const carries = [...new Set(ids)].filter(id => sections ? sections.includes(id) : SECTION_ID.test(id));
  if (carries.length !== ids.length) repairs.push(`${at}.signature.carries: kept ${carries.length} of ${ids.length} section IDs`);
  return { signature: { idea, source, vocabulary, device, carries }, repairs };
}

/** The chosen signature restated for the builder; empty when the switch is off or the concept has none. */
export function sourceSignatureTaskLine(concept: { signature?: SourceSignature } | undefined, enabled: boolean): string {
  const signature = enabled ? concept?.signature : undefined;
  if (!signature) return '';
  return `\nSignature to carry: ${signature.idea}${signature.device ? ` Device: ${signature.device}` : ''}${signature.vocabulary.length ? ` Vocabulary: ${signature.vocabulary.join(' · ')}.` : ''}${signature.carries.length ? ` Shows in: ${signature.carries.join(', ')}.` : ''}`;
}

export const SOURCE_SIGNATURE_PLANNING = `SIGNATURE. Before choosing a layout, find each concept's idea in this business itself: its real story, place, craft, people, products or customs, never in its category alone (a pilates studio is not an idea; a studio in a converted printing house whose owner danced for fifteen years is). Write it as signature: idea (one sentence), source (the concrete fact from the brief, photos or reference it grows from), vocabulary (0–8 short words or phrases the navigation and section titles can speak in, in the merchant's language; empty when plain words serve better), device (one visual idea in your own words: drawn, typographic, photographic, structural or nearly invisible) and carries (the planned section IDs where it shows). The three concepts need different ideas, not three skins of one. A signature may be loud or quiet; restraint is a valid signature. It is direction for the build, not decoration to add everywhere.`;

export const SOURCE_SIGNATURE_BUILDING = `SIGNATURE. When the selected concept has a signature it is your through-line: build its device, use its vocabulary where it reads naturally in navigation and section titles, and let it reappear in the sections it names. It is direction, not a checklist; adapt it when a section or the merchant's words call for something else. A section does not need a heading when its content or device opens it better.`;

/** The signature for a builder that writes the whole store in one call (Sep-5): the building direction and the concept's own signature. Empty when off or absent. */
export function sourceSignatureAuthorDirection(concept: { signature?: SourceSignature } | undefined, enabled: boolean): string {
  const line = sourceSignatureTaskLine(concept, enabled);
  return line ? `${SOURCE_SIGNATURE_BUILDING}${line}` : '';
}

/** The empty copy words the agent's self-check names; the copy check (copy-check.ts) reads the same list. */
export const SOURCE_EMPTY_COPY_WORDS: readonly string[] = ['Descubre', 'Eleva', 'Vive la experiencia', 'Discover', 'Elevate', 'Experience'];

export const SOURCE_TELLS_SELF_CHECK = `While you look at those screenshots, weigh the habits that make generated sites look generated: the same fade or blur reveal on every section; a marquee added by reflex; a small label above every heading; three equal cards with icons in tinted circles; a centred hero with a "★ 5.0" pill badge; Inter or Playfair as the default instead of a choice; everything inside rounded cards with soft shadows; every section the same width and spacing; empty copy words (${SOURCE_EMPTY_COPY_WORDS.join(', ')}). If one is there because it was the easy default rather than the concept's choice, change it and verify again; if the concept earned it, keep it and name it in finish.tellsKept (for example "marquesina: es el programa del circo"). This is your judgement, not a requirement: it never blocks finishing.`;
