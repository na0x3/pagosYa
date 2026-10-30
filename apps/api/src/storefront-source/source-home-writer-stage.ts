import { BadGatewayException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { AgentWorkspace } from './agent/agent-workspace';
import { runAgent, type AgentModel, type AGENT_LIMITS } from './agent/agent-loop';
import { agentOpening } from './agent/agent-prompt';
import type { AgentPreviewBase } from './agent/agent-capture';
import type { AgentStep } from './agent/agent-tools';
import { openAiAgentModel } from './agent/agent-model';
import { anthropicAgentModel } from './agent/agent-model-anthropic';
import { HomeWriterToolbox, HOME_PATH, HOME_WRITER_LIMITS, HOME_WRITER_TOOLS } from './agent/home-writer-tools';
import { nextSourceFile } from './source-next';
import { sourceUsage } from './source-generation-policy';
import type { AgentStageContext } from './source-agent-stage';

/** Spec 2026-10-29 §2–3: Amboras's recipe, our rules. */
export function homeWriterInstructions(): string {
  return `Eres el diseñador de la PORTADA de una tienda pagosYa. Solo cambias ${HOME_PATH} (completo, con write_home) y los colores y fuentes (set_tokens).
El encabezado, el menú, el pie, la ficha de producto, el carrito y el checkout son de la plataforma: no los dibujes ni los imites. Toda la portada va dentro de <Shell>.
Orden: read_chassis; escribe la portada entera en una sola llamada; set_tokens con los colores y las fuentes de la marca; check; una captura de escritorio y una de celular; corrige; finish.
Estilo (como Amboras): titulares de 72 px o más en escritorio con interlineado apretado, etiquetas pequeñas en mayúsculas (por ejemplo «01 / 04»), una portada amplia donde el texto tiene espacio, bandas del color de la marca, al menos 6 secciones (portada, productos con data-pagosya-catalog, historia, beneficios, preguntas, cierre).
Reglas que bloquean: cada foto una sola vez; nunca 3 fotos o más juntas; nunca una banda oscura (negra) solo con texto — usa una foto real, un fondo claro o el color de la marca; la portada muestra productos (data-pagosya-catalog, o data-pagosya-spotlight con ids reales).
Las bandas de la plantilla se pintan con --es-deep: si es casi negro, dale con set_tokens el color oscuro de la marca (un verde, un vino, un azul), nunca negro.
Los textos van como texto JSX literal (<h1>Deja que el aceite haga lo suyo.</h1>), nunca dentro de arreglos u objetos: así el comercio los edita con doble clic. Español natural; no inventes datos, precios, envíos ni certificaciones.
Productos, precios, fotos y logo vienen de './store-data'. Los consejos de check son opcionales; lo que dice «Debes corregir» no.`;
}

type LoopInput = { model: AgentModel; files: SourceProjectFileDto[]; base: AgentPreviewBase; gate: (files: SourceProjectFileDto[]) => Promise<string | null>; task: string;
  images?: unknown[]; signal?: AbortSignal; limits?: Partial<typeof AGENT_LIMITS>; onStep?: (step: AgentStep) => void | Promise<void> };

/** The writer's loop on its own: testable without a generation run. */
export async function runHomeWriterLoop(input: LoopInput) {
  const workspace = new AgentWorkspace(input.files, { redesign: true, lockedShell: true });
  const toolbox = new HomeWriterToolbox({ workspace, base: input.base, gate: input.gate, ...(input.signal ? { signal: input.signal } : {}) });
  const outcome = await runAgent({ model: input.model, toolbox, tools: HOME_WRITER_TOOLS, verifyTool: 'check', instructions: homeWriterInstructions(), signal: input.signal, onStep: input.onStep,
    limits: { ...HOME_WRITER_LIMITS, ...input.limits }, opening: agentOpening(input.task, input.files.filter(file => file.path === HOME_PATH), input.images ?? []) });
  const accepted = (outcome.status === 'finished' && Boolean(toolbox.finished)) || (!outcome.provider && outcome.reason !== 'cancelled' && !input.signal?.aborted && await toolbox.acceptIfBuildable());
  return { accepted, outcome, summary: toolbox.finished?.summary ?? '', changed: workspace.changedPaths(), steps: toolbox.steps };
}

/** Inside generate(): runs instead of runAgentStage for execution.homeWriter (spec 2026-10-29 §6). */
export async function runHomeWriterStage(context: AgentStageContext): Promise<void> {
  const { facts, live, acceptCandidate } = context;
  const { prisma, config, metering, storeId, runId, dto, plan, provider, apiKey, agentProvider, budget, signal, attempts, progress, previousFiles, oldFiles, assets, images, data } = facts;
  await progress?.('building');
  const base: AgentPreviewBase = { brief: dto.brief, files: [...previousFiles.filter(file => !assets.some(asset => asset.path === file.path)), ...assets] };
  // The same acceptance chain every build passes, in its lenient form (artwork and edit-scope rules are for chat edits).
  const gate = async (files: SourceProjectFileDto[]) => {
    live.generated = { label: 'Portada de YAPI', files: files.map(file => ({ ...file })) };
    live.lenient = true;
    try { await acceptCandidate(); return null; }
    catch (error) { return (error as Error).message; }
    finally { live.lenient = false; }
  };
  const onTurn = async ({ body, durationMs, status }: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED' }) => {
    const tools = [...(Array.isArray(body?.output) ? body.output : []), ...(Array.isArray(body?.content) ? body.content : [])].filter((item: any) => item?.type === 'function_call' || item?.type === 'tool_use').map((item: any) => String(item.name));
    attempts.push({ model: plan.model, phase: 'home-writer', durationMs, status, usage: sourceUsage(plan.model, body?.usage), tools });
    await prisma.storeSourceGeneration.updateMany({ where: { id: runId, status: 'RUNNING' }, data: { attempts: attempts as unknown as Prisma.InputJsonValue } });
    await metering?.record(storeId, 'source-generation', plan.model, body, durationMs, status);
  };
  const effort = config.get<'low' | 'medium' | 'high'>('app.yapiFirstDesignEffort') ?? 'low';
  const model = agentProvider
    ? anthropicAgentModel({ endpoint: agentProvider.endpoint, apiKey: agentProvider.apiKey, model: plan.model, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), signal, onTurn })
    : openAiAgentModel({ endpoint: provider.endpoint, apiKey, model: plan.model, providerName: provider.name, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), reasoningEffort: effort, signal, onTurn });
  const task = `${dto.instruction}\n\nTienda: ${(data as { storeName?: string }).storeName ?? ''}`;
  const out = await runHomeWriterLoop({ model, files: oldFiles.filter(file => nextSourceFile(file.path)), base, gate, task, signal,
    images: images.map(image => ({ ...(image as object), detail: 'low' })),
    onStep: async step => { await progress?.detail?.({ label: step.label, ...(step.thumbnail ? { thumbnail: step.thumbnail } : {}) }); } });
  if (!out.accepted) throw new BadGatewayException(`YAPI no pudo terminar la portada${out.outcome.reason ? `: ${out.outcome.reason}` : ''}`);
  live.agentTheme = null; live.agentAccountTheme = null; live.agentMotifPack = undefined; live.agentPolicies = {};
  live.generated.label = 'Portada de YAPI';
  live.agentOutcome = { summary: out.summary, requirements: [], evidence: [], sections: [], steps: out.steps.map(({ thumbnail: _thumbnail, ...step }) => step) };
}
