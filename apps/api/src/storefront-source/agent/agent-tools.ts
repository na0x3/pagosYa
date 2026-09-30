import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import type { SourceSitePurpose } from '../source-site-purpose';
import { nextSourceFile } from '../source-next';
import { AgentWorkspace } from './agent-workspace';
import { verifyAgentDraft, type AgentFinding } from './agent-verify';
import { checkProductThemeOnSnapshot, type ThemeCheckFailure } from '../product-theme-check';
import { agentPreviewSnapshot, captureAgentDraft, type AgentPreviewBase } from './agent-capture';
import { SOURCE_DNA_ENUMS } from '../source-dna';
import { PRESET_IDS, type ProductCardParams } from '../source-product-card-presets';
import { resolveProductTheme, snapshotWithProductTheme, type ProductThemeInput } from '../product-theme';

export type AgentToolName = 'list_files' | 'read_file' | 'edit_file' | 'write_file' | 'screenshot' | 'verify' | 'finish' | 'set_product_card_theme';
export type AgentStep = { kind: AgentToolName; label: string; at: number; thumbnail?: string };
export type AgentToolboxContext = { workspace: AgentWorkspace; previous: SourceProjectFileDto[]; base: AgentPreviewBase; instruction: string; purpose: SourceSitePurpose; maxScreenshots: number; signal?: AbortSignal; sectionScope?: Parameters<typeof verifyAgentDraft>[0]['sectionScope']; gate?: (files: SourceProjectFileDto[]) => Promise<string | null>; onPreview?: (files: SourceProjectFileDto[]) => void;
  /** False when the merchant's request does not concern the product page (a local edit elsewhere); the theme tool then refuses. */
  themeAllowed?: boolean;
  /** Opens a themed draft in a browser and reports what the theme broke; defaults to the real Playwright check. */
  checkTheme?: (snapshot: { files: Array<{ path: string; content: string }> }) => Promise<ThemeCheckFailure[]>;
};

const object = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = { type: 'string' };
const nullableEnum = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] });
const tool = (name: AgentToolName, description: string, properties: Record<string, object>) => ({ type: 'function' as const, name, description, parameters: object(properties), strict: true as const });
export const AGENT_TOOLS = [
  tool('list_files', 'Lista los archivos editables de la tienda.', {}),
  tool('read_file', 'Lee un archivo editable completo.', { path: text }),
  tool('edit_file', 'Reemplaza un fragmento exacto y único de un archivo. Copia search literalmente del archivo actual.', { path: text, search: text, replacement: text }),
  tool('write_file', 'Crea un componente nuevo, o reemplaza un archivo solo en un rediseño o si conserva la mayoría de sus líneas.', { path: text, content: text }),
  tool('screenshot', 'Captura la vista previa del borrador actual para mirarla.', { width: { type: 'integer', enum: [1280, 820, 390] } }),
  tool('verify', 'Comprueba el borrador (TypeScript, contrato de comercio, alcance del pedido, fotos) y devuelve los problemas.', {}),
  tool('set_product_card_theme', 'Elige la identidad de la ficha de producto (la dibuja la plataforma; no la estilices con tu CSS): un preset, ajustes opcionales y CSS con guardas sobre las partes [data-part=…]. Cada llamada reemplaza el tema completo. Usa null en lo que no cambies.', {
    preset: nullableEnum(PRESET_IDS), ...Object.fromEntries(Object.entries(SOURCE_DNA_ENUMS.productCard).map(([key, values]) => [key, nullableEnum(values)])),
    css: { type: ['string', 'null'], description: 'CSS con guardas: hasta 20 reglas y 3000 caracteres, solo selectores [data-part="…"] de las partes cosméticas.' },
  }),
  tool('finish', 'Termina: resumen para el comercio (español, 1–3 frases) y la lista de secciones construidas.', { summary: text, sections: { type: 'array', items: text } }),
];
const VIEW = { 1280: 'escritorio', 820: 'tablet', 390: 'celular' } as const;

/** Executes the agent's tool calls over its draft. Step labels carry paths and counts, never code or reasoning. */
export class AgentToolbox {
  lastVerify: { version: number; clean: boolean } | null = null;
  finished: { summary: string; sections: string[] } | null = null;
  steps: AgentStep[] = [];
  repairs: string[] = [];
  /** The product page theme the agent chose; merged into the accepted design when the run finishes. */
  pendingTheme: { productCard: ProductCardParams; productCss: string } | null = null;
  private shots = 0;
  constructor(private readonly ctx: AgentToolboxContext) {}
  get workspace() { return this.ctx.workspace; }
  draftIsClean() { return Boolean(this.lastVerify?.clean && this.lastVerify.version === this.workspace.version); }

