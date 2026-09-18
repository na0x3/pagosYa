import { BadGatewayException } from '@nestjs/common';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const sourceEditSchema = {
  type: 'object', additionalProperties: false, required: ['label', 'edits', 'files', 'appends'], properties: {
    label: { type: 'string', minLength: 1, maxLength: 120 },
    edits: { type: 'array', maxItems: 64, items: { type: 'object', additionalProperties: false, required: ['path', 'search', 'replacement'], properties: {
      path: { type: 'string' }, search: { type: 'string', minLength: 1, maxLength: 2000 }, replacement: { type: 'string', maxLength: 16000 },
    } } },
    appends: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['path', 'content'], properties: {
      path: { type: 'string', enum: ['styles.css', 'site.js'] }, content: { type: 'string', minLength: 1, maxLength: 16000 },
    } } },
    files: { type: 'array', maxItems: 24, items: { type: 'object', additionalProperties: false, required: ['path', 'content'], properties: {
      path: { type: 'string' }, content: { type: 'string' },
    } } },
  },
};

export class SourceEditConflict extends BadGatewayException {
  constructor(readonly diagnostic: { path: string; editIndex: number; reason: 'missing' | 'ambiguous'; search: string; currentContent: string }) {
    super(`No se pudo localizar con precisión el cambio en ${diagnostic.path}. Tu revisión anterior sigue guardada.`);
  }
}

/** Atomic edits; existing-file replacement requires a server-authorized redesign scope. */
export function applySourceEdits(previous: SourceProjectFileDto[], output: any, options: { allowUnchanged?: boolean; replaceablePaths?: string[]; appendPaths?: string[]; allowedEditPaths?: string[] } = {}): SourceProjectFileDto[] {
  function reject(reason: string): never { throw new BadGatewayException(`${reason} Tu revisión anterior sigue guardada.`); }
  if (!Array.isArray(output?.edits) || output.edits.length > 64 || !Array.isArray(output.files) || output.files.length > 24) reject('La edición no devolvió cambios puntuales válidos.');
  const files = previous.map(file => ({ ...file }));
  if (output.appends !== undefined && (!Array.isArray(output.appends) || output.appends.length > 2)) reject('La edición incluye anexos inválidos.');
  for (const [editIndex, edit] of output.edits.entries()) {
    if (!edit || typeof edit.path !== 'string' || typeof edit.search !== 'string' || !edit.search.trim() || typeof edit.replacement !== 'string') reject('La edición incluye un reemplazo inválido.');
    if (options.allowedEditPaths && !options.allowedEditPaths.includes(edit.path)) reject(`La edición intentó salir del alcance autorizado (${options.allowedEditPaths.join(', ')}).`);
    const file = files.find(file => file.path === edit.path);
    if (!file || file.encoding === 'base64') reject('La edición intentó cambiar un archivo fuera del proyecto.');
    const start = file.content.indexOf(edit.search);
    if (start < 0 || file.content.indexOf(edit.search, start + 1) !== -1) throw new SourceEditConflict({ path: edit.path, editIndex, reason: start < 0 ? 'missing' : 'ambiguous', search: edit.search, currentContent: file.content });
    if (edit.search.trim() === file.content.trim()) reject(`La edición intentó reescribir por completo ${edit.path}.`);
    file.content = file.content.slice(0, start) + edit.replacement + file.content.slice(start + edit.search.length);
  }
  const written = new Set<string>();
  for (const file of output.files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string' || written.has(file.path.toLowerCase())) reject('La edición intentó reemplazar un archivo existente como si fuera nuevo.');
    written.add(file.path.toLowerCase());
    const existing = files.find(existing => existing.path.toLowerCase() === file.path.toLowerCase());
    if (existing) {
      if (existing.path !== file.path || !options.replaceablePaths?.includes(file.path) || output.edits.some((edit: any) => edit.path === file.path)) reject('La edición intentó reemplazar un archivo existente como si fuera nuevo.');
      existing.content = file.content;
      continue;
    }
    files.push({ path: file.path, content: file.content });
  }
  const appended = new Set<string>();
  for (const addition of output.appends || []) {
    if (!addition || !(options.appendPaths || ['styles.css', 'site.js']).includes(addition.path) || typeof addition.content !== 'string' || !addition.content.trim() || addition.content.length > 16000 || appended.has(addition.path)) reject('La edición incluye un anexo inválido.');
    appended.add(addition.path);
    const file = files.find(f => f.path === addition.path);
    if (!file || file.encoding === 'base64') reject('El archivo para anexar no existe.');
    file.content += '\n' + addition.content + '\n';
  }
  if (!options.allowUnchanged && files.length === previous.length && files.every((file, i) => file.content === previous[i].content)) reject('La edición no incluyó ningún cambio.');
  return files;
}
