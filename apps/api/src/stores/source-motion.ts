import { BadRequestException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
export const SOURCE_MOTION_MODES = ['auto', 'off', 'subtle', 'expressive'] as const;
export type SourceMotionMode = typeof SOURCE_MOTION_MODES[number];
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
export async function withSourceMotion(files: SourceProjectFileDto[], mode: SourceMotionMode): Promise<SourceProjectFileDto[]> {
  if (!SOURCE_MOTION_MODES.includes(mode)) throw new BadRequestException('Elige un modo de movimiento válido.');
  const config = readConfig(files);
  if (!files.some(f => f.path === 'commerce.js' && f.encoding !== 'base64')) throw new BadRequestException('Este sitio necesita el runtime de comercio.');
  const runtime = await readFile(join(__dirname, 'source-kit', 'video.js'), 'utf8') + '\n' + await readFile(join(__dirname, 'source-kit', 'motion.js'), 'utf8');
  return files.map(file => file.path === 'config.js'
    ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, motion: mode })};\n` }
    : file.path === 'commerce.js'
      ? { ...file, content: file.content.replace(/\n?\/\* pagosya-(motion|video):start \*\/[\s\S]*?\/\* pagosya-\1:end \*\//g, '').trimEnd() + '\n' + runtime }
      : file);
}
