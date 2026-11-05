import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { MASTER_THEME_END, MASTER_THEME_START, masterThemeBlock, withMasterTheme } from '../source-master';
import type { AgentLoopToolbox, AgentToolDefinition } from './agent-loop';
import { agentPreviewSnapshot, captureAgentDraft, type AgentPreviewBase } from './agent-capture';
import type { AgentStep } from './agent-tools';
import type { AgentWorkspace } from './agent-workspace';
import { evaluateCalmTitles, evaluateHomeWriterRules, evaluatePlayfulCover, homeWriterVerdict } from './home-writer-checks';
import { AMBIENT_PARTS, HOME_MOTION_BRIEF, ambientPartsUsed, motionPartsUsed } from '../home-directions';
import { SHELL_PATH } from './agent-workspace';
import type { HomeReviewer } from './home-writer-review';

/* Spec 2026-10-29 home page writer: Amboras's recipe on the locked Esencial chassis — one home file and the tokens. */
export const HOME_PATH = 'components/home.tsx';
/** Owner 2026-10-30 («the footer always is the same»): YAPI writes each store's footer; the Shell renders it. */
export const FOOTER_PATH = 'components/footer.tsx';
/** Spec 2026-11-04 writer on templates: the themed template the store wears (its id, name and the sections it filled). */
export type WriterTemplate = { id: string; name: string; layout: unknown[] };
/** Spec 2026-11-04 §4 (owner: «i dont care if cheap or costly i want good stores»): the strongest settings. */
export const HOME_WRITER_LIMITS = { toolCalls: 40, wallMs: 900_000, screenshots: 8 };
const GLOBALS = 'styles/globals.css';
const strictTool = (name: string, description: string, properties: Record<string, object>): AgentToolDefinition =>
  ({ type: 'function', name, description, parameters: { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) }, strict: true });
const text = { type: 'string' };
const hex = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

export const HOME_WRITER_TOOLS: readonly AgentToolDefinition[] = [
  strictTool('read_chassis', 'Lee lo que la portada puede usar: partes del kit, datos de la tienda (store-data), fotos, fuentes y la portada actual.', {}),
  strictTool('write_home', 'Escribe components/home.tsx COMPLETO (reemplaza el archivo). Mantén <Shell>. Los textos van como texto JSX literal.', { content: text }),
  strictTool('write_footer', 'Escribe components/footer.tsx COMPLETO: export default function StoreFooter() con el pie de la tienda. Los textos van como texto JSX literal.', { content: text }),
  strictTool('set_tokens', 'Fija los 5 colores de la tienda (hex) y dos fuentes del catálogo (ids de read_chassis).', { paper: hex, ink: hex, muted: hex, accent: hex, deep: hex, heading: text, body: text }),
  strictTool('check', 'Comprueba la portada en escritorio y celular: lo que debes corregir, los consejos y las dos capturas.', {}),
  strictTool('screenshot', 'Otra captura de la portada, solo si check no bastó (máximo 8 en total).', { width: { type: 'integer', enum: [1280, 390] } }),
  strictTool('finish', 'Termina: resumen para el comercio en español, 1–2 frases simples, sin términos técnicos.', { summary: text }),
];

/** On a template store the footer is the template's: no write_footer (spec 2026-11-04 §2). */
export function homeWriterTools(opts: { footer: boolean }): readonly AgentToolDefinition[] {
  return HOME_WRITER_TOOLS.filter(tool => opts.footer || tool.name !== 'write_footer');
}

/** The theme block's fonts by role (--es-heading, --es-body, --es-mono → catalog ids), or null when the block names none.
 *  By role, not by @font-face order: Palo Alto uses one face for titles and text and a third for labels. */
