import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import type { SourceSitePurpose } from '../source-site-purpose';
import { nextSourceFile } from '../source-next';
import { AgentWorkspace } from './agent-workspace';
import { verifyAgentDraft } from './agent-verify';
import { agentPreviewSnapshot, captureAgentDraft, type AgentPreviewBase } from './agent-capture';

export type AgentToolName = 'list_files' | 'read_file' | 'edit_file' | 'write_file' | 'screenshot' | 'verify' | 'finish';
export type AgentStep = { kind: AgentToolName; label: string; at: number; thumbnail?: string };
export type AgentToolboxContext = { workspace: AgentWorkspace; previous: SourceProjectFileDto[]; base: AgentPreviewBase; instruction: string; purpose: SourceSitePurpose; maxScreenshots: number; signal?: AbortSignal; sectionScope?: Parameters<typeof verifyAgentDraft>[0]['sectionScope']; gate?: (files: SourceProjectFileDto[]) => Promise<string | null> };

const object = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = { type: 'string' };
const tool = (name: AgentToolName, description: string, properties: Record<string, object>) => ({ type: 'function' as const, name, description, parameters: object(properties), strict: true as const });
export const AGENT_TOOLS = [
  tool('list_files', 'Lista los archivos editables de la tienda.', {}),
  tool('read_file', 'Lee un archivo editable completo.', { path: text }),
  tool('edit_file', 'Reemplaza un fragmento exacto y único de un archivo. Copia search literalmente del archivo actual.', { path: text, search: text, replacement: text }),
  tool('write_file', 'Crea un componente nuevo, o reemplaza un archivo solo en un rediseño o si conserva la mayoría de sus líneas.', { path: text, content: text }),
  tool('screenshot', 'Captura la vista previa del borrador actual para mirarla.', { width: { type: 'integer', enum: [1280, 820, 390] } }),
  tool('verify', 'Comprueba el borrador (TypeScript, contrato de comercio, alcance del pedido, fotos) y devuelve los problemas.', {}),
  tool('finish', 'Termina: resumen para el comercio (español, 1–3 frases) y la lista de secciones construidas.', { summary: text, sections: { type: 'array', items: text } }),
];
const VIEW = { 1280: 'escritorio', 820: 'tablet', 390: 'celular' } as const;

/** Executes the agent's tool calls over its draft. Step labels carry paths and counts, never code or reasoning. */
export class AgentToolbox {
  lastVerify: { version: number; clean: boolean } | null = null;
  finished: { summary: string; sections: string[] } | null = null;
  steps: AgentStep[] = [];
  repairs: string[] = [];
  private shots = 0;
  constructor(private readonly ctx: AgentToolboxContext) {}
  get workspace() { return this.ctx.workspace; }
  draftIsClean() { return Boolean(this.lastVerify?.clean && this.lastVerify.version === this.workspace.version); }

  async run(name: string, rawArgs: string): Promise<{ output: string; image?: string }> {
    let args: any;
    try { args = JSON.parse(rawArgs || '{}'); } catch { return { output: 'Herramienta o argumentos inválidos: los argumentos no son JSON.' }; }
    if (!args || typeof args !== 'object') return { output: 'Herramienta o argumentos inválidos: se esperaba un objeto.' };
    const ws = this.workspace;
    const step = (kind: AgentToolName, label: string, thumbnail?: string) => { this.steps.push({ kind, label, at: Date.now(), ...(thumbnail ? { thumbnail } : {}) }); };
    switch (name) {
      case 'list_files': return { output: JSON.stringify(ws.list()) };
      case 'read_file':
        try { const content = ws.read(String(args.path)); step('read_file', `Leyó ${args.path}`); return { output: content }; }
        catch (error) { return { output: (error as Error).message }; }
      case 'edit_file':
      case 'write_file': {
        const result = name === 'edit_file' ? ws.edit(String(args.path), String(args.search ?? ''), String(args.replacement ?? '')) : ws.write(String(args.path), String(args.content ?? ''));
        if (!result.ok) return { output: result.message + (result.excerpt ? `\nInicio del archivo actual:\n${result.excerpt}` : '') };
        step(name, `${name === 'edit_file' ? 'Editó' : 'Escribió'} ${args.path}`);
        return { output: 'ok' };
      }
      case 'screenshot': {
        const width: 1280 | 820 | 390 = [1280, 820, 390].includes(args.width) ? args.width : 1280;
        if (this.shots >= this.ctx.maxScreenshots) return { output: 'Ya no quedan capturas en este trabajo.' };
        try {
          const shot = await captureAgentDraft(await agentPreviewSnapshot(this.ctx.base, ws.files().filter(f => nextSourceFile(f.path))), width, this.ctx.signal);
          this.shots++;
          step('screenshot', `Tomó una captura (${VIEW[width]})`, shot.thumbnail);
          return { output: shot.errors.length ? `captura adjunta. Errores de la página: ${shot.errors.join(' | ')}` : 'captura adjunta', image: shot.image };
        } catch (error) { return { output: `No se pudo capturar el borrador: ${(error as Error).message.slice(0, 1500)}` }; }
      }
      case 'verify': {
        const result = await verifyAgentDraft({ previous: this.ctx.previous, draft: ws.files(), instruction: this.ctx.instruction, purpose: this.ctx.purpose, sectionScope: this.ctx.sectionScope });
        // Code-only repairs are applied to the draft before the verdict is recorded, so finish sees the same version.
        for (const file of result.files) if (ws.list().includes(file.path) && ws.read(file.path) !== file.content) ws.write(file.path, file.content);
        this.repairs.push(...result.repairs);
        this.lastVerify = { version: ws.version, clean: result.findings.length === 0 };
        const count = result.findings.length;
        step('verify', count ? `Verificó: ${count} ${count === 1 ? 'problema' : 'problemas'}` : 'Verificó: todo en orden');
        return { output: count ? result.findings.map((f, i) => `${i + 1}. [${f.source}] ${f.message}`).join('\n') : 'Todo en orden.' };
      }
      case 'finish': {
        if (!this.draftIsClean()) return { output: 'Antes de terminar, ejecuta verify sin problemas después del último cambio.' };
        const blocked = await this.ctx.gate?.(ws.files()) ?? null;
        if (blocked) return { output: `No se puede guardar todavía: ${blocked.slice(0, 2000)}. Corrígelo, ejecuta verify y vuelve a llamar finish.` };
        this.finished = { summary: String(args.summary || '').slice(0, 600), sections: Array.isArray(args.sections) ? args.sections.map(String).map((s: string) => s.slice(0, 80)).slice(0, 20) : [] };
        step('finish', 'Terminó');
        return { output: 'ok' };
      }
      default: return { output: `Herramienta o argumentos inválidos: ${name} no existe.` };
    }
  }
}
