import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { LOCAL_REWRITE_KEPT_LINES, sourceLinesKept } from '../source-edits';
import { nextSourceFile } from '../source-next';

export type AgentEditResult = { ok: true } | { ok: false; reason: 'path' | 'missing' | 'ambiguous' | 'rewrite'; message: string; excerpt?: string };
/** Written by the platform from the catalog on every save; the agent reads it but never edits it. */
export const AGENT_READ_ONLY = ['components/store-data.tsx'];

/** The agent's in-memory draft. Nothing here is saved; `files()` hands the result to the save gate. */
export class AgentWorkspace {
  private readonly map = new Map<string, SourceProjectFileDto>();
  private readonly changed = new Set<string>();
  version = 0;
  constructor(files: SourceProjectFileDto[], private readonly options: { redesign: boolean }) {
    for (const file of files) this.map.set(file.path, { ...file });
  }
  list() { return [...this.map.keys()].filter(nextSourceFile); }
  read(path: string) {
    const file = this.map.get(path);
    if (!file || !nextSourceFile(path)) throw new Error(`Ese archivo no se puede leer: ${path}`);
    return file.content;
  }
  edit(path: string, search: string, replacement: string): AgentEditResult {
    if (!this.writable(path) || !this.map.has(path)) return { ok: false, reason: 'path', message: `No existe un archivo editable ${path}.` };
    const content = this.map.get(path)!.content;
    const start = search ? content.indexOf(search) : -1;
    if (start < 0) return { ok: false, reason: 'missing', message: `El texto a reemplazar no está en ${path}. Cópialo exacto del archivo actual.`, excerpt: content.slice(0, 1500) };
    if (content.indexOf(search, start + 1) !== -1) return { ok: false, reason: 'ambiguous', message: `El texto a reemplazar aparece más de una vez en ${path}; usa un fragmento único.`, excerpt: content.slice(0, 1500) };
    this.set(path, content.slice(0, start) + replacement + content.slice(start + search.length));
    return { ok: true };
  }
  write(path: string, content: string): AgentEditResult {
    if (!this.writable(path)) return { ok: false, reason: 'path', message: `Solo se pueden escribir componentes y styles/globals.css (no ${path}).` };
    const existing = this.map.get(path);
    if (existing && !this.options.redesign && sourceLinesKept(existing.content, content) < LOCAL_REWRITE_KEPT_LINES) {
      return { ok: false, reason: 'rewrite', message: `${path} cambiaría casi por completo; usa edit_file para los cambios puntuales.` };
    }
    this.set(path, content);
    return { ok: true };
  }
  files() { return [...this.map.values()].map(file => ({ ...file })); }
  changedPaths() { return [...this.changed]; }
  private writable(path: string) { return nextSourceFile(path) && !AGENT_READ_ONLY.includes(path); }
  private set(path: string, content: string) {
    this.map.set(path, { ...(this.map.get(path) || {}), path, content });
    this.changed.add(path);
    this.version++;
  }
}
