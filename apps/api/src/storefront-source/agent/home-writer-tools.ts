import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { masterThemeBlock, withMasterTheme } from '../source-master';
import type { AgentLoopToolbox, AgentToolDefinition } from './agent-loop';
import { agentPreviewSnapshot, captureAgentDraft, type AgentPreviewBase } from './agent-capture';
import type { AgentStep } from './agent-tools';
import type { AgentWorkspace } from './agent-workspace';
import { evaluateHomeWriterRules, homeWriterVerdict } from './home-writer-checks';

/* Spec 2026-10-29 home page writer: Amboras's recipe on the locked Esencial chassis — one home file and the tokens. */
export const HOME_PATH = 'components/home.tsx';
export const HOME_WRITER_LIMITS = { toolCalls: 24, wallMs: 360_000, screenshots: 4 };
const GLOBALS = 'styles/globals.css';
const strictTool = (name: string, description: string, properties: Record<string, object>): AgentToolDefinition =>
  ({ type: 'function', name, description, parameters: { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) }, strict: true });
const text = { type: 'string' };
const hex = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

export const HOME_WRITER_TOOLS: readonly AgentToolDefinition[] = [
  strictTool('read_chassis', 'Lee lo que la portada puede usar: partes del kit, datos de la tienda (store-data), fotos, fuentes y la portada actual.', {}),
  strictTool('write_home', 'Escribe components/home.tsx COMPLETO (reemplaza el archivo). Mantén <Shell>. Los textos van como texto JSX literal.', { content: text }),
  strictTool('set_tokens', 'Fija los 5 colores de la tienda (hex) y dos fuentes del catálogo (ids de read_chassis).', { paper: hex, ink: hex, muted: hex, accent: hex, deep: hex, heading: text, body: text }),
  strictTool('check', 'Comprueba la portada en escritorio y celular: lo que debes corregir y los consejos.', {}),
  strictTool('screenshot', 'Captura la portada para mirarla (máximo 4 en total).', { width: { type: 'integer', enum: [1280, 390] } }),
  strictTool('finish', 'Termina: resumen para el comercio en español, 1–2 frases simples, sin términos técnicos.', { summary: text }),
];

/** What the kit and the template give the home; the writer composes with these instead of inventing commerce parts. */
const KIT_BRIEF = `PARTES DISPONIBLES (no inventes otras partes de comercio):
- import Shell from './Shell' — envuelve SIEMPRE toda la portada: <Shell>…</Shell> (encabezado, menú, carrito y pie son de la plataforma).
- import { Parallax, Reveal } from '@pagosya/ui' — <Reveal> anima al entrar; <Parallax> mueve una foto al hacer scroll.
- Grilla de productos: copia la de la portada actual tal cual — data-pagosya-catalog con data-pagosya-filters data-filters-style="chips" (ordenar, color y talla) y data-es-cards={variant('cards', 'compact')} (import { variant } from './Shell'), para que las tarjetas de moda muestren sus tallas. El kit dibuja tarjetas, precios y el botón de agregar.
- Un producto destacado: <div data-pagosya-spotlight="ID"></div> con un id real de los productos.
- import { FeatureSlot } from './features' — secciones listas (preguntas, newsletter, marquee, pasos), como en la portada actual.
- Clases de la plantilla en styles/globals.css (.es-section, .es-h2, .es-display, .es-link, …) y style={{…}} para tamaños y espacios.`;

export class HomeWriterToolbox implements AgentLoopToolbox {
  steps: AgentStep[] = [];
  lastVerify: { version: number; clean: boolean; hard: boolean } | null = null;
  finished: { summary: string } | null = null;
  stopped = null;
  private shots = 0;
  constructor(private readonly ctx: { workspace: AgentWorkspace; base: AgentPreviewBase; signal?: AbortSignal; gate: (files: SourceProjectFileDto[]) => Promise<string | null> }) {}
  get workspace() { return this.ctx.workspace; }
  draftIsClean() { return Boolean(this.lastVerify?.clean && this.lastVerify.version === this.workspace.version); }