export function templateFonts(globalsCss: string): { heading: string; body: string; mono?: string } | null {
  const start = globalsCss.indexOf(MASTER_THEME_START), end = globalsCss.indexOf(MASTER_THEME_END);
  if (start < 0 || end <= start) return null;
  const block = globalsCss.slice(start, end);
  const role = (name: string) => {
    const family = new RegExp(`--es-${name}:'([^']+)'`).exec(block)?.[1];
    return family ? SOURCE_FONT_CATALOG.find(font => font.family === family)?.id : undefined;
  };
  const heading = role('heading'), body = role('body'), mono = role('mono');
  return heading && body ? { heading, body, ...(mono ? { mono } : {}) } : null;
}

/** What a template store's home may use besides the kit: the template's tested sections, each with the store's own example.
 *  Library photos resolve «slot:<key>» through store-data photos (library.tsx `slotted`). */
export function templateBrief(template: WriterTemplate): string {
  const examples = template.layout.slice(0, 14).map(block => `- ${String((block as { type?: unknown }).type ?? '')}: ${JSON.stringify(block)}`).join('\n');
  return `PLANTILLA ${template.name}: el encabezado, el menú, el pie, las tarjetas de producto y la ficha de producto son de la plantilla; no los cambies ni los imites. Sus fuentes se quedan; tú eliges los colores.
Secciones probadas de la plantilla — úsalas tal cual, cambia sus textos, o mézclalas con tus propias secciones:
import { LibraryHome } from './library' y <LibraryHome layout={[{ type: 'cover-split', … }]} /> con uno o varios bloques seguidos. Cada bloque va con los campos de su ejemplo.
Toda la portada va dentro de <Shell><main data-lb-home>…</main></Shell>: así una sección inclinada (marquee) no hace que el celular se desplace de lado.
Fotos de un bloque: "slot:<clave>" con una clave de photos (store-data) o la ruta de un archivo de fotos. Cada foto una sola vez en toda la portada.
Ejemplos (los de esta tienda ahora):
${examples}`;
}

/** What the kit and the template give the home; the writer composes with these instead of inventing commerce parts. */
const KIT_BRIEF = `PARTES DISPONIBLES (no inventes otras partes de comercio):
- import Shell from './Shell' — envuelve SIEMPRE toda la portada: <Shell>…</Shell> (encabezado, menú y carrito son de la plataforma; el pie lo escribes tú con write_footer, salvo en una tienda con plantilla).
- import { Parallax, Reveal } from '@pagosya/ui' — <Reveal> anima al entrar; <Parallax> mueve una foto al hacer scroll.
- Grilla de productos: copia la de la portada actual tal cual — data-pagosya-catalog con data-pagosya-filters data-filters-style="chips" (ordenar, color y talla) y data-es-cards={variant('cards', 'compact')} (import { variant } from './Shell'), para que las tarjetas de moda muestren sus tallas. El kit dibuja tarjetas, precios y el botón de agregar.
- Un producto destacado: <div data-pagosya-spotlight="ID"></div> con un id real de los productos.
- import { FeatureSlot } from './features' — secciones listas (preguntas, newsletter, marquee, pasos), como en la portada actual.
- Preguntas frecuentes: <div className="es-biz__faq"><details><summary>Pregunta</summary><p>Respuesta</p></details>…</div> — ya tienen diseño (tarjetas, signo que gira); no les pongas clases ni estilos propios.
- Clases de la plantilla en styles/globals.css (.es-section, .es-h2, .es-display, .es-link, …) y style={{…}} para tamaños y espacios.`;

