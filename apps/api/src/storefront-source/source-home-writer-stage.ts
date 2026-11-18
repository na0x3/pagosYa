import { BadGatewayException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { AgentWorkspace } from './agent/agent-workspace';
import { agentRunHeadroom, agentWallWithin, runAgent, type AgentModel, type AGENT_LIMITS } from './agent/agent-loop';
import { agentOpening } from './agent/agent-prompt';
import type { AgentPreviewBase } from './agent/agent-capture';
import type { AgentStep } from './agent/agent-tools';
import { openAiAgentModel } from './agent/agent-model';
import { anthropicAgentModel } from './agent/agent-model-anthropic';
import { HomeWriterToolbox, FOOTER_PATH, HOME_PATH, HOME_WRITER_LIMITS, homeWriterTools, type WriterTemplate } from './agent/home-writer-tools';
import { templateManifest } from '@pagosya/store-templates';
import { createHomeReviewer, homeReviewInstructions, type HomeReviewer } from './agent/home-writer-review';
import { nextSourceFile } from './source-next';
import { sourcePromptCacheKey, sourceUsage } from './source-generation-policy';
import type { AgentStageContext } from './source-agent-stage';
import { readConfigFile } from './store-look';
import { HOME_DIRECTIONS, HOME_FOOTERS, HOME_MOTION_BRIEF, HOME_PLAYFUL_BRIEF, isPlayfulBusiness, parseHomeDirection, pickDesignPlan, pickHomeDirection, pickHomeFooter, type DesignBrief, type DesignPlan, type HomeDirectionChoice, type HomeDirectionId, type HomeFooterId } from './home-directions';
import { recentLooks } from './source-recent-looks';
import { readMasterState } from './source-templates';
import { MASTER_THEME_END, MASTER_THEME_START } from './source-master';
import { STUDIO_RULES } from './source-studio-spike';
import { FRONTEND_DESIGN_SKILL } from './source-design-skill';

/** Owner 2026-11-12 («lets just copy amboras»): a chassis store designs by the frontend-design skill, like Amboras's builder. Only
 *  the platform's facts stay here — none of our style rules (numbered labels, motion counts, bands), which the skill names as the
 *  tells of a generated page. */
const CHASSIS_PLATFORM_RULES = `REGLAS DE LA PLATAFORMA (hechos, no estilo):
- Productos, precios, fotos y logo vienen de './store-data'; los textos van como texto JSX literal (el comercio los edita con doble clic). Español natural; no inventes datos, precios, envíos, opiniones ni certificaciones.
- Colores solo del sistema de diseño (var(--es-paper/ink/muted/accent/deep) y color-mix de ellos); fuentes var(--es-heading) y var(--es-body).
- La portada muestra los productos (data-pagosya-catalog con data-pagosya-filters, o data-pagosya-spotlight con ids reales). Cada foto una sola vez y nunca más ancha que su tamaño real.
- El dueño (2026-11-12): fotos medianas, nunca a todo el ancho (en computadora hasta 60% del ancho y 75% del alto); nada de calcomanías ni insignias redondas con palabras (<Sticker>, círculos punteados); nada de dibujos ni adornos (SVG decorativos, garabatos, huellas, círculos o burbujas de borde): la tienda se luce con tipografía, color, fotos y las partes del kit.
- Lo que check dice en «Debes corregir» se corrige; los avisos de diseño los decides tú con el skill.`;

const HOME_WRITER_RULES = `Estilo (como Amboras): titulares de 72 px o más en escritorio con interlineado apretado, etiquetas pequeñas en mayúsculas (por ejemplo «01 / 04»), una portada amplia donde el texto tiene espacio, bandas del color de la marca, al menos 6 secciones (portada, productos con data-pagosya-catalog, historia, beneficios, preguntas, cierre).
Reglas que bloquean: cada foto una sola vez; nunca 3 fotos o más juntas; nunca una banda oscura (negra) solo con texto — usa una foto real, un fondo claro o el color de la marca; la portada muestra productos (data-pagosya-catalog, o data-pagosya-spotlight con ids reales).
Las bandas de la plantilla se pintan con --es-deep: si es casi negro, dale con set_tokens el color oscuro de la marca (un verde, un vino, un azul), nunca negro.
Los textos van como texto JSX literal (<h1>Deja que el aceite haga lo suyo.</h1>), nunca dentro de arreglos u objetos: así el comercio los edita con doble clic. Español natural; no inventes datos, precios, envíos ni certificaciones.
Productos, precios, fotos y logo vienen de './store-data'. Los consejos de check son opcionales; lo que dice «Debes corregir» no.`;

/** Spec 2026-10-29 §2–3: Amboras's recipe, our rules. Spec 2026-11-04: inside a template, only the home and the colours. */
export function homeWriterInstructions(opts: { template?: string; studio?: boolean; chassis?: boolean } = {}): string {
  // Store chassis (spec 2026-11-12, after Amboras): the store designs its own header, card, cart and product page from its plan.
  if (opts.template && opts.studio && opts.chassis) return `Eres el diseñador de una tienda pagosYa que parte de la plantilla ${opts.template}. Diseñas sus piezas propias: ${HOME_PATH} (write_home), ${FOOTER_PATH} (write_footer), el encabezado, la tarjeta de producto, el carrito y la ficha de producto (write_part), y su sistema de diseño (set_tokens: colores y fuentes).
El checkout y la cuenta son de la plataforma. Toda página va dentro de <Shell>.
Orden: read_chassis (trae el plan de diseño y el cableado de cada pieza); write_brief (el brief de diseño, desde las fotos y las palabras del comercio); set_tokens con su paleta y sus fuentes; write_home; write_part header; write_footer; write_part card; write_part cart; write_part product; check (devuelve lo que debes corregir, los avisos de diseño y las capturas de la portada y de la ficha); mira las capturas con ojo crítico y corrige; check; finish.
Los textos de un bloque de <LibraryHome> van en sus campos; el resto como texto JSX literal.
Tu guía de diseño es este skill (el brief que escribes es su plan; revísalo contra él antes de escribir código):
${FRONTEND_DESIGN_SKILL}

${CHASSIS_PLATFORM_RULES}`;
  // Spike 2026-11-12 (YAPI_STUDIO): Lovable's order — the design system (colours and fonts) first, then the home painted only by it.
  // Owner 2026-11-12 («the footer is the same always»): the studio writes the store's own footer too.
  if (opts.template && opts.studio) return `Eres el diseñador de la PORTADA y el PIE de una tienda pagosYa que usa la plantilla ${opts.template}. Solo cambias ${HOME_PATH} (completo, con write_home), ${FOOTER_PATH} (completo, con write_footer) y su sistema de diseño (set_tokens: colores y fuentes).
El encabezado, el menú, la ficha de producto, el carrito y el checkout son de la plantilla: no los dibujes ni los imites. Toda la portada va dentro de <Shell>.
Orden: read_chassis; write_brief (el brief de diseño, desde las fotos y las palabras del comercio); set_tokens con su paleta y sus fuentes; escribe la portada entera en una sola llamada; write_footer con el pie; check (devuelve lo que debes corregir y las capturas de escritorio y celular); corrige; check; finish.
Los textos de un bloque de <LibraryHome> van en sus campos; el resto como texto JSX literal.
${STUDIO_RULES}
${HOME_WRITER_RULES}`;
  if (opts.template) return `Eres el diseñador de la PORTADA de una tienda pagosYa que usa la plantilla ${opts.template}. Solo cambias ${HOME_PATH} (completo, con write_home) y los colores (set_tokens; las fuentes son de la plantilla y se mantienen).
El encabezado, el menú, el pie, la ficha de producto, el carrito y el checkout son de la plantilla: no los dibujes ni los imites. Toda la portada va dentro de <Shell>.
Orden: read_chassis (trae la portada actual y las secciones probadas de la plantilla); escribe la portada entera en una sola llamada; set_tokens con los colores de la marca; check (devuelve lo que debes corregir y las capturas de escritorio y celular); corrige; check; finish. Usa screenshot solo si necesitas otra vista.
Los textos de un bloque de <LibraryHome> van en sus campos; el resto como texto JSX literal.
${HOME_WRITER_RULES}`;
  return `Eres el diseñador de la PORTADA y el PIE de una tienda pagosYa. Solo cambias ${HOME_PATH} (completo, con write_home), ${FOOTER_PATH} (completo, con write_footer) y los colores y fuentes (set_tokens).
El encabezado, el menú, la ficha de producto, el carrito y el checkout son de la plataforma: no los dibujes ni los imites. Toda la portada va dentro de <Shell>.
Orden: read_chassis (trae la portada actual); escribe la portada entera en una sola llamada; write_footer con el pie; set_tokens con los colores y las fuentes de la marca; check (devuelve lo que debes corregir y las capturas de escritorio y celular); corrige; check; finish. Usa screenshot solo si necesitas otra vista.
${HOME_WRITER_RULES}`;
}

/** Spec 2026-11-04: the themed template a store wears (store-data variants.theme), with its filled layout; null for Esencial. */
export function writerTemplate(files: readonly SourceProjectFileDto[]): WriterTemplate | null {
  const state = readMasterState(files);
  const theme = String((state.variants as Record<string, unknown> | undefined)?.theme ?? '');
  if (!theme || theme === 'none') return null;
  const manifest = templateManifest(theme);
  return manifest ? { id: manifest.id, name: manifest.name, layout: state.layout } : null;
}

type LoopInput = { model: AgentModel; files: SourceProjectFileDto[]; base: AgentPreviewBase; gate: (files: SourceProjectFileDto[]) => Promise<string | null>; task: string;
  images?: unknown[]; signal?: AbortSignal; limits?: Partial<typeof AGENT_LIMITS>; onStep?: (step: AgentStep) => void | Promise<void>; animated?: boolean;
  footer?: boolean; playful?: boolean; calm?: boolean; brandColours?: string[]; template?: WriterTemplate; reviewer?: HomeReviewer; /** Spike 2026-11-12 (YAPI_STUDIO). */ studio?: boolean; /** Store chassis (spec 2026-11-12). */ chassis?: boolean; plan?: DesignPlan; /** Amboras's design brief, kept with the direction. */ onBrief?: (brief: DesignBrief) => void };

/** Spec 2026-10-30 home writer variety: the writer's task — the merchant's words, the store's page direction, what the last
 *  stores already used, and the motion brief only for an animated store. */
export function homeWriterTask(input: { instruction: string; storeName: string; direction: HomeDirectionId; animated: boolean; avoid: { fonts: string[]; papers: string[] };
  footer?: HomeFooterId; playful?: boolean; calm?: boolean; brandColours?: string[]; chassis?: boolean }): string {
  // Owner 2026-10-30 (BOXY): variety never replaces the brand's own colours — the recent backgrounds are only avoided without them.
  const brand = input.brandColours ?? [];
  const avoid = [input.avoid.fonts.length ? `fuentes de titular ${input.avoid.fonts.join(', ')}` : '', !brand.length && input.avoid.papers.length ? `colores de fondo ${input.avoid.papers.join(', ')}` : ''].filter(Boolean).join('; ');
  // Owner 2026-11-12 («copy amboras»): a chassis store's look comes from the merchant's words, its photos and the design skill —
  // not from a rolled page direction, a footer idea or motion quotas.
  if (input.chassis) return [input.instruction, `Tienda: ${input.storeName}`,
    avoid ? `Las últimas tiendas ya usaron ${avoid}: elige otra${brand.length ? '' : ' fuente de titular y otro fondo'} que también vaya con esta marca.` : '',
    brand.length ? `Colores de la marca: ${brand.join(', ')}. Mantenlos: el accent o el deep es uno de ellos.` : ''].filter(Boolean).join('\n\n');
  return [input.instruction, `Tienda: ${input.storeName}`, HOME_DIRECTIONS[input.direction],
    avoid ? `Las últimas tiendas ya usaron ${avoid}: elige otra${brand.length ? '' : ' fuente de titular y otro fondo'} que también vaya con esta marca.` : '',
    brand.length ? `Colores de la marca: ${brand.join(', ')}. Mantenlos: el accent o el deep es uno de ellos.` : '',
    input.calm ? 'Marca tranquila: títulos con mayúscula inicial (nunca todo en mayúsculas), titular de 64 a 110 px con interlineado de 0.95 o más y sin letras apretadas; fuente de titular sobria; mucho aire.' : '',
    input.footer ? HOME_FOOTERS[input.footer] : '',
    input.animated ? HOME_MOTION_BRIEF : 'Movimiento: tranquilo — solo <Reveal> y, como mucho, un <Parallax>.',
    input.playful ? HOME_PLAYFUL_BRIEF : ''].filter(Boolean).join('\n\n');
}

/** The brand's own accent and dark colours: store-data `look.colors` (logo, photos or named by the merchant), never the rolled palette. */
export function brandColoursOf(storeData: string): string[] {
  const match = /export const look = (\{[\s\S]*?\}) as const;/.exec(storeData);
  try {
    const colors = (JSON.parse(match?.[1] ?? '{}') as { colors?: Record<string, unknown> }).colors ?? {};
    return [...new Set(['accent', 'deep'].map(key => colors[key]).filter((value): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)).map(value => value.toLowerCase()))];
  } catch { return []; }
}

