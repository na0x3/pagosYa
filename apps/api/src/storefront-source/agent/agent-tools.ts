import type { SourceMediaPolicy } from '../source-media-design';
import { COSMETIC_PARTS } from '../product-theme-css';
import sharp from 'sharp';
import { agentProjectIndex, assertMerchantTaskCoverage, assertTaskFeasibility, validateTaskRequirements, workspaceDigest, type AgentRequirement, type RequirementEvidence } from './agent-task';
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

export type AgentToolName = 'inspect_asset' | 'create_page' | 'plan_task' | 'inspect_project' | 'set_account_appearance' | 'list_files' | 'read_file' | 'edit_file' | 'edit_file_batch' | 'write_file' | 'screenshot' | 'verify' | 'finish' | 'set_product_card_theme';
export type AgentStep = { kind: AgentToolName; label: string; at: number; thumbnail?: string };
export type AgentCompositionFinding = { id: string; page: string; section: string; severity: 'major' | 'minor'; observation: string; correction: string };
export type AgentCompositionReview = { findings: AgentCompositionFinding[]; summary: string };
export type AgentCompositionReviewInput = { snapshot: Awaited<ReturnType<typeof agentPreviewSnapshot>>; captures: Array<{ page: string; width: number; image: string }>; signal?: AbortSignal };
export type AgentToolboxContext = { workspace: AgentWorkspace; previous: SourceProjectFileDto[]; base: AgentPreviewBase; instruction: string; merchantInstruction?: string; purpose: SourceSitePurpose; maxScreenshots: number; signal?: AbortSignal; sectionScope?: Parameters<typeof verifyAgentDraft>[0]['sectionScope']; gate?: (files: SourceProjectFileDto[]) => Promise<string | null>; lenientGate?: (files: SourceProjectFileDto[]) => Promise<string | null>; onPreview?: (files: SourceProjectFileDto[]) => void;
  /** Independent visual review for whole-site design, configured by the caller; at most two calls per run. */
  reviewComposition?: (input: AgentCompositionReviewInput) => Promise<AgentCompositionReview>;
  /** False when the merchant's request does not concern the product page (a local edit elsewhere); the theme tool then refuses. */
  themeAllowed?: boolean;
  mediaPolicy?: SourceMediaPolicy;
  taskRequired?: boolean;
  onDiagnostic?: (finding: { tool: string; digest: string; durationMs: number; output: string }) => void;
  /** Opens a themed draft in a browser and reports what the theme broke; defaults to the real Playwright check. */
  checkTheme?: (snapshot: { files: Array<{ path: string; content: string }> }) => Promise<ThemeCheckFailure[]>;
};

