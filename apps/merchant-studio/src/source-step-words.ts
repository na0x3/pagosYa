import type { BuildProgress } from './source-build-progress';

/** YAPI in design mode (spec 2026-10-22 v2 §3): what YAPI is doing, in the merchant's words — never a file name. */
const RULES: Array<[RegExp, string]> = [
  [/^(?:Voy a:|Planificó)/, ''],
  [/^Terminó/, ''],
  [/^Leyó/, 'Estoy mirando cómo está hecha tu tienda'],
  [/^(?:Editó|Escribió) \S*\.css\b/, 'Estoy cambiando los colores y las letras'],
  [/^(?:Editó|Escribió) \S*\/home\.tsx\b/, 'Estoy ajustando la portada'],
  [/^(?:Editó|Escribió) \S*\/product[^/\s]*\.tsx\b/, 'Estoy ajustando la página de producto'],
  [/^(?:Editó|Escribió) \S*\/checkout[^/\s]*\.tsx\b/, 'Estoy ajustando el pago'],
  [/^Escribió/, 'Estoy armando una sección nueva'],
  [/^Editó/, 'Estoy ajustando una sección'],
  [/^Creó la página/, 'Estoy creando una página nueva'],
  [/^Borró/, 'Estoy quitando lo que ya no se usa'],
  [/^Buscó productos/, 'Estoy buscando tus productos'],
  [/^Buscó ilustraciones/, 'Estoy eligiendo ilustraciones'],
  [/^Inspeccionó/, 'Estoy mirando tus fotos'],
  [/^Capturó .*\(móvil\)/, 'Estoy revisando que se vea bien en el celular'],
  [/^Capturó/, 'Estoy revisando cómo se ve en la computadora'],
  [/^Eligió la identidad de la ficha/, 'Estoy dándole estilo a las fichas de producto'],
  [/^(?:Actualizó|Quitó) la política/, 'Estoy escribiendo tus políticas'],
  [/^Diseñó las páginas de cuenta/, 'Estoy diseñando las páginas de cuenta'],
];
const NEUTRAL = 'Estoy trabajando en tu tienda';

export function stepSentence(label: string): string | null {
  const text = label.trim();
  if (!text) return null;
  const rule = RULES.find(([pattern]) => pattern.test(text));
  return rule ? rule[1] || null : NEUTRAL;
}

export function stepLines(progress: BuildProgress | null, max = 3): string[] {
  if (!progress) return [];
  const lines: string[] = [];
  for (const step of progress.steps) for (const detail of step.details ?? []) {
    const sentence = stepSentence(String(detail?.label ?? ''));
    if (sentence && lines.at(-1) !== sentence) lines.push(sentence);
  }
  return lines.slice(-max);
}
