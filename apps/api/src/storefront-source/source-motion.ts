import { BadRequestException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { kitPath } from '@pagosya/storefront-kit';
export const SOURCE_MOTION_MODES = ['auto', 'off', 'subtle', 'expressive'] as const;
export type SourceMotionMode = typeof SOURCE_MOTION_MODES[number];
export const SOURCE_SCROLL_FEELS = ['native', 'soft', 'cinematic'] as const;
export type SourceScrollFeel = typeof SOURCE_SCROLL_FEELS[number];
export function requestedSourceMotion(instruction: string): SourceMotionMode | undefined {
  const task = instruction.split('Pedido actual del comercio:').at(-1)!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(?:creative freedom|automatic motion|auto motion|libertad creativa|movimiento automatico)\b/.test(task)) return 'auto';
  if (/\b(?:sin|quita|elimina|desactiva|remove|disable|no)\s+(?:las?\s+|all\s+)?(?:animaciones|animations|motion|movimiento)\b/.test(task)) return 'off';
  if (/\b(?:no|don't|do not|without)\s+(?:(?:agregues|anadas|add|mas|more)\s+)*(?:animaciones|animados?|animadas?|animations|animated|movimiento|motion)\b/.test(task)) return undefined;
  if (/\b(?:menos|less|fewer|subtle)\s+(?:animaciones|animations|movimiento|motion)\b/.test(task)) return 'subtle';
  if (/\b(?:mas|more)\s+(?:animaciones|animados?|animadas?|animations|animated|movimiento|motion)\b/.test(task)) return 'expressive';
  return undefined;
}
/** A merchant asking for a minimal, sober or quiet look; bold is the default otherwise (owner 2026-10-10).
 *  Negated words ("nada minimalista"), business and product names ("Café Tranquilo", "detergentes limpios") and an explicit
 *  request for colour do not count. */
const RESTRAINT = /^(?:minimal\w*|sobri[oa]s?|sobriedad|discret[oa]s?|sutil(?:es)?|quiet|understated|subtle|muted)$/;
/** Words that are also business and product names: they count only beside a design noun ("diseño limpio"). */
const SOFT_RESTRAINT = /^(?:limpi[oa]s?|tranquil[oa]s?|calmad[oa]s?|clean|calm)$/;
const DESIGN_NOUN = /^(?:diseno|estilo|look|tienda|sitio|web|pagina|colores?|ambiente|aspecto|paleta|design|style|site|store)$/;
const NEGATION = /^(?:no|nada|sin|ni|nunca|not|never|dont|without)$/;
const LOUD = /(?:mucho color|muy colorid|colorid[oa]s?|llamativ\w*|atrevid\w*|vibrante\w*|colores (?:fuertes|vivos|intensos)|\bbold\b|colorful)/g;
export function sourceAsksForRestraint(text: string): boolean {
  const task = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '');
  const words = task.split(/[^a-z0-9]+/).filter(Boolean);
  const negatedAt = (index: number) => words.slice(Math.max(0, index - 3), index).some(word => NEGATION.test(word));
  for (const match of task.matchAll(LOUD)) {
    const before = task.slice(0, match.index).split(/[^a-z0-9]+/).filter(Boolean).slice(-3);
    if (!before.some(word => NEGATION.test(word))) return false;
  }
  if (/\b(?:sin colores fuertes|poco color)\b/.test(task)) return true;
  return words.some((word, index) => {
    if (negatedAt(index)) return false;
    if (RESTRAINT.test(word)) return true;
    return SOFT_RESTRAINT.test(word) && words.slice(Math.max(0, index - 2), index + 3).some(near => DESIGN_NOUN.test(near));
  });
}
const configPattern = /^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/;
function readConfig(files: SourceProjectFileDto[]) {
  const match = files.find(f => f.path === 'config.js')?.content.match(configPattern);
  if (!match) throw new BadRequestException('La configuración de este sitio no permite ajustar el movimiento.');
  try { const config = JSON.parse(match[1]); if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(); return config; }
  catch { throw new BadRequestException('La configuración del sitio no es válida.'); }
}
export function sourceMotionMode(files: SourceProjectFileDto[] = []): SourceMotionMode {
  if (!files.length) return 'auto';
  try { const mode = readConfig(files).motion; return SOURCE_MOTION_MODES.includes(mode) ? mode : 'subtle'; }
  catch { return 'subtle'; }
}
export function sourceScrollFeel(files: SourceProjectFileDto[] = []): SourceScrollFeel {
  if (!files.length) return 'soft';
  try { const feel = readConfig(files).scrollFeel; return SOURCE_SCROLL_FEELS.includes(feel) ? feel : 'soft'; }
  catch { return 'soft'; }
}
export async function withSourceMotionSettings(files: SourceProjectFileDto[], settings: { motion: SourceMotionMode; scrollFeel?: SourceScrollFeel }, trustedRuntime?: string): Promise<SourceProjectFileDto[]> {
  if (!SOURCE_MOTION_MODES.includes(settings.motion)) throw new BadRequestException('Elige un modo de movimiento válido.');
  if (settings.scrollFeel !== undefined && !SOURCE_SCROLL_FEELS.includes(settings.scrollFeel)) throw new BadRequestException('Elige una sensación de desplazamiento válida.');
  const config = readConfig(files);
  if (!files.some(f => f.path === 'commerce.js' && f.encoding !== 'base64')) throw new BadRequestException('Este sitio necesita el runtime de comercio.');
  const runtime = trustedRuntime ?? (await readFile(kitPath('video.js'), 'utf8') + '\n' + await readFile(kitPath('motion.js'), 'utf8'));
  const nextConfig = { ...config, motion: settings.motion, ...(settings.scrollFeel ? { scrollFeel: settings.scrollFeel } : {}) };
  return files.map(file => file.path === 'config.js'
    ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(nextConfig)};\n` }
    : file.path === 'commerce.js'
      ? { ...file, content: file.content.replace(/\n?\/\* pagosya-(motion|video):start \*\/[\s\S]*?\/\* pagosya-\1:end \*\//g, '').trimEnd() + '\n' + runtime }
      : file);
}
export async function withSourceMotion(files: SourceProjectFileDto[], mode: SourceMotionMode, trustedRuntime?: string): Promise<SourceProjectFileDto[]> {
  return withSourceMotionSettings(files, { motion: mode }, trustedRuntime);
}