const object = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = { type: 'string' };
const nullableEnum = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] });
const tool = (name: AgentToolName, description: string, properties: Record<string, object>) => ({ type: 'function' as const, name, description, parameters: object(properties), strict: true as const });
export const AGENT_TOOLS = [
  tool('inspect_asset', 'Inspecciona los bytes de una imagen local: dimensiones, formato y vista reducida. No inventes rutas.', { path: text }),
  tool('inspect_project', 'Rutas, propietarios, operaciones y archivos de imágenes disponibles en este borrador.', {}),
  tool('plan_task', 'Registra entre 1 y 12 requisitos del pedido original, sin añadir decoraciones opcionales como obligaciones. El plan no se puede reducir después de editar; solo corregir selectores conservando cada resultado esperado.', { requirements: { type: 'array', minItems: 1, maxItems: 12, items: object({ id: { ...text, description: 'ID único r1, r2, etc.' }, description: text, page: { ...text, description: 'Ruta HTML local, por ejemplo index.html o product.html.' }, check: { type: 'string', enum: ['text','absent_text','image','element','style','navigation','video','video-paused','layout'] }, selector: text, expected: { ...text, description: 'text/absent_text: texto literal; element: entero positivo; style: propiedad:valor; image: assets/foto.webp (varias rutas separadas por comas, TODAS visibles), nunca una descripción, un selector ni una data URL; navigation: pagina.html; video/video-paused: assets/video.mp4; layout: viewport-cover o no-overflow.' }, profile: { type: ['string','null'], enum: ['normal','reduced-motion',null] } }) } }),
  tool('set_account_appearance', 'Cambia la apariencia del formulario de cuenta protegido. Colores hex de 6 dígitos y radio entre 0 y 24px; null conserva el valor.', { background: { type: ['string','null'] }, foreground: { type: ['string','null'] }, accent: { type: ['string','null'] }, radius: { type: ['string','null'] } }),
  tool('create_page', 'Crea una página independiente con URL propia. Reutiliza el Shell real de la tienda en content; después añade su enlace al menú compartido. No crea secciones de inicio.', { slug: text, content: text }),
  tool('list_files', 'Lista los archivos editables de la tienda.', {}),
  tool('read_file', 'Lee un archivo editable completo.', { path: text }),
  tool('edit_file', 'Reemplaza un fragmento exacto y único de un archivo. Copia search literalmente del archivo actual.', { path: text, search: text, replacement: text }),
  tool('edit_file_batch', 'Aplica de 1 a 20 reemplazos exactos en un archivo, en orden, en una sola llamada. Si falla uno, no cambia nada. Agrupa los cambios relacionados; conserva el resto del archivo.', { path: text, edits: { type: 'array', minItems: 1, maxItems: 20, items: object({ search: text, replacement: text }) } }),
  tool('write_file', 'Crea un componente nuevo, o reemplaza un archivo solo en un rediseño o si conserva la mayoría de sus líneas.', { path: text, content: text }),
  tool('screenshot', 'Captura la vista previa del borrador actual para mirarla.', { width: { type: 'integer', enum: [1280, 820, 390] }, page: { type: ['string','null'], description: 'Ruta HTML del índice de páginas; null usa index.html.' } }),
  tool('verify', 'Comprueba TypeScript, comercio, requisitos y fotos. En diseños completos añade revisión visual independiente: corrige solo los hallazgos composition; hay como máximo una corrección y segunda revisión.', {}),
  tool('set_product_card_theme', 'Elige la identidad de la ficha de producto (la dibuja la plataforma; no la estilices con tu CSS): un preset, ajustes opcionales y CSS con guardas sobre las partes [data-part=…]. Cada llamada reemplaza el tema completo. Usa null en lo que no cambies.', {
    preset: nullableEnum(PRESET_IDS), ...Object.fromEntries(Object.entries(SOURCE_DNA_ENUMS.productCard).map(([key, values]) => [key, nullableEnum(values)])),
    css: { type: ['string', 'null'], description: `CSS con guardas: hasta 20 reglas y 3000 caracteres. Partes permitidas: ${COSMETIC_PARTS.join(', ')}. Usa [data-part="nombre"]. price, buy, quantity y opciones de pago están protegidos: nunca los selecciones.` },
  }),
  tool('finish', 'Termina: resumen para el comercio (español, 1–3 frases) y la lista de secciones construidas.', { summary: text, sections: { type: 'array', items: text }, status: { type: 'string', enum: ['completed','partial','blocked'] }, remaining: { type: 'array', items: text } }),
];
const VIEW = { 1280: 'escritorio', 820: 'tablet', 390: 'celular' } as const;

