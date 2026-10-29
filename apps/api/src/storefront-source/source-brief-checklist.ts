import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/** Owner 2026-10-27 («more accurateness and personalization per store»; Remolino came out without the REMOLINO10 popup, the Club
 *  and the combos): after a new store's last build step, YAPI reads the merchant's first message as a list of concrete asks,
 *  checks each against the saved store, switches on the store settings it can, has a capped edit build the page parts still
 *  missing, checks again and answers with the list — so nothing the merchant asked for is skipped in silence. */

/** Store settings the check turns on by itself, without touching the design. */
export const CHECKLIST_SETTINGS = ['contactForm', 'signupPopup', 'assistant', 'none'] as const;
export type ChecklistSetting = typeof CHECKLIST_SETTINGS[number];

export type ChecklistStatus = 'done' | 'missing' | 'needs_merchant';
export type ChecklistItem = { ask: string; status: ChecklistStatus; setting: ChecklistSetting; fix: string };
export type BriefChecklist = { items: ChecklistItem[]; popupCode: string; popupPercent: number };

/** The store settings the check reads next to the files. */
export type ChecklistStoreSettings = { contactForm: boolean; signupPopup: boolean; popupCode: string | null; assistant: boolean };

export const BRIEF_CHECKLIST_PROMPT = [
  'Eres el revisor de YAPI, el diseñador de tiendas de pagosYa. Recibes el primer mensaje de un comercio y un resumen de la tienda que se construyó (sus archivos de datos, textos y ajustes).',
  'Haz la lista de lo que el comercio pidió en concreto y di si la tienda ya lo tiene.',
  'Una petición concreta es algo que se puede comprobar: una sección o bloque con nombre (p. ej. «el Club Remolino», «recetas del blog», «los combos»), una página, un código de descuento, una ventana de suscripción, el campo de correo en el pie, el asistente de chat, un formulario de contacto, un menú desplegable, filtros, orden o selector de colores en el catálogo, una guía de tallas, un video en la portada, un color o tipografía nombrados, una política (envíos, cambios), un dato del negocio (ciudad, horario).',
  'No son peticiones: el ánimo general («alegre», «elegante», «moderna», «con mucho aire»), referencias de estilo («como Jacquemus») ni frases sobre el negocio. No inventes peticiones; como máximo 12, en el orden del mensaje, una por cosa (nunca juntes dos secciones en una línea).',
  'Para cada una:',
  '- ask: la petición en pocas palabras, en español, como la diría el comercio (máximo 70 caracteres).',
  '- status: «done» si el resumen muestra que la tienda la tiene (un texto, sección, ajuste o archivo que la cumple de verdad, no solo una mención de paso); «missing» si falta y YAPI puede construirlo; «needs_merchant» solo si es imposible sin algo que únicamente el comercio tiene: un archivo que no subió (su logo, un PDF) o un precio o producto que no está en el catálogo.',
  'YAPI escribe textos con el contenido real de la tienda: una sección del club o programa con el nombre que dio el comercio y una invitación a unirse, recetas o notas del blog sobre los productos del catálogo, combos que juntan productos que ya están en el catálogo (sin inventar precios nuevos), una guía o pasos de uso. Eso es «missing», no «needs_merchant». Una sección pedida que falta casi siempre es «missing». En cambio, una suscripción, variantes, colores o precios de un producto son ajustes del producto en su catálogo: si el resumen no los muestra en ese producto, «needs_merchant» (di qué ajustar).',
  '- setting: «contactForm» si es el formulario de contacto, «signupPopup» si es la ventana de suscripción o el código de descuento de esa ventana, «assistant» si es el asistente o chat de la tienda; si no, «none».',
  '- fix: si status es «missing» y setting es «none», una instrucción corta y precisa para el diseñador: qué agregar, dónde y con qué contenido real de esta tienda (usa los productos y textos del resumen). Si status es «needs_merchant», qué necesitas que el comercio te dé, en una frase dirigida a él. Si no, cadena vacía.',
  'popupCode: el código de descuento que el comercio pidió para la ventana de suscripción, tal cual (p. ej. «REMOLINO10»), o cadena vacía. popupPercent: el porcentaje de ese código si se deduce (REMOLINO10 → 10), si no 0.',
].join('\n');

export const BRIEF_CHECKLIST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items', 'popupCode', 'popupPercent'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ask', 'status', 'setting', 'fix'], properties: {
      ask: { type: 'string' }, status: { type: 'string', enum: ['done', 'missing', 'needs_merchant'] }, setting: { type: 'string', enum: [...CHECKLIST_SETTINGS] }, fix: { type: 'string' },
    } } },
    popupCode: { type: 'string' }, popupPercent: { type: 'integer' },
  },
};

