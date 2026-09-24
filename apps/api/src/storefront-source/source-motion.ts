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
