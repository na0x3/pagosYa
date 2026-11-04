/** Spec 2026-11-04 (owner «lets make yapi keep asking questions until he is ready to make the store»): before a new store's first
 *  build YAPI asks, one at a time, only what its words, catalogue and settings leave open — what it sells and to whom, the look,
 *  the must-haves, photos — at most four times, always with «Créala ya». Pure parts here; the call is
 *  SourceConversationService.intakeStep, the turn is SourceChatService.askBeforeBuild. */

export const INTAKE_TOPICS = ['what', 'look', 'musts', 'photos'] as const;
export type IntakeTopic = typeof INTAKE_TOPICS[number];
export const INTAKE_MAX = 4;
export const BUILD_NOW = 'Créala ya';

export type IntakeAnswer = { topic: IntakeTopic; question: string; answer: string };
export type IntakeState = { pending: boolean; words: string; request?: string; photos: string[]; asked: IntakeTopic[]; answers: IntakeAnswer[]; question?: { topic: IntakeTopic; text: string } };
export type IntakeFacts = { tienda: string; vende: string; historia: string; productos: number; conFoto: string[]; sinFoto: string[]; fotos: number;
  envios: boolean; recojo: boolean; codigo: string; whatsapp: boolean; instagram: boolean };
export type IntakeTurn = { understood: string; reply: string; ready: boolean; topic: IntakeTopic | 'none'; question: string; options: string[] };
export type IntakeFactsInput = { name: string; onboarding: { what?: string; story?: string }; products: Array<{ name: string; imageUrls: string[] }>;
  zones: number; locations: Array<{ pickupEnabled?: boolean }>; codes: string[]; links: Array<{ label: string; url: string }>; contactPhone: string | null };

