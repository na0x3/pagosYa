import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { LOCAL_REWRITE_KEPT_LINES, sourceLinesKept } from '../source-edits';
import { MAX_DESIGN_FILES, designFileCount, nextSourceFile, standardPageRoute } from '../source-next';

export type AgentEditResult = { ok: true } | { ok: false; reason: 'path' | 'missing' | 'ambiguous' | 'rewrite' | 'budget' | 'protected'; message: string; excerpt?: string };
/** Written by the platform from the catalog on every save; the agent reads it but never edits it. */
export const AGENT_READ_ONLY = ['components/store-data.tsx'];
/** Every store needs these; delete_file never removes them. */
const AGENT_REQUIRED = ['components/home.tsx', 'components/product.tsx', 'components/checkout.tsx', 'styles/globals.css'];

/** The agent's in-memory draft. Nothing here is saved; `files()` hands the result to the save gate. */
export class AgentWorkspace {
  private readonly map = new Map<string, SourceProjectFileDto>();
  private readonly changed = new Set<string>();
  version = 0;
  /** rewriteComponents: a store kept on its template may replace whole components (copy, sections) for a new business,
   *  while styles/globals.css, where the template's look lives, still takes only local edits. */
  constructor(files: SourceProjectFileDto[], private readonly options: { redesign: boolean; rewriteComponents?: boolean }) {
    for (const file of files) this.map.set(file.path, { ...file });
  }
  list() { return [...this.map.keys()].filter(nextSourceFile); }
  read(path: string) {
    const file = this.map.get(path);
    if (!file || !nextSourceFile(path)) throw new Error(`Ese archivo no se puede leer: ${path}`);
    return file.content;
  }
  edit(path: string, search: string, replacement: string): AgentEditResult {
    return this.editBatch(path, [{ search, replacement }]);
  }
  /** Apply exact replacements in order, committing only when every search is unique. */
  editBatch(path: string, edits: Array<{ search: string; replacement: string }>): AgentEditResult {
    if (!this.writable(path) || !this.map.has(path)) return { ok: false, reason: 'path', message: `No existe un archivo editable ${path}.` };
    const original = this.map.get(path)!.content;
    let content = original;
    for (const { search, replacement } of edits) {
      const start = search ? content.indexOf(search) : -1;
      if (start < 0) return { ok: false, reason: 'missing', message: `El texto a reemplazar no está en ${path}. Cópialo exacto del archivo actual.`, excerpt: original.slice(0, 1500) };
      if (content.indexOf(search, start + 1) !== -1) return { ok: false, reason: 'ambiguous', message: `El texto a reemplazar aparece más de una vez en ${path}; usa un fragmento único.`, excerpt: original.slice(0, 1500) };
      content = content.slice(0, start) + replacement + content.slice(start + search.length);
    }
    this.set(path, content);
    return { ok: true };
  }
  write(path: string, content: string): AgentEditResult {
    if (!this.writable(path)) return { ok: false, reason: 'path', message: `Solo se pueden escribir componentes y styles/globals.css (no ${path}).` };
    const existing = this.map.get(path);
    const rewritable = this.options.redesign || this.options.rewriteComponents === true && path.startsWith('components/');
    if (existing && !rewritable && sourceLinesKept(existing.content, content) < LOCAL_REWRITE_KEPT_LINES) {
      return { ok: false, reason: 'rewrite', message: `${path} cambiaría casi por completo; usa edit_file para los cambios puntuales.` };
    }
    // Stress test 2026-10-21: the cap was only met at the final verify, after 13 minutes of work. Say it at the write.
    const count = designFileCount([...this.designFiles().filter(file => file.path !== path), { path, content }]);
    if (!existing && count > MAX_DESIGN_FILES) {
      return { ok: false, reason: 'budget', message: `La tienda ya usa ${count - 1} de ${MAX_DESIGN_FILES} archivos de diseño propios. Pon este componente dentro de un archivo que ya existe, o borra con delete_file uno que ya no uses.` };
    }
    this.set(path, content);
    return { ok: true };
  }
  /** Removes a component the draft no longer needs. Required files and the platform's standard pages stay. */
  remove(path: string): AgentEditResult {
    const file = this.map.get(path);
    if (!this.writable(path) || !file) return { ok: false, reason: 'path', message: `No existe un archivo editable ${path}.` };
    if (AGENT_REQUIRED.includes(path) || standardPageRoute(path)) return { ok: false, reason: 'protected', message: `${path} es parte fija de la tienda y no se puede borrar.` };
    this.map.delete(path);
    this.changed.add(path);
    this.version++;
    return { ok: true };
  }
  /** Design files counted against MAX_DESIGN_FILES, for the agent's project index. */
  designBudget() { return { used: designFileCount(this.designFiles()), max: MAX_DESIGN_FILES }; }
  files() { return [...this.map.values()].map(file => ({ ...file })); }
  /** Restore a server-owned checkpoint; normal compile, scope and acceptance checks still apply. A checkpoint holds the
   *  whole draft, so `prune` also drops files it no longer has (a delete_file before the run stopped). */
  restore(files: SourceProjectFileDto[], prune = false) {
    for (const file of files) if (this.writable(file.path) && this.map.get(file.path)?.content !== file.content) this.set(file.path, file.content);
    if (prune) for (const path of [...this.map.keys()]) if (this.writable(path) && !files.some(file => file.path === path)) this.remove(path);
  }
  private designFiles() { return [...this.map.values()].filter(file => nextSourceFile(file.path)); }
  changedPaths() { return [...this.changed]; }
  private writable(path: string) { return nextSourceFile(path) && !AGENT_READ_ONLY.includes(path); }
  private set(path: string, content: string) {
    this.map.set(path, { ...(this.map.get(path) || {}), path, content });
    this.changed.add(path);
    this.version++;
  }
}