/** What every footer must keep: the platform fills these hooks (info pages, email signup) and the legal line. */
export const FOOTER_BRIEF = `PIE (${'components/footer.tsx'}, con write_footer): export default function StoreFooter() { return <footer className="es-footer" …>…</footer>; }
Es tuyo: diséñalo para esta tienda, distinto del de la plantilla. Imports: { store, copy, photos } de './store-data', íconos de './icons' (IconMapPin, IconMessageCircle…) y, si quieres, piezas de '@pagosya/ui'. Debe tener SIEMPRE:
- <nav data-pagosya-pages aria-label="Información" /> — la plataforma pone ahí las políticas, términos y contacto.
- <div data-pagosya-subscribe-block>…<div data-pagosya-subscribe-inline data-track="newsletter" /></div> — el correo para novedades.
- enlaces a productos.html y al inicio; {store.city} y WhatsApp (https://wa.me/ con {store.phone}) solo si existen.
- la línea final: {'\\u00a9'} {new Date().getFullYear()} {store.name} · Pagos seguros con pagosYa
Usa el logo ({store.logo}) o el nombre; colores con var(--es-…). Nunca negro solo con texto.`;

/** The Shell with the template's footer swapped for the one YAPI wrote; null when this Shell has no <Footer /> to swap. */
export function shellWithStoreFooter(shell: string): string | null {
  if (/import StoreFooter from '\.\/footer'/.test(shell)) return shell;
  if ((shell.match(/<Footer\s*\/>/g) ?? []).length !== 1) return null;
  const lines = shell.split('\n');
  const lastImport = lines.reduce((at, line, index) => /^import\s/.test(line) ? index : at, -1);
  lines.splice(lastImport + 1, 0, "import StoreFooter from './footer';");
  return lines.join('\n').replace(/<Footer\s*\/>/, '<StoreFooter />');
}

/** What the footer misses of FOOTER_BRIEF's musts. */
export function footerProblems(footer: string): string[] {
  const missing: string[] = [];
  if (!/export default function StoreFooter\b/.test(footer)) missing.push('export default function StoreFooter()');
  if (!/<footer[\s>]/.test(footer)) missing.push('un elemento <footer>');
  if (!/data-pagosya-pages/.test(footer)) missing.push('<nav data-pagosya-pages …/> (políticas y términos)');
  if (!/data-pagosya-subscribe-block/.test(footer) || !/data-pagosya-subscribe-inline/.test(footer)) missing.push('el correo para novedades (data-pagosya-subscribe-block con data-pagosya-subscribe-inline dentro)');
  if (!/\{store\.name\}/.test(footer) || !/\\u00a9|©|&copy;/.test(footer) || !/Pagos seguros con pagosYa/.test(footer)) missing.push('la línea final © año {store.name} · Pagos seguros con pagosYa');
  return missing;
}