export function intakeFacts(input: IntakeFactsInput): IntakeFacts {
  const withPhoto = input.products.filter(product => product.imageUrls.length);
  return {
    tienda: input.name, vende: (input.onboarding.what ?? '').slice(0, 600), historia: (input.onboarding.story ?? '').slice(0, 600), productos: input.products.length,
    conFoto: withPhoto.map(product => product.name).slice(0, 20), sinFoto: input.products.filter(product => !product.imageUrls.length).map(product => product.name).slice(0, 20),
    fotos: input.products.reduce((sum, product) => sum + product.imageUrls.length, 0),
    envios: input.zones > 0, recojo: input.locations.some(location => location.pickupEnabled === true), codigo: input.codes[0] ?? '',
    whatsapp: Boolean(input.contactPhone) || input.links.some(link => /wa\.me|whatsapp/i.test(link.url)), instagram: input.links.some(link => /instagram\.com/i.test(link.url)),
  };
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¡!¿?.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** What the settings and the catalogue already answer, so the question is never asked. */
function factsAnswer(topic: IntakeTopic, facts: IntakeFacts) {
  if (topic === 'photos') return facts.productos > 0 && facts.sinFoto.length === 0 && facts.fotos >= 3;
  if (topic === 'musts') return (facts.envios || facts.recojo) && Boolean(facts.codigo) && facts.whatsapp;
  return false;
}

/** Live check 2026-11-04 (Libros de Ana: no question, though the store had no delivery, pickup, code or WhatsApp): what the facts
 *  can check is asked even when the model calls the brief ready — the must-haves when the store has none of them, photos when
 *  products have none — each once. */
function factsQuestion(state: IntakeState, facts: IntakeFacts, understood: string): IntakeTurn | null {
  const turn = (topic: IntakeTopic, question: string, options: string[]): IntakeTurn => ({ understood, reply: '', ready: false, topic, question, options: [...options, BUILD_NOW] });
  if (!state.asked.includes('musts') && !facts.envios && !facts.recojo && !facts.codigo && !facts.whatsapp) {
    return turn('musts', '¿Cómo le llegan los pedidos a tus clientes?', ['Envíos', 'Recojo en mi local', 'Los dos', 'Por WhatsApp']);
  }
  if (!state.asked.includes('photos') && facts.sinFoto.length) return turn('photos', `¿Me mandas fotos de ${facts.sinFoto.slice(0, 2).join(' y ')}?`, ['Te las mando', 'Sigue sin fotos']);
  return null;
}

export function normalizeIntake(raw: unknown, state: IntakeState, facts: IntakeFacts): IntakeTurn | null {
  if (!raw || typeof raw !== 'object') return null;
  const answer = raw as Partial<Record<keyof IntakeTurn, unknown>>;
  const understood = clean(answer.understood, 200).replace(/\.$/, '');
  const reply = clean(answer.reply, 240);
  if (state.asked.length >= INTAKE_MAX) return { understood, reply: '', ready: true, topic: 'none', question: '', options: [] };
  const ready: IntakeTurn = factsQuestion(state, facts, understood) ?? { understood, reply: '', ready: true, topic: 'none', question: '', options: [] };
  if (answer.ready === true) return ready;
  const topic = (INTAKE_TOPICS as readonly string[]).includes(String(answer.topic)) ? answer.topic as IntakeTopic : null;
  const repeat = Boolean(topic && reply && state.question?.topic === topic);
  if (!topic || (state.asked.includes(topic) && !repeat) || factsAnswer(topic, facts)) return ready;
  const question = clean(answer.question, 240);
  if (!question) return ready;
  const options = [...new Set((Array.isArray(answer.options) ? answer.options : []).map(option => clean(option, 40)).filter(option => option && fold(option) !== fold(BUILD_NOW)))].slice(0, 4);
  return { understood, reply: repeat ? reply : '', ready: false, topic, question, options: [...options, BUILD_NOW] };
}

const BUILD_NOW_EXACT = new Set(['ya', 'dale', 'listo', 'hazla', 'creala', 'construyela', 'asi esta bien', 'eso es todo', 'no se nada mas']);
export function wantsBuildNow(text: string) {
  const words = fold(text);
  return BUILD_NOW_EXACT.has(words) || /\b(?:creala|crealo|hazla|construyela|armala) ya\b|\bno (?:mas|hagas mas) preguntas\b|\bya no preguntes\b/.test(words);
}

export function intakeInstruction(state: IntakeState) {
  const lines = state.answers.filter(answer => answer.answer.trim() && !wantsBuildNow(answer.answer)).map(answer => `- ${answer.question} → ${answer.answer.trim()}`);
  return lines.length ? `${state.words}\n\nRespuestas del comercio:\n${lines.join('\n')}` : state.words;
}

export function intakeMessage(turn: IntakeTurn, first: boolean) {
  return [turn.reply, first && turn.understood ? `Entendí: ${turn.understood}.` : '', turn.question].filter(Boolean).join('\n\n');
}

/** The open intake on YAPI's newest message, while the store has no revision; null otherwise. */
export function pendingIntake(messages: ReadonlyArray<{ role: string; metadata?: unknown }>, revision: number): IntakeState | null {
  if (revision > 0) return null;
  const last = [...messages].reverse().find(message => message.role === 'ASSISTANT');
  const intake = (last?.metadata as { intake?: IntakeState } | null | undefined)?.intake;
  return intake && intake.pending === true && typeof intake.words === 'string' && Array.isArray(intake.asked) && Array.isArray(intake.answers) ? intake : null;
}

export const INTAKE_PROMPT = `Eres YAPI, el diseñador de tiendas de pagosYa. Un comercio quiere su tienda nueva y todavía no la construiste.
Antes de construirla, decide si te falta algo importante. Lees «palabras» (su primer mensaje), «respuestas» (lo que ya contestó),
«preguntado» (temas ya preguntados), «pendiente» (la pregunta que hiciste por última vez) y «hechos» (su catálogo y ajustes).
Temas, en este orden de importancia:
- what: qué vende y para quién. Falta solo si no se entiende qué vende o a quién le vende.
- look: cómo quiere que se vea (tranquila, colorida, elegante, divertida, un color, una tienda que le guste). Falta si no dijo nada del estilo.
- musts: lo que no puede faltar para vender: envíos o recojo, un código de bienvenida, su WhatsApp. Falta si los hechos no lo muestran y no lo dijo.
- photos: fotos. Falta solo si hay productos sin foto («sinFoto») o menos de 3 fotos en total.
Reglas:
- Una sola pregunta, corta, en español, de tú, cálida y sin exclamaciones. Nombra lo concreto (sus productos sin foto, su ciudad).
- Nunca preguntes un tema que ya está en «preguntado» ni algo que ya dijo o que los hechos ya muestran.
- «options»: de 2 a 4 respuestas cortas para tocar (máximo 4 palabras cada una). Para look: «Tranquila», «Colorida», «Elegante», «Divertida» o «Elige tú».
  Para photos: «Te las mando», «Sigue sin fotos». No incluyas «Créala ya»: se agrega solo.
- Si la última respuesta es «no sé», «elige tú» o similar, ese tema queda delegado: pasa al siguiente.
- Si la última respuesta es una pregunta del comercio, contéstala en «reply» en una frase y repite la pregunta pendiente con el mismo «topic».
  Si no, «reply» es "".
- «understood»: lo que entendiste del negocio en pocas palabras (p. ej. «láminas de arte para decorar, en Cochabamba»), sin punto final.
- ready=true cuando ya no falta nada importante (topic «none», question ""). Un mensaje detallado casi siempre está listo o necesita una sola pregunta.
Responde solo el JSON.`;

export const INTAKE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['understood', 'reply', 'ready', 'topic', 'question', 'options'],
  properties: {
    understood: { type: 'string' }, reply: { type: 'string' }, ready: { type: 'boolean' },
    topic: { type: 'string', enum: ['what', 'look', 'musts', 'photos', 'none'] }, question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
  },
} as const;