  /** Opens the draft's product page with the pending theme applied. Any failure, or no way to check, removes the CSS. */
  private async checkPendingTheme(): Promise<AgentFinding[]> {
    const theme = this.pendingTheme!;
    const drop = (messages: string[]): AgentFinding[] => {
      this.pendingTheme = { productCard: theme.productCard, productCss: '' };
      return [...messages.map(message => ({ source: 'theme' as const, message })), { source: 'theme' as const, message: 'Se quitó el CSS de la ficha de producto; los ajustes del preset se conservan. Llama de nuevo a set_product_card_theme con otro CSS si lo quieres.' }];
    };
    try {
      const snapshot = snapshotWithProductTheme(await agentPreviewSnapshot(this.ctx.base, this.workspace.files().filter(f => nextSourceFile(f.path))), theme);
      const failures = await (this.ctx.checkTheme ?? (snap => checkProductThemeOnSnapshot(snap as never, { signal: this.ctx.signal })))(snapshot);
      return failures.length ? drop(failures.map(f => `${f.control} (${f.viewport}): ${f.reason}`)) : [];
    } catch (error) { return drop([`No se pudo comprobar la ficha de producto: ${(error as Error).message.slice(0, 300)}`]); }
  }

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
          const snapshot = await agentPreviewSnapshot(this.ctx.base, ws.files().filter(f => nextSourceFile(f.path)));
          const shot = await captureAgentDraft(snapshot, width, this.ctx.signal);
          if (!shot.errors.length) this.ctx.onPreview?.(snapshot.files);
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
        const findings = [...result.findings];
        // The theme is checked in a real browser only on a draft that builds; a theme that hides, covers or shrinks a
        // protected control loses its CSS (the params stay), and the draft is not clean until verified again.
        if (!findings.length && this.pendingTheme?.productCss) findings.push(...await this.checkPendingTheme());
        this.lastVerify = { version: ws.version, clean: findings.length === 0 };
        const count = findings.length;
        // A clean draft is what the merchant sees appear in the preview while YAPI keeps working.
        if (!count && this.ctx.onPreview) {
          try { this.ctx.onPreview((await agentPreviewSnapshot(this.ctx.base, ws.files().filter(f => nextSourceFile(f.path)))).files); } catch { /* the preview is best-effort */ }
        }
        step('verify', count ? `Verificó: ${count} ${count === 1 ? 'problema' : 'problemas'}` : 'Verificó: todo en orden');
        return { output: count ? findings.map((f, i) => `${i + 1}. [${f.source}] ${f.message}`).join('\n') : 'Todo en orden.' };
      }
      case 'set_product_card_theme': {
        if (this.ctx.themeAllowed === false) return { output: 'Este pedido no cambia la ficha de producto.' };
        const chosen: ProductThemeInput = {};
        if (typeof args.preset === 'string') chosen.preset = args.preset as ProductThemeInput['preset'];
        const params = Object.fromEntries(Object.keys(SOURCE_DNA_ENUMS.productCard).filter(key => typeof args[key] === 'string').map(key => [key, args[key]]));
        if (Object.keys(params).length) chosen.params = params as ProductThemeInput['params'];
        if (typeof args.css === 'string' && args.css.trim()) chosen.css = args.css;
        if (!chosen.preset && !chosen.params && !chosen.css) return { output: 'No cambió nada: indica un preset, algún ajuste o CSS.' };
        try {
          const result = await resolveProductTheme(chosen);
          this.pendingTheme = result.dna;
          step('set_product_card_theme', `Eligió la identidad de la ficha de producto${chosen.preset ? ` (${chosen.preset})` : ''}`);
          const card = Object.entries(result.dna.productCard).map(([key, value]) => `${key}=${value}`).join(', ');
          const rules = (result.dna.productCss.match(/\{/g) ?? []).length;
          const dropped = result.report.dropped.map(item => `- ${item.declaration ?? item.rule ?? ''} ${item.reason}`.trim());
          return { output: [`Tema de la ficha guardado en el borrador${chosen.preset ? ` (preset ${chosen.preset})` : ''}: ${card}. CSS: ${rules} reglas.`, dropped.length ? `El saneador descartó:\n${dropped.join('\n')}\nCorrígelo y vuelve a llamar la herramienta (reemplaza el tema completo).` : 'Nada descartado.'].join('\n') };
        } catch (error) { return { output: `Herramienta o argumentos inválidos: ${(error as Error).message}` }; }
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