/** Owner 2026-10-30 (BOXY «too shouty»): a calm brand's titles are never written all in capitals; capitals are for small labels. */
export function shoutedHeadings(code: string): string[] {
  const found: string[] = [];
  for (const match of code.matchAll(/<(h1|h2)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const words = match[3].replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = words.replace(/[^\p{L}]/gu, '');
    const capsStyle = /textTransform:\s*['"]uppercase['"]/.test(match[2]);
    if (letters.length >= 8 && words.split(' ').length >= 2 && (capsStyle || letters === letters.toUpperCase() && letters !== letters.toLowerCase())) found.push(words.slice(0, 60));
  }
  return found;
}

/** Class names in the home or footer outside the template (es-), kit (ui-) and platform (pagosya-) names that no stylesheet defines. */
export function inventedClasses(code: string, css: string): string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{\s*['"`]([^'"`]*)['"`]\s*\})/g)) for (const name of (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/)) if (name) names.add(name);
  // The template's own es- names include hooks with no rule of their own (es-reviews), so only names outside it are checked.
  return [...names].filter(name => !/^(es-|ui-|pagosya-)/.test(name) && !new RegExp(`\\.${name.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css));
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
/** Near enough to read as the same colour (RGB distance). */
export const nearColour = (a: string, b: string, within = 40) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) <= within; };

export class HomeWriterToolbox implements AgentLoopToolbox {
  steps: AgentStep[] = [];
  lastVerify: { version: number; clean: boolean; hard: boolean } | null = null;
  finished: { summary: string } | null = null;
  stopped = null;
  reviews = 0;
  private shots = 0;
  private lastImages: string[] = [];
  private reviewed: { version: number; problems: string[] } | null = null;
  /** Review 2026-11-04 (I2): the clean draft a review sent back; a fix cut off before its check falls back to it. */
  private reviewedClean: SourceProjectFileDto[] | null = null;
  constructor(private readonly ctx: { workspace: AgentWorkspace; base: AgentPreviewBase; signal?: AbortSignal; gate: (files: SourceProjectFileDto[]) => Promise<string | null>; /** Spec 2026-10-30: the store's home is animated. */ animated?: boolean;
    /** Owner 2026-10-30: YAPI writes the footer (a must before finish); a playful store moves without scrolling; a calm brand
     *  never shouts; the brand's own accent/deep colours (store-data look.colors) stay. */
    footer?: boolean; playful?: boolean; calm?: boolean; brandColours?: string[];
    /** Spec 2026-11-04: the template the store wears; its footer and fonts stay. */ template?: WriterTemplate;
    /** Spec 2026-11-04 §5: a look at the captures before saving, at most reviewRounds (2) times. */ reviewer?: HomeReviewer; reviewRounds?: number }) {}
  get workspace() { return this.ctx.workspace; }
  draftIsClean() { return Boolean(this.lastVerify?.clean && this.lastVerify.version === this.workspace.version); }

  async run(name: string, rawArgs: string): Promise<{ output: string; image?: string; images?: string[] }> {
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
        case 'write_footer': {
          if (this.ctx.template) return { output: 'Esta tienda usa el pie de su plantilla; no escribas uno.' };
          const content = String(args.content ?? '');
          const shell = shellWithStoreFooter(this.workspace.read(SHELL_PATH));
          if (!shell) return { output: 'Esta tienda no admite un pie propio; deja el de la plataforma y termina la portada.' };
          const written = this.workspace.write(FOOTER_PATH, content);
          if (!written.ok) return { output: written.message };
          this.workspace.setShell(shell);
          step('write_home', 'Escribiendo el pie de página');
          const missing = footerProblems(content);
          try { await agentPreviewSnapshot(this.ctx.base, this.workspace.files()); }
          catch (error) { return { output: `Pie escrito, pero no compila: ${(error as Error).message.slice(0, 1500)}` }; }
          return { output: missing.length ? `Pie escrito y compilado, pero le falta: ${missing.join('; ')}.` : 'Pie escrito y compilado.' };
        }
        case 'set_tokens': {
          const kept = this.ctx.template ? templateFonts(this.workspace.read(GLOBALS)) : null;
          const fonts = kept ? [kept.heading, kept.body] : [String(args.heading), String(args.body)];
          const unknown = kept ? undefined : fonts.find(id => !SOURCE_FONT_CATALOG.some(font => font.id === id));
          if (unknown) return { output: `La fuente ${unknown} no está en el catálogo; usa un id de read_chassis.` };
          const colours = { paper: String(args.paper), ink: String(args.ink), muted: String(args.muted), accent: String(args.accent), deep: String(args.deep) };
          // Owner 2026-10-30 (BOXY lost its navy for terracotta): the brand's own accent or dark colour stays one of the five.
          const brand = this.ctx.brandColours ?? [];
          if (brand.length && ![colours.accent, colours.deep].some(colour => brand.some(own => nearColour(colour, own)))) {
            return { output: `Esta marca tiene sus propios colores (${brand.join(', ')}): usa uno de ellos (o uno muy cercano) como accent o deep. Varía el fondo y la fuente, no el color de la marca.` };
          }
          const block = masterThemeBlock(colours, fonts[0], fonts[1], kept?.mono);
          const written = this.workspace.write(GLOBALS, withMasterTheme(this.workspace.read(GLOBALS), block));
          if (!written.ok) return { output: written.message };
          step('set_tokens', 'Eligiendo colores y fuentes');
          const ink = /--es-ink:([^;]+);/.exec(block)?.[1] ?? colours.ink;
          const fixedInk = ink.toLowerCase() !== colours.ink.toLowerCase() ? ` El texto no se leía sobre el fondo; usé ${ink}.` : '';
          return { output: kept ? `Colores guardados. Las fuentes son de la plantilla ${this.ctx.template!.name}; se mantienen.${fixedInk}` : `Colores y fuentes guardados.${fixedInk}` };
        }
        case 'check': {
          const snapshot = await agentPreviewSnapshot(this.ctx.base, this.workspace.files());
          const captures: Array<{ width: number; errors: string[]; image: string; thumbnail?: string }> = [];
          for (const width of [1280, 390] as const) captures.push(await captureAgentDraft(snapshot, width, this.ctx.signal, 'index.html', [], 'normal', undefined, [evaluateHomeWriterRules, ...(this.ctx.calm ? [evaluateCalmTitles] : []), ...(this.ctx.playful ? [evaluatePlayfulCover] : [])]));
          this.lastImages = captures.map(capture => capture.image);
          const verdict = homeWriterVerdict(captures);
          // Review 2026-10-30: the merchant's progress shows the check's capture, now that screenshot calls are rare.
          step('check', 'Comprobando la portada', (captures[0] as { thumbnail?: string } | undefined)?.thumbnail);
          // Owner 2026-10-29 («things like color picker, sorter»): the home's product grid keeps the kit's sort and filter chips.
          // Spec 2026-10-30: an animated store is reminded, never blocked, when it moves fewer than three parts.
          // Live check 2026-10-30 (Oh Belly): the advice alone was ignored. Fewer than 2 kit motion parts must be fixed; 3+ is the aim.
          const moving = this.ctx.animated ? motionPartsUsed(this.workspace.read(HOME_PATH)).length : 3;
          if (moving < 2) verdict.blocking.push('Esta tienda tiene portada animada y usa menos de 2 movimientos del kit: agrega al menos dos de ScrollScale, ParallaxStack, Statement, Marquee, EntranceGroup, ProductShowcase o Hero scrollGrow (importados de \'@pagosya/ui\').');
          else if (moving < 3) verdict.advice.push('La portada animada usa menos de 3 movimientos del kit (ScrollScale, ParallaxStack, Statement, Marquee, EntranceGroup, ProductShowcase, scrollGrow).');
          // Live check 2026-10-30 (Oh Belly ujy3rqxr): the writer cannot write CSS, so a class it invents (oh-grid) does nothing.
          const invented = inventedClasses(`${this.workspace.read(HOME_PATH)}\n${this.footerCode()}`, this.workspace.read(GLOBALS));
          if (invented.length) verdict.blocking.push(`Estas clases no existen en styles/globals.css y no hacen nada: ${invented.slice(0, 6).join(', ')}. Usa clases es- de la plantilla o style={{…}} para el diseño.`);
          if (this.ctx.playful) {
            const ambient = ambientPartsUsed(`${this.workspace.read(HOME_PATH)}\n${this.footerCode()}`).length;
            if (ambient < 2) verdict.blocking.push(`Esta tienda es divertida y su portada debe moverse sin esperar al scroll: usa al menos dos de ${AMBIENT_PARTS.join(', ')} (importados de '@pagosya/ui').`);
          }
          if (this.ctx.footer) {
            const footer = this.footerCode();
            if (!footer) verdict.blocking.push('Falta el pie: escríbelo con write_footer.');
            else { const missing = footerProblems(footer); if (missing.length) verdict.blocking.push(`Al pie le falta: ${missing.join('; ')}.`); }
          }
          if (this.ctx.calm) {
            const shouted = shoutedHeadings(`${this.workspace.read(HOME_PATH)}\n${this.footerCode()}`);
            if (shouted.length) verdict.blocking.push(`Esta marca es tranquila: escribe los títulos con mayúscula inicial, no todo en mayúsculas («${shouted.slice(0, 3).join('», «')}»). Las mayúsculas solo para etiquetas pequeñas.`);
          }
          if (!/data-pagosya-catalog[^>]*data-pagosya-filters|data-pagosya-filters[^>]*data-pagosya-catalog/.test(this.workspace.read(HOME_PATH))) verdict.blocking.push('La grilla de productos perdió ordenar y filtrar por color y talla: deja data-pagosya-filters data-filters-style="chips" en el elemento data-pagosya-catalog, como en la portada de la plantilla.');
          this.lastVerify = { version: this.workspace.version, clean: !verdict.blocking.length, hard: verdict.blocking.length > 0 };
          return { output: [verdict.blocking.length ? `Debes corregir:\n- ${verdict.blocking.join('\n- ')}` : 'Nada que corregir.',
            verdict.advice.length ? `Consejos (opcionales):\n- ${verdict.advice.join('\n- ')}` : '', 'Capturas de escritorio y celular adjuntas.'].filter(Boolean).join('\n'),
            // Token cut 2026-10-30: the captures check already took, so a run needs no separate screenshot calls.
            images: captures.map(capture => capture.image) };
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
          if (this.reviewed?.problems.length && this.reviewed.version === this.workspace.version) {
            return { output: `Todavía no corregiste lo que encontró la revisión:\n- ${this.reviewed.problems.join('\n- ')}\nCorrige, llama check y luego finish.` };
          }
          if (this.ctx.reviewer && this.reviews < (this.ctx.reviewRounds ?? 2)) {
            this.reviews++;
            step('check', 'Revisando cómo se ve');
            const problems = await this.ctx.reviewer(this.lastImages).catch(() => [] as string[]);
            this.reviewed = { version: this.workspace.version, problems };
            if (problems.length) this.reviewedClean = this.workspace.files();
            if (problems.length) return { output: `Revisión visual — Debes corregir:\n- ${problems.join('\n- ')}\nCorrige con write_home o set_tokens, llama check y luego finish.` };
          }
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

  private footerCode() { try { return this.workspace.changedPaths().includes(FOOTER_PATH) ? this.workspace.read(FOOTER_PATH) : ''; } catch { return ''; } }

  /** Out of steps or time: a changed draft whose last check had nothing blocking still ships through the gate. */
  async acceptIfBuildable(): Promise<boolean> {
    if (this.finished) return true;
    if (!this.draftIsClean() && this.reviewedClean) {
      // The fix the review asked for never reached a clean check: the last clean draft saves instead (spec 2026-11-04 §5).
      this.workspace.restore(this.reviewedClean, true);
      this.lastVerify = { version: this.workspace.version, clean: true, hard: false };
    }
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
    const templateFooter = /export function Footer\(\)[\s\S]*?\n\}\n/.exec(this.workspace.read(SHELL_PATH))?.[0];
    return [KIT_BRIEF, ...(this.ctx.template ? [templateBrief(this.ctx.template)] : []), ...(this.ctx.animated ? [HOME_MOTION_BRIEF] : []),
      ...(this.ctx.footer && !this.ctx.template ? [FOOTER_BRIEF, templateFooter ? `El pie actual de la plantilla (solo como referencia de los ganchos; el tuyo debe verse distinto):\n${templateFooter}` : ''] : []),
      `import { … } from './store-data' — exporta: ${exported.join(', ')}. Productos, precios, fotos y logo salen de ahí; nunca los escribas a mano.`,
      `Archivos de fotos: ${photos.join(', ') || 'ninguno (portada solo tipográfica)'}`,
      `fuentes: ${fonts}`,
      `--- ${HOME_PATH} ---\n${this.workspace.read(HOME_PATH)}`,
      `--- components/store-data.tsx (extracto) ---\n${data.slice(0, 6000)}`,
    ].join('\n\n');
  }
}