/** The model's answer, trimmed to what the check can use; null when it has no list. */
export function normalizeChecklist(raw: unknown): BriefChecklist | null {
  const value = raw as Partial<BriefChecklist> | null;
  if (!value || !Array.isArray(value.items)) return null;
  const items = value.items.slice(0, 12).flatMap(item => {
    const ask = String(item?.ask ?? '').trim().slice(0, 90);
    if (!ask) return [];
    const status: ChecklistStatus = ['done', 'missing', 'needs_merchant'].includes(item.status) ? item.status : 'missing';
    const setting: ChecklistSetting = (CHECKLIST_SETTINGS as readonly string[]).includes(item.setting) ? item.setting : 'none';
    return [{ ask, status, setting, fix: String(item.fix ?? '').trim().slice(0, 500) }];
  });
  const popupCode = String(value.popupCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  const named = Math.max(0, Math.min(90, Math.round(Number(value.popupPercent) || 0)));
  // A code with no percent said takes the number it ends with (REMOLINO10 → 10), else 10.
  const popupPercent = !popupCode ? 0 : named || Math.min(90, Number(/(\d{1,2})$/.exec(popupCode)?.[1] ?? 0)) || 10;
  return { items, popupCode, popupPercent };
}

/** The store as the check reads it: its settings, its pages, its words and data (store-data, config without the long catalogue
 *  fields) and the files a design edit changed or added. Template code nobody touched is left out. */
export function storeDigest(files: readonly SourceProjectFileDto[], templateFiles: readonly { path: string; content: string }[], settings: ChecklistStoreSettings, limit = 60_000): string {
  const original = new Map(templateFiles.map(file => [file.path, file.content]));
  const text = (file: SourceProjectFileDto) => String(file.content ?? '');
  const pages = files.filter(file => /^[^/]+\.html$/.test(file.path)).map(file => file.path);
  const config = files.find(file => file.path === 'config.js');
  const data = files.find(file => file.path === 'components/store-data.tsx');
  const parts: string[] = [
    `AJUSTES DE LA TIENDA: formulario de contacto ${settings.contactForm ? 'activado' : 'desactivado'}; ventana de suscripción ${settings.signupPopup ? 'activada' : 'desactivada'}${settings.popupCode ? ` con el código ${settings.popupCode}` : ' sin código de descuento'}; campo de correo en el pie activado; asistente de chat ${settings.assistant ? 'activado' : 'desactivado'}.`,
    `PÁGINAS: ${pages.join(', ')}`,
  ];
  if (config) parts.push(`config.js:\n${compactConfig(text(config))}`);
  if (data) parts.push(`components/store-data.tsx:\n${text(data)}`);
  // What a design edit wrote: new files and changed template files (components, styles, pages), never compiled output or assets.
  for (const file of files) {
    if (file === config || file === data || !/\.(tsx|ts|css)$/.test(file.path) || /^(_compiled|assets|lib)\//.test(file.path) || original.get(file.path) === text(file)) continue;
    parts.push(`${file.path}${original.has(file.path) ? ' (cambiado)' : ' (nuevo)'}:\n${text(file).slice(0, 12_000)}`);
  }
  return parts.join('\n\n').slice(0, limit);
}

/** config.js without product descriptions, photos and long arrays: names, prices and flags stay readable. */
function compactConfig(source: string): string {
  const json = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(source.trim())?.[1];
  if (!json) return source.slice(0, 8000);
  try {
    const config = JSON.parse(json);
    const items = (config?.data?.items ?? []).map((item: Record<string, unknown>) => ({ name: item.name, amount: item.amount, categoryId: item.categoryId, fulfillmentType: item.fulfillmentType,
      ...(Array.isArray(item.variants) && item.variants.length ? { variants: (item.variants as Array<{ name?: string }>).map(variant => variant.name) } : {}),
      ...(Array.isArray(item.subscriptionOptions) && item.subscriptionOptions.length ? { subscription: true } : {}) }));
    return JSON.stringify({ ...config, data: { ...config.data, items } }).slice(0, 14_000);
  } catch { return source.slice(0, 8000); }
}

/** What the capped edit is asked to build: only the page parts still missing, with the merchant's message for context. */
export function checklistFixBrief(missing: readonly ChecklistItem[], merchantWords: string): string {
  return [
    'Revisión del pedido: el comercio pidió estas cosas en su primer mensaje y la tienda todavía no las tiene. Agrégalas, una por una, sin cambiar nada más de la tienda (ni colores, ni letras, ni las secciones que ya están):',
    ...missing.map((item, index) => `${index + 1}. ${item.ask}: ${item.fix || item.ask}`),
    'Usa el contenido real de la tienda (sus productos, textos y fotos); nada de textos de relleno ni productos inventados. Cada sección nueva va en la portada o en la página que corresponda, con el mismo estilo que el resto.',
    'Si un punto necesita algo que la tienda no tiene (un ajuste del producto como una suscripción, un archivo que no está), sáltalo y sigue con los demás: termina el trabajo como hecho con lo que sí agregaste; nunca lo dejes a medias por ese punto.',
    '',
    `Mensaje del comercio:\n${merchantWords.slice(0, 3000)}`,
  ].join('\n');
}

/** The reply: what was asked, ticked; what is still being added or did not work, said; what YAPI needs from the merchant, asked. */
/** offered: nothing was tried for the missing points (the fix step is off), so they are named as still to add, not as failed. */
export function checklistReply(items: readonly ChecklistItem[], final: boolean, offered = false): string {
  if (!items.length) return '';
  const missing = items.filter(item => item.status === 'missing');
  const lines = [
    final || !missing.length ? 'Revisé tu pedido punto por punto:' : `Revisé tu pedido punto por punto. ${missing.length === 1 ? 'Falta 1 cosa; la agrego' : `Faltan ${missing.length} cosas; las agrego`} ahora:`,
    ...items.map(item => item.status === 'done' ? `✓ ${item.ask}` : item.status === 'missing' ? `${offered ? '·' : final ? '✗' : '…'} ${item.ask}` : `? ${item.ask}${item.fix ? ` — ${item.fix}` : ''}`),
  ];
  if (offered && missing.length) lines.push('Lo marcado con · todavía no está en tu tienda; pídemelo aquí y lo agrego.');
  else if (final && missing.length) lines.push('Lo que quedó con ✗ no salió bien; pídemelo aquí con tus palabras y lo intento de otra forma.');
  return lines.join('\n');
}