  async run(name: string, rawArgs: string): Promise<{ output: string; image?: string }> {
    let args: Record<string, unknown>;
    try { args = JSON.parse(rawArgs || '{}'); } catch { return { output: 'Argumentos JSON no válidos.' }; }
    const step = (kind: AgentStep['kind'], label: string, thumbnail?: string) => { this.steps.push({ kind, label, at: Date.now(), ...(thumbnail ? { thumbnail } : {}) }); };
    try {
      switch (name) {
        case 'read_chassis': step('read_chassis', 'Leyendo la tienda'); return { output: this.chassis() };
        case 'write_home': {
          const written = this.workspace.write(HOME_PATH, String(args.content ?? ''));
          if (!written.ok) return { output: written.message };
          step('write_home', 'Escribiendo la portada');
          try { await agentPreviewSnapshot(this.ctx.base, this.workspace.files()); }
          catch (error) { return { output: `Portada escrita, pero no compila: ${(error as Error).message.slice(0, 1500)}` }; }
          return { output: 'Portada escrita y compilada. Llama check o screenshot.' };
        }
        case 'set_tokens': {
          const fonts = [String(args.heading), String(args.body)];
          const unknown = fonts.find(id => !SOURCE_FONT_CATALOG.some(font => font.id === id));
          if (unknown) return { output: `La fuente ${unknown} no está en el catálogo; usa un id de read_chassis.` };
          const colours = { paper: String(args.paper), ink: String(args.ink), muted: String(args.muted), accent: String(args.accent), deep: String(args.deep) };
          const block = masterThemeBlock(colours, fonts[0], fonts[1]);
          const written = this.workspace.write(GLOBALS, withMasterTheme(this.workspace.read(GLOBALS), block));
          if (!written.ok) return { output: written.message };
          step('set_tokens', 'Eligiendo colores y fuentes');
          const ink = /--es-ink:([^;]+);/.exec(block)?.[1] ?? colours.ink;
          return { output: `Colores y fuentes guardados.${ink.toLowerCase() !== colours.ink.toLowerCase() ? ` El texto no se leía sobre el fondo; usé ${ink}.` : ''}` };
        }
        case 'check': {
          step('check', 'Comprobando la portada');
          const snapshot = await agentPreviewSnapshot(this.ctx.base, this.workspace.files());
          const captures: Array<{ width: number; errors: string[] }> = [];
          for (const width of [1280, 390] as const) captures.push(await captureAgentDraft(snapshot, width, this.ctx.signal, 'index.html', [], 'normal', undefined, [evaluateHomeWriterRules]));
          const verdict = homeWriterVerdict(captures);
          // Owner 2026-10-29 («things like color picker, sorter»): the home's product grid keeps the kit's sort and filter chips.
          if (!/data-pagosya-catalog[^>]*data-pagosya-filters|data-pagosya-filters[^>]*data-pagosya-catalog/.test(this.workspace.read(HOME_PATH))) verdict.blocking.push('La grilla de productos perdió ordenar y filtrar por color y talla: deja data-pagosya-filters data-filters-style="chips" en el elemento data-pagosya-catalog, como en la portada de la plantilla.');
          this.lastVerify = { version: this.workspace.version, clean: !verdict.blocking.length, hard: verdict.blocking.length > 0 };
          return { output: [verdict.blocking.length ? `Debes corregir:\n- ${verdict.blocking.join('\n- ')}` : 'Nada que corregir.',
            verdict.advice.length ? `Consejos (opcionales):\n- ${verdict.advice.join('\n- ')}` : ''].filter(Boolean).join('\n') };
        }
        case 'screenshot': {
          if (this.shots >= HOME_WRITER_LIMITS.screenshots) return { output: 'No quedan capturas. Usa check y termina.' };
          this.shots++;
          const width = args.width === 390 ? 390 : 1280;
          const shot = await captureAgentDraft(await agentPreviewSnapshot(this.ctx.base, this.workspace.files()), width, this.ctx.signal);
          step('screenshot', width === 390 ? 'Mirando en celular' : 'Mirando en escritorio', shot.thumbnail);
          return { output: `Captura de ${width === 390 ? 'celular' : 'escritorio'} adjunta.`, image: shot.image };
        }
        case 'finish': {
          if (!this.workspace.changedPaths().length) return { output: 'Todavía no cambiaste la portada: escríbela con write_home antes de terminar.' };
          if (!this.draftIsClean()) return { output: 'Antes de terminar, llama check sobre la versión actual y corrige lo que bloquea.' };
          const diagnostic = await this.ctx.gate(this.workspace.files());
          if (diagnostic) { this.lastVerify = { version: this.workspace.version, clean: false, hard: true }; return { output: `La tienda no se puede guardar todavía: ${diagnostic.slice(0, 1500)}` }; }
          this.finished = { summary: String(args.summary ?? '').trim() || 'Diseñé una portada nueva para tu tienda.' };
          step('finish', 'Listo');
          return { output: 'Listo.' };
        }
        default: return { output: `Herramienta desconocida: ${name}.` };
      }
    } catch (error) { return { output: `Falló ${name}: ${(error as Error).message.slice(0, 800)}` }; }
  }

  /** Out of steps or time: a changed draft whose last check had nothing blocking still ships through the gate. */
  async acceptIfBuildable(): Promise<boolean> {
    if (this.finished) return true;
    if (!this.workspace.changedPaths().length || !this.draftIsClean()) return false;
    if (await this.ctx.gate(this.workspace.files())) return false;
    this.finished = { summary: 'Diseñé una portada nueva para tu tienda.' };
    return true;
  }

  private chassis(): string {
    const data = [...this.workspace.files(), ...this.ctx.base.files].find(file => file.path === 'components/store-data.tsx')?.content ?? '';
    const exported = [...data.matchAll(/export const (\w+)/g)].map(match => match[1]);
    const photos = this.ctx.base.files.filter(file => file.path.startsWith('assets/') && /\.(jpe?g|png|webp|mp4)$/i.test(file.path)).map(file => file.path);
    const fonts = SOURCE_FONT_CATALOG.map(font => `${font.id} (${font.family}, ${font.role})`).join(', ');
    return [KIT_BRIEF,
      `import { … } from './store-data' — exporta: ${exported.join(', ')}. Productos, precios, fotos y logo salen de ahí; nunca los escribas a mano.`,
      `Archivos de fotos: ${photos.join(', ') || 'ninguno (portada solo tipográfica)'}`,
      `fuentes: ${fonts}`,
      `--- ${HOME_PATH} ---\n${this.workspace.read(HOME_PATH)}`,
      `--- components/store-data.tsx (extracto) ---\n${data.slice(0, 6000)}`,
    ].join('\n\n');
  }
}