/** Executes the agent's tool calls over its draft. Step labels carry paths and counts, never code or reasoning. */
export class AgentToolbox {
  /** hard: the findings include something that breaks the build or the page; otherwise they are opinions the service can ship past. */
  lastVerify: { version: number; clean: boolean; pageErrors?: boolean; hard?: boolean } | null = null;
  finished: { summary: string; sections: string[] } | null = null;
  requirements: AgentRequirement[] = [];
  evidence: RequirementEvidence[] = [];
  stopped: { status: 'partial' | 'blocked'; summary: string; remaining: string[] } | null = null;
  /** The model itself declared the work partial or blocked; that is its honest report and is never papered over. */
  modelStopped = false;
  steps: AgentStep[] = [];
  repairs: string[] = [];
  /** The product page theme the agent chose; merged into the accepted design when the run finishes. */
  pendingTheme: { productCard: ProductCardParams; productCss: string } | null = null;
  private shots = 0;
  private compositionCalls = 0;
  private compositionCache = new Map<string, AgentCompositionReview>();
  private compositionVerifiedVersion: number | null = null;
  constructor(private readonly ctx: AgentToolboxContext) {}
  get workspace() { return this.ctx.workspace; }
  /**
   * Last resort when a run ends without a clean finish (repeated findings, step or time limit, partial review).
   * A draft that builds and has no page errors ships; palette, visual review, template structure and
   * model-authored requirement checks are advice, never a reason to throw the work away.
   */
  async acceptIfBuildable(): Promise<boolean> {
    if (this.finished) return true;
    if (this.modelStopped) return false;
    if (this.lastVerify?.version === this.workspace.version && this.lastVerify.pageErrors) return false;
    const ws = this.workspace;
    const result = await verifyAgentDraft({ previous: this.ctx.previous, draft: ws.files(), instruction: this.ctx.instruction, purpose: this.ctx.purpose, sectionScope: this.ctx.sectionScope });
    if (result.findings.some(f => f.source === 'contract' || f.source === 'typescript' || f.source === 'runtime')) return false;
    for (const file of result.files) if (ws.list().includes(file.path) && ws.read(file.path) !== file.content) ws.write(file.path, file.content);
    this.repairs.push(...result.repairs);
    // The service gate also fills the candidate the save carries; its lenient mode keeps only the build-level checks.
    if (this.ctx.lenientGate && await this.ctx.lenientGate(ws.files())) return false;
    this.finished = { summary: '', sections: [] };
    return true;
  }
  draftIsClean() { return Boolean(!this.stopped && this.lastVerify?.clean && this.lastVerify.version === this.workspace.version && (!this.ctx.reviewComposition || this.compositionVerifiedVersion === this.workspace.version)); }

  private async reviewComposition(snapshot: AgentCompositionReviewInput['snapshot'], captures: AgentCompositionReviewInput['captures']): Promise<AgentCompositionReview> {
    const key = `${this.workspace.version}:${workspaceDigest(snapshot.files)}`;
    const cached = this.compositionCache.get(key);
    if (cached) return cached;
    if (this.compositionCalls >= 2) {
      this.stopped = { status: 'partial', summary: 'Se agotó la revisión visual: el último cambio no tiene aprobación visual.', remaining: ['composition:review-budget'] };
      return { summary: this.stopped.summary, findings: [{ id: 'review-budget', page: 'index.html', section: 'page', severity: 'major', observation: this.stopped.summary, correction: 'Conserva el borrador y termina como partial; no sigas regenerando.' }] };
    }
    this.compositionCalls++;
    let review: AgentCompositionReview;
    try {
      if (!captures.length) throw new Error('No hay capturas de páginas diseñadas para revisar.');
      review = await this.ctx.reviewComposition!({ snapshot, captures, signal: this.ctx.signal });
      if (!review || !Array.isArray(review.findings) || typeof review.summary !== 'string' || review.findings.some(f => !f || !/^[a-zA-Z0-9_-]{1,80}$/.test(f.id) || !['major','minor'].includes(f.severity) || ![f.page, f.section, f.observation, f.correction].every(value => typeof value === 'string' && value.trim()))) throw new Error('Respuesta de revisión visual inválida.');
    } catch (error) {
      this.stopped = { status: 'partial', summary: 'La comprobación técnica no confirma calidad visual: no se pudo completar la revisión visual.', remaining: ['composition:review-unavailable'] };
      review = { summary: this.stopped.summary, findings: [{ id: 'review-unavailable', page: 'index.html', section: 'page', severity: 'major', observation: (error as Error).message.slice(0, 300), correction: 'Conserva el borrador; termina como partial sin afirmar aprobación visual.' }] };
    }
    this.compositionCache.set(key, review);
    const major = review.findings.filter(f => f.severity === 'major');
    if (!major.length) this.compositionVerifiedVersion = this.workspace.version;
    else if (this.compositionCalls >= 2 && !this.stopped) this.stopped = { status: 'partial', summary: 'La revisión visual sigue detectando problemas tras una corrección; se conservó el borrador sin aprobarlo.', remaining: major.map(f => `composition:${f.id}`) };
    return review;
  }