/** The page directions of the last stores that have one, newest first (their latest revision's home-direction.json). */
async function recentHomeDirections(prisma: { $queryRaw: (query: Prisma.Sql) => Promise<unknown> }, storeId: string): Promise<{ directions: HomeDirectionId[]; footers: HomeFooterId[]; plans: DesignPlan[] }> {
  try {
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT v."storeId" AS "storeId", (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = 'home-direction.json' LIMIT 1) AS data
      FROM "StoreSourceVersion" v
      WHERE v."storeId" <> ${storeId} AND v.label = 'Portada de YAPI' AND v."createdAt" > now() - interval '60 days'
        AND v.snapshot->'files' @> '[{"path":"home-direction.json"}]'::jsonb
      ORDER BY v."createdAt" DESC LIMIT 40`) as Array<{ storeId: string; data: string | null }>;
    const seen = new Set<string>(), directions: HomeDirectionId[] = [], footers: HomeFooterId[] = [], plans: DesignPlan[] = [];
    for (const row of rows) {
      if (seen.has(row.storeId)) continue;
      seen.add(row.storeId);
      const choice = parseHomeDirection(row.data ?? undefined);
      if (choice) { directions.push(choice.direction); if (choice.footer) footers.push(choice.footer); if (choice.plan) plans.push(choice.plan); }
    }
    return { directions: directions.slice(0, 6), footers: footers.slice(0, 6), plans: plans.slice(0, 6) };
  } catch (error) { new Logger('HomeWriter').warn(`recent home directions unavailable: ${String((error as Error)?.message).slice(0, 200)}`); return { directions: [], footers: [], plans: [] }; }
}

/** Live check 2026-10-29 (PEPPA): the store's look (product page, cards, cart, checkout) stays the previous revision's; only the
 *  fonts follow the ones the writer chose in the theme block (heading face first, body second). */
export function homeWriterDna(previous: Record<string, unknown> | undefined, globalsCss: string): Record<string, unknown> | undefined {
  if (!previous || typeof previous !== 'object') return undefined;
  const start = globalsCss.indexOf(MASTER_THEME_START), end = globalsCss.indexOf(MASTER_THEME_END);
  const faces = start >= 0 && end > start ? [...globalsCss.slice(start, end).matchAll(/url\(assets\/([a-z0-9-]+)\.ttf\)/g)].map(match => match[1]) : [];
  return faces.length ? { ...previous, display: faces[0], text: faces[1] ?? faces[0] } : { ...previous };
}

/** Review 2026-10-29: twice the time on the ChatGPT plan (turns there take 20–90 s), as the main agent gets, and never past the
 *  run's own deadline, so the writer stops itself before the run is aborted. */
export function homeWriterLimits(chatgptPlan: boolean, runDeadline: number, now = Date.now()) {
  return agentWallWithin({ ...HOME_WRITER_LIMITS, wallMs: HOME_WRITER_LIMITS.wallMs * (chatgptPlan ? 2 : 1) }, runDeadline, now);
}

/** Spec 2026-11-04 §5: room for two visual reviews after the writer's own wall. */
export const HOME_WRITER_REVIEW_MS = 360_000;
/** The generation run's deadline for a home writer run: the writer's wall (twice on the ChatGPT plan), its headroom and the reviews. */
export function homeWriterRunTimeout(chatgptPlan: boolean): number {
  return agentRunHeadroom(HOME_WRITER_LIMITS.wallMs * (chatgptPlan ? 2 : 1)) + HOME_WRITER_REVIEW_MS;
}

/** The writer's loop on its own: testable without a generation run. */
export async function runHomeWriterLoop(input: LoopInput) {
  const workspace = new AgentWorkspace(input.files, { redesign: true, lockedShell: true });
  const toolbox = new HomeWriterToolbox({ workspace, base: input.base, gate: input.gate, ...(input.signal ? { signal: input.signal } : {}), ...(input.animated ? { animated: true } : {}),
    ...(input.footer ? { footer: true } : {}), ...(input.playful ? { playful: true } : {}), ...(input.calm ? { calm: true } : {}), ...(input.brandColours?.length ? { brandColours: input.brandColours } : {}),
    ...(input.template ? { template: input.template } : {}), ...(input.reviewer ? { reviewer: input.reviewer } : {}), ...(input.studio ? { studio: true } : {}), ...(input.chassis ? { chassis: true, ...(input.plan ? { plan: input.plan } : {}) } : {}), ...(input.onBrief ? { onBrief: input.onBrief } : {}) });
  const outcome = await runAgent({ model: input.model, toolbox, tools: homeWriterTools({ footer: Boolean(input.footer) && (!input.template || Boolean(input.studio)), chassis: Boolean(input.chassis), studio: Boolean(input.studio) }), verifyTool: 'check',
    instructions: homeWriterInstructions(input.template ? { template: input.template.name, ...(input.studio ? { studio: true } : {}), ...(input.chassis ? { chassis: true } : {}) } : {}), signal: input.signal, onStep: input.onStep,
    limits: { ...HOME_WRITER_LIMITS, ...input.limits }, opening: agentOpening(input.task, [], input.images ?? []) });
  // A run that changed nothing is not a new design (review 2026-10-29): the store keeps its template home and says nothing.
  const accepted = workspace.changedPaths().length > 0
    && ((outcome.status === 'finished' && Boolean(toolbox.finished)) || (!outcome.provider && outcome.reason !== 'cancelled' && !input.signal?.aborted && await toolbox.acceptIfBuildable()));
  return { accepted, outcome, summary: toolbox.finished?.summary ?? '', changed: workspace.changedPaths(), steps: toolbox.steps };
}

/** Inside generate(): runs instead of runAgentStage for execution.homeWriter (spec 2026-10-29 §6). */
export async function runHomeWriterStage(context: AgentStageContext): Promise<void> {
  const { facts, live, acceptCandidate } = context;
  const { prisma, config, metering, storeId, runId, dto, plan, provider, apiKey, agentProvider, budget, signal, attempts, progress, previousFiles, oldFiles, assets, images, data, chatgptPlan, started, runTimeout } = facts;
  await progress?.('building');
  const base: AgentPreviewBase = { brief: dto.brief, files: [...previousFiles.filter(file => !assets.some(asset => asset.path === file.path)), ...assets] };
  // Spec 2026-10-30: the store's page direction — reused when this store already has one, else picked against the last stores.
  const master = readMasterState(previousFiles);
  // Spec 2026-11-04: on a themed template the footer and fonts are the template's; the writer writes the home and the colours.
  const template = writerTemplate(previousFiles);
  // Spike 2026-11-12 (owner: «find how they operate and replicate it»): Lovable's way on a template store.
  const studio = Boolean(template) && config.get<boolean>('app.yapiStudio') === true;
  // Owner 2026-11-12 («the footer is the same always»): a studio store writes its own footer, like the Oct 30 writer.
  const ownFooter = !template || studio;
  // Store chassis (spec 2026-11-12): with YAPI_CHASSIS the studio store also writes its header, card, cart and product page.
  const chassis = studio && config.get<boolean>('app.yapiChassis') === true;
  const variants = (master.variants ?? {}) as Record<string, unknown>;
  // Owner 2026-10-30: fun businesses (sweets, fizzy drinks, toys, games, kids) are always animated and move without scrolling.
  const storeData = previousFiles.find(file => file.path === 'components/store-data.tsx')?.content ?? '';
  const playful = isPlayfulBusiness(`${dto.instruction}\n${storeData}`);
  const calm = variants.mood !== 'bold' && !playful;
  const saved = parseHomeDirection(previousFiles.find(file => file.path === 'home-direction.json')?.content);
  const recent = saved?.footer && (!chassis || saved.plan) ? null : await recentHomeDirections(prisma as never, storeId);
  const choice: HomeDirectionChoice = saved
    ? { ...saved, animated: saved.animated || playful, footer: ownFooter ? (saved.footer ?? pickHomeFooter(storeId, recent?.footers ?? [], playful)) : undefined, ...(playful ? { playful: true } : {}) }
    : { ...pickHomeDirection({ seed: storeId, recent: recent?.directions ?? [], recentFooters: recent?.footers ?? [], fashion: variants.cards === 'fashion', mood: calm ? 'calm' : 'bold', playful }), ...(ownFooter ? {} : { footer: undefined }) };
  if (chassis && !choice.plan) choice.plan = pickDesignPlan(storeId, recent?.plans ?? []);
  const brandColours = brandColoursOf(storeData);
  const looks = await recentLooks(prisma as never, storeId, 6).catch(() => []);
  // The same acceptance chain every build passes, in its lenient form (artwork and edit-scope rules are for chat edits).
  const gate = async (files: SourceProjectFileDto[]) => {
    live.generated = { label: 'Portada de YAPI', files: files.map(file => ({ ...file })) };
    // Review 2026-10-30 (critical): the direction is a platform file the save adds, never one of the files the AI wrote.
    live.homeDirectionFile = { path: 'home-direction.json', content: JSON.stringify(choice) };
    // A template's fonts never change, so its look (and DNA fonts) stays the previous revision's as is.
    const previousDna = readConfigFile(previousFiles).dna;
    live.keptDna = template ? (previousDna && typeof previousDna === 'object' ? { ...previousDna } : undefined) : homeWriterDna(previousDna, files.find(file => file.path === 'styles/globals.css')?.content ?? '');
    live.lenient = true;
    try { await acceptCandidate(); return null; }
    catch (error) { return (error as Error).message; }
    finally { live.lenient = false; }
  };
  const onTurn = (phase: 'home-writer' | 'home-review') => async ({ body, durationMs, status }: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED' }) => {
    const tools = [...(Array.isArray(body?.output) ? body.output : []), ...(Array.isArray(body?.content) ? body.content : [])].filter((item: any) => item?.type === 'function_call' || item?.type === 'tool_use').map((item: any) => String(item.name));
    attempts.push({ model: plan.model, phase, durationMs, status, usage: sourceUsage(plan.model, body?.usage), tools });
    await prisma.storeSourceGeneration.updateMany({ where: { id: runId, status: 'RUNNING' }, data: { attempts: attempts as unknown as Prisma.InputJsonValue } });
    await metering?.record(storeId, 'source-generation', plan.model, body, durationMs, status);
  };
  const effort = config.get<'low' | 'medium' | 'high'>('app.yapiHomeWriterEffort') ?? 'high';
  // Spec 2026-11-04 §5: the review runs on the writer's own model, so each test arm (sol, Opus) reviews itself.
  const makeModel = (phase: 'home-writer' | 'home-review') => agentProvider
    ? anthropicAgentModel({ endpoint: agentProvider.endpoint, apiKey: agentProvider.apiKey, model: plan.model, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), signal, onTurn: onTurn(phase) })
    : openAiAgentModel({ endpoint: provider.endpoint, apiKey, model: plan.model, providerName: provider.name, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), reasoningEffort: effort, signal, onTurn: onTurn(phase),
      // Every turn resends the transcript; a stable key lets the provider bill that prefix at the cached rate (review 2026-10-29).
      promptCacheKey: sourcePromptCacheKey(phase, phase === 'home-review' ? homeReviewInstructions() : homeWriterInstructions(template ? { template: template.name, ...(studio ? { studio: true } : {}), ...(chassis ? { chassis: true } : {}) } : {}), storeId) });
  const model = makeModel('home-writer');
  const reviewer = createHomeReviewer(makeModel('home-review'));
  const task = homeWriterTask({ instruction: dto.instruction, storeName: (data as { storeName?: string }).storeName ?? '', direction: choice.direction, animated: choice.animated,
    footer: choice.footer, playful, calm, brandColours, ...(chassis ? { chassis: true } : {}),
    avoid: { fonts: template ? [] : [...new Set(looks.map(look => look.heading).filter((font): font is string => Boolean(font)))], papers: [...new Set(looks.map(look => look.paper).filter((paper): paper is string => Boolean(paper)))] } });
  const out = await runHomeWriterLoop({ model, files: oldFiles.filter(file => nextSourceFile(file.path)), base, gate, task, signal, animated: choice.animated,
    footer: Boolean(choice.footer) && ownFooter, ...(template ? { template } : {}), ...(studio ? { studio: true } : {}), ...(chassis ? { chassis: true, ...(choice.plan ? { plan: choice.plan } : {}) } : {}), reviewer, playful, calm, brandColours,
    // Amboras's design brief: saved with the store's direction (home-direction.json) the moment it is written.
    ...(studio ? { onBrief: (brief: DesignBrief) => { choice.brief = brief; } } : {}),
    // Store chassis: four more files to write and check.
    limits: { ...homeWriterLimits(chatgptPlan, started + runTimeout), ...(chassis ? { toolCalls: 60 } : {}) },
    images: images.map(image => ({ ...(image as object), detail: 'low' })),
    onStep: async step => { await progress?.detail?.({ label: step.label, ...(step.thumbnail ? { thumbnail: step.thumbnail } : {}) }); } });
  if (!out.accepted) throw new BadGatewayException(`YAPI no pudo terminar la portada${out.outcome.reason ? `: ${out.outcome.reason}` : ''}`);
  live.agentTheme = null; live.agentAccountTheme = null; live.agentMotifPack = undefined; live.agentPolicies = {}; live.agentProductMedia = [];
  live.generated.label = 'Portada de YAPI';
  live.agentOutcome = { summary: out.summary, requirements: [], evidence: [], sections: [], steps: out.steps.map(({ thumbnail: _thumbnail, ...step }) => step) };
}