  private async previewSnapshot() {
    const snapshot = await agentPreviewSnapshot(this.ctx.base, this.workspace.files().filter(f => nextSourceFile(f.path)));
    return this.pendingTheme ? snapshotWithProductTheme(snapshot, this.pendingTheme) : snapshot;
  }

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
    const started = Date.now();
    const version = this.workspace.version;
    const theme = this.pendingTheme;
    let result: { output: string; image?: string };
    try { result = await this.execute(name, rawArgs); }
    catch (error) { result = { output: `No se pudo ejecutar ${name}: ${(error as Error).message.slice(0, 1500)}` }; }
    // Show each renderable stage without waiting for acceptance checks. An incomplete
    // edit keeps the last preview; it never replaces it with an empty/error page.
    if (this.ctx.onPreview && name !== 'verify' && (version !== this.workspace.version || theme !== this.pendingTheme)) {
      try { this.ctx.onPreview((await this.previewSnapshot()).files); } catch { /* keep the last renderable preview */ }
    }
    // No source, inputs, credentials, or images in persistent diagnostics.
    if (!['read_file','list_files','inspect_project'].includes(name)) this.ctx.onDiagnostic?.({ tool: name, digest: workspaceDigest(this.workspace.files()), durationMs: Date.now() - started, output: result.output.split('\nInicio del archivo actual:')[0].slice(0, 3000) });
    return result;
  }
  private async execute(name: string, rawArgs: string): Promise<{ output: string; image?: string }> {
    let args: any;
    try { args = JSON.parse(rawArgs || '{}'); } catch { return { output: 'Herramienta o argumentos inválidos: los argumentos no son JSON.' }; }
    if (!args || typeof args !== 'object') return { output: 'Herramienta o argumentos inválidos: se esperaba un objeto.' };
    const ws = this.workspace;
    const step = (kind: AgentToolName, label: string, thumbnail?: string) => { this.steps.push({ kind, label, at: Date.now(), ...(thumbnail ? { thumbnail } : {}) }); };
    if (this.ctx.taskRequired && !this.requirements.length && ['create_page','edit_file','edit_file_batch','write_file','set_account_appearance','set_product_card_theme'].includes(name)) return { output: 'Primero llama plan_task con todos los requisitos del pedido.' };
    switch (name) {
      case 'create_page': {
        const slug = String(args.slug || '');
        if (!/^[a-z][a-z0-9-]{0,47}$/.test(slug) || ['index','product','checkout','home'].includes(slug)) return { output: 'Usa una dirección como servicios o galeria, sin rutas ni extensión.' };
        const route = slug + '.html';
        if (agentProjectIndex(ws.files()).pages.some(page => page.url === route)) return { output: 'Esa página ya existe; lee y edita su archivo en lugar de crear otra.' };
        const result = ws.write(`components/page-${slug}.tsx`, String(args.content || ''));
        if (!result.ok) return { output: result.message };
        step('create_page', `Creó la página ${route}`);
        return { output: `Página creada: ${route}. Añade enlaces reales href="${route}" al menú compartido, conserva un enlace a index.html, y verifica navegación desde inicio y contenido en ${route} a 1280 y 390.` };
      }
      case 'inspect_asset': {
        const asset = this.ctx.base.files.find(f => f.path === args.path && f.path.startsWith('assets/'));
        if (!asset || !/\.(png|jpe?g|webp|avif|gif)$/i.test(asset.path)) return { output:'La imagen local no existe o su formato no admite inspección.' };
        const bytes = Buffer.from(asset.content, asset.encoding === 'base64' ? 'base64' : 'utf8');
        const media = sharp(bytes, { limitInputPixels: 40_000_000 });
        const metadata = await media.metadata();
        const image = await media.resize({width:1024,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();
        step('inspect_asset', `Inspeccionó ${asset.path}`);
        return { output:JSON.stringify({path:asset.path,format:metadata.format,width:metadata.width,height:metadata.height,bytes:bytes.length,available:true}), image:'data:image/jpeg;base64,'+image.toString('base64') };
      }
      case 'inspect_project': return { output: JSON.stringify(agentProjectIndex([...this.ctx.base.files.filter(f => !nextSourceFile(f.path)), ...ws.files()])) };
      case 'plan_task': {
        const planned = validateTaskRequirements(args.requirements, ws.files());
        assertTaskFeasibility(planned, this.ctx.base.files);
        assertMerchantTaskCoverage(planned, this.ctx.merchantInstruction || this.ctx.instruction);
        if (this.requirements.length && (ws.changedPaths().length || this.pendingTheme)) {
          // A generated selector can become stale. Repair its binding, never the promised outcome.
          const unchangedIntent = planned.length === this.requirements.length && planned.every(next => {
            const original = this.requirements.find(r => r.id === next.id);
            return original && ['id','description','page','check','expected','profile'].every(key => (original as any)[key] === (next as any)[key]);
          });
          if (!unchangedIntent) return { output: 'El plan ya está fijado: conserva todos los requisitos originales. Solo puedes corregir selectores; no cambies descripción, página, comprobación, perfil ni resultado esperado.' };
        }
        this.requirements = planned;
        this.lastVerify = null;
        step('plan_task', `Planificó ${this.requirements.length} requisitos`);
        // The original request is already retained in the opening transcript.
        return { output: JSON.stringify({ requirements: this.requirements }) };
      }
      case 'set_account_appearance': {
        const allowed = /cuenta|login|account|ingres|registro|contraseña|formulario|sitio|tienda|redise|redesign/i.test(this.ctx.instruction);
        if (!allowed) return { output: 'Este pedido no cambia la apariencia de la cuenta.' };
        const values: string[] = [];
        for (const key of ['background','foreground','accent','radius']) {
          if (args[key] == null) continue;
          if (typeof args[key] !== 'string' || !(key === 'radius' ? /^(?:[0-9]|1[0-9]|2[0-4])px$/ : /^#[a-f0-9]{6}$/i).test(args[key])) return { output: 'Valor inválido: ' + key };
          values.push(`--account-${key}: ${args[key]};`);
        }
        if (!values.length) return { output: 'Indica al menos un ajuste.' };
        const path = 'styles/globals.css';
        const css = ws.list().includes(path) ? ws.read(path) : '';
        const result = ws.write(path, css + '\n:root { ' + values.join(' ') + ' }\n');
        if (!result.ok) return { output: result.message };
        step('set_account_appearance', 'Actualizó la apariencia de la cuenta');
        return { output: 'Apariencia aplicada al formulario protegido. Los colores se normalizan para mantener el contraste.' };
      }
      case 'list_files': return { output: JSON.stringify(ws.list()) };
      case 'read_file':
        try { const content = ws.read(String(args.path)); step('read_file', `Leyó ${args.path}`); return { output: content }; }
        catch (error) { return { output: (error as Error).message }; }
      case 'edit_file':
      case 'edit_file_batch':
      case 'write_file': {
        if (name === 'edit_file_batch' && (!Array.isArray(args.edits) || !args.edits.length || args.edits.length > 20 || args.edits.some((edit: any) => !edit || typeof edit.search !== 'string' || typeof edit.replacement !== 'string'))) return { output: 'Indica entre 1 y 20 reemplazos con search y replacement de texto.' };
        const result = name === 'edit_file_batch' ? ws.editBatch(String(args.path), args.edits) : name === 'edit_file' ? ws.edit(String(args.path), String(args.search ?? ''), String(args.replacement ?? '')) : ws.write(String(args.path), String(args.content ?? ''));
        if (!result.ok) return { output: result.message + (result.excerpt ? `\nInicio del archivo actual:\n${result.excerpt}` : '') };
        step(name, `${name === 'write_file' ? 'Escribió' : 'Editó'} ${args.path}`);
        return { output: 'ok' };
      }
      case 'screenshot': {
        const width: 1280 | 820 | 390 = [1280, 820, 390].includes(args.width) ? args.width : 1280;
        if (this.shots >= this.ctx.maxScreenshots) return { output: 'Ya no quedan capturas en este trabajo. No pidas más: si verify está limpio, llama finish.' };
        try {
          const snapshot = await this.previewSnapshot();
          const shot = await captureAgentDraft(snapshot, width, this.ctx.signal, args.page || 'index.html', this.requirements, 'normal', this.ctx.mediaPolicy);
          if (!shot.errors.length) this.ctx.onPreview?.(snapshot.files);
          this.shots++;
          step('screenshot', `Capturó ${args.page || 'index.html'} (${VIEW[width]})`, shot.thumbnail);
          return { output: shot.errors.length ? `captura adjunta. Errores de la página: ${shot.errors.join(' | ')}` : 'captura adjunta', image: shot.image };
        } catch (error) { return { output: `No se pudo capturar el borrador: ${(error as Error).message.slice(0, 1500)}` }; }
      }
      case 'verify': {
        this.lastVerify = null;
        this.compositionVerifiedVersion = null;
        const result = await verifyAgentDraft({ previous: this.ctx.previous, draft: ws.files(), instruction: this.ctx.instruction, purpose: this.ctx.purpose, sectionScope: this.ctx.sectionScope });
        // Code-only repairs are applied to the draft before the verdict is recorded, so finish sees the same version.
        for (const file of result.files) if (ws.list().includes(file.path) && ws.read(file.path) !== file.content) ws.write(file.path, file.content);
        this.repairs.push(...result.repairs);
        const findings: Array<AgentFinding | { source: 'composition'; message: string }> = [...result.findings];
        let compositionReview: AgentCompositionReview | undefined;
        let pageErrors = false;
        // The theme is checked in a real browser only on a draft that builds; a theme that hides, covers or shrinks a
        // protected control loses its CSS (the params stay), and the draft is not clean until verified again.
        if (!findings.length && this.pendingTheme?.productCss) findings.push(...await this.checkPendingTheme());
        if (this.ctx.taskRequired && !this.requirements.length) findings.push({ source: 'scope', message: 'Falta plan_task con los requisitos originales.' });
        if (!findings.length) {
          const blocked = await this.ctx.gate?.(ws.files());
          if (blocked) findings.push({ source: 'scope', message: blocked });
        }
        this.evidence = [];
        if (!findings.length) {
          const snapshot = await this.previewSnapshot();
          // Baseline shopping pages are platform checks, independent of the
          // assertions selected by the model. Do not let a narrow plan omit them.
          const baselinePages = ['index.html', ...(this.ctx.purpose === 'shop' ? ['productos.html', 'product.html', 'checkout.html'] : [])]
            .filter(page => snapshot.files.some(file => file.path === page));
          // Registered custom pages must not escape review because the model omitted them from its plan.
          // Reuse baseline commerce screenshots too so card/PDP/checkout styling shares the review.
          // Platform account/policy utility routes retain technical checks only.
          const authoredPages = this.ctx.reviewComposition ? agentProjectIndex(ws.files()).pages.filter(page => page.owner === 'authored').map(page => page.url) : [];
          const compositionPages = new Set([...authoredPages, ...baselinePages]);
          const captures: AgentCompositionReviewInput['captures'] = [];
          const profiles = new Set(['normal' as const, ...this.requirements.map(r => r.profile || 'normal' as const)]);
          for (const profile of profiles) for (const page of new Set([
            ...(profile === 'normal' ? baselinePages : []),
            ...(profile === 'normal' ? authoredPages : []),
            ...this.requirements.filter(r => (r.profile || 'normal') === profile).map(r => r.page),
          ])) for (const width of [1280, 390] as const) {
            const shot = await captureAgentDraft(snapshot, width, this.ctx.signal, page, this.requirements, profile, this.ctx.mediaPolicy);
            if (this.ctx.reviewComposition && profile === 'normal' && compositionPages.has(page)) captures.push({ page, width, image: shot.image });
            this.evidence.push(...shot.evidence);
            if (shot.errors.length) pageErrors = true;
            findings.push(...shot.errors.map(message => ({ source: 'scope' as const, message: `${page} (${width}): ${message}` })));
          }
          findings.push(...this.evidence.filter(e => !e.passed).map(e => ({ source: 'scope' as const, message: `${e.page} (${e.width}) ${e.id}: ${e.detail}` })));
          if (!findings.length && this.ctx.reviewComposition) {
            compositionReview = await this.reviewComposition(snapshot, captures);
            findings.push(...compositionReview.findings.filter(f => f.severity === 'major').map(f => ({ source: 'composition' as const, message: `[composition:${f.id}] ${f.page} / ${f.section}: ${f.observation} Corrección acotada: ${f.correction}` })));
            // A cached clean result still verifies this exact version without a second provider call.
            if (!findings.length) this.compositionVerifiedVersion = ws.version;
          }
        }
        this.lastVerify = { version: ws.version, clean: findings.length === 0, pageErrors, hard: pageErrors || result.findings.some(f => f.source === 'contract' || f.source === 'typescript' || f.source === 'runtime') };
        const count = findings.length;
        // A clean draft is what the merchant sees appear in the preview while YAPI keeps working.
        if (!count && this.ctx.onPreview) {
          try { this.ctx.onPreview((await this.previewSnapshot()).files); } catch { /* the preview is best-effort */ }
        }
        step('verify', count ? `Verificó: ${count} ${count === 1 ? 'problema' : 'problemas'}` : this.ctx.reviewComposition ? 'Verificación técnica y revisión visual completadas' : 'Verificó: todo en orden');
        const visualStatus = compositionReview ? this.stopped ? `\nVerificación técnica aprobada; revisión visual sin aprobar. ${this.stopped.summary} Termina como partial.` : '\nVerificación técnica aprobada; revisión visual pendiente. Corrige solo los problemas indicados; hay como máximo una corrección y una segunda revisión.' : '';
        return { output: count ? findings.map((f, i) => `${i + 1}. [${f.source}] ${f.message}`).join('\n') + visualStatus : this.ctx.reviewComposition ? 'Todo en orden. Verificación técnica aprobada y revisión visual independiente sin problemas mayores. Termina sin cambios opcionales.' : 'Todo en orden.' };
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
          this.lastVerify = null;
          step('set_product_card_theme', `Eligió la identidad de la ficha de producto${chosen.preset ? ` (${chosen.preset})` : ''}`);
          const card = Object.entries(result.dna.productCard).map(([key, value]) => `${key}=${value}`).join(', ');
          const rules = (result.dna.productCss.match(/\{/g) ?? []).length;
          const dropped = result.report.dropped.map(item => `- ${item.declaration ?? item.rule ?? ''} ${item.reason}`.trim());
          return { output: [`Tema de la ficha guardado en el borrador${chosen.preset ? ` (preset ${chosen.preset})` : ''}: ${card}. CSS: ${rules} reglas.`, dropped.length ? `El saneador descartó:\n${dropped.join('\n')}\nCorrígelo y vuelve a llamar la herramienta (reemplaza el tema completo).` : 'Nada descartado.'].join('\n') };
        } catch (error) { return { output: `Herramienta o argumentos inválidos: ${(error as Error).message}` }; }
      }
      case 'finish': {
        if (this.stopped) return { output: 'Borrador incompleto: ' + this.stopped.summary };
        if (args.status === 'partial' || args.status === 'blocked') {
          this.stopped = { status: args.status, summary: String(args.summary || '').slice(0, 600), remaining: this.requirements.map(r => r.id) };
          this.modelStopped = true;
          step('finish', args.status === 'blocked' ? 'Trabajo bloqueado' : 'Trabajo incompleto');
          return { output: 'Borrador incompleto; no se guardará como una revisión terminada.' };
        }
        if (this.ctx.taskRequired && (!this.requirements.length || args.status !== 'completed' || !Array.isArray(args.remaining) || args.remaining.length)) return { output: 'Completa cada requisito o termina como partial/blocked indicando lo pendiente.' };
        if (/no (?:pude|pudimos|se pudo)|incomplet|could not|couldn.t|unable to/i.test(String(args.summary || ''))) return { output: 'El resumen indica trabajo incompleto. Usa status partial o blocked y explica lo pendiente.' };
        if (!this.draftIsClean()) return { output: 'Antes de terminar, ejecuta verify sin problemas después del último cambio.' };
        // verify already ran the gate for this exact workspace version. Re-running it here could mutate checked source.
        this.finished = { summary: String(args.summary || '').slice(0, 600), sections: Array.isArray(args.sections) ? args.sections.map(String).map((s: string) => s.slice(0, 80)).slice(0, 20) : [] };
        step('finish', 'Terminó');
        return { output: 'ok' };
      }
      default: return { output: `Herramienta o argumentos inválidos: ${name} no existe.` };
    }
  }
}
