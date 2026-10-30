import { AGENT_TOOLS, type AgentStep } from './agent-tools';
import { estimateInputTokens } from './agent-model';

export type AgentModelCall = { name: string; arguments: string; callId: string };
export type AgentModelTurn = { calls: AgentModelCall[]; text?: string; output?: unknown[] };
export type AgentToolDefinition = typeof AGENT_TOOLS[number] | { type: 'function'; name: string; description: string; parameters: object; strict: true };
export type AgentModel = (input: { instructions: string; transcript: unknown[]; tools: readonly AgentToolDefinition[] }) => Promise<AgentModelTurn>;
/** What the loop needs from a toolbox: AgentToolbox, or the home writer's (spec 2026-10-29). */
export type AgentLoopToolbox = { steps: AgentStep[]; run(name: string, rawArgs: string): Promise<{ output: string; image?: string; images?: string[] }>; draftIsClean(): boolean; lastVerify: { hard?: boolean } | null; finished: unknown; stopped: { summary: string } | null };
/** `provider`: the model stopped answering (a plan's usage limit, an outage) — the draft is whatever was mid-edit, never checked.
 *  `reason: 'steps'`: the tool-call cap stopped it; `finding` is the last failing verify output, if any. */
export type AgentRunResult = { status: 'finished' | 'limit' | 'failed'; reason?: string; provider?: boolean; finding?: string };
export const AGENT_LIMITS = { toolCalls: 40, wallMs: 360_000, screenshots: 8 };
/** A run on the merchant's own ChatGPT plan is free but slower than a paid API (calls of 20-90 s), so it gets twice the time. */
export const agentLimits = (chatgptPlan: boolean) => chatgptPlan ? { ...AGENT_LIMITS, wallMs: AGENT_LIMITS.wallMs * 2 } : AGENT_LIMITS;

/** The clock only stops the agent between turns, so it must stop early enough for one long model turn (112 s was
 *  measured), the final checks and the save to fit before the run's hard stop. */
export const AGENT_CLOSE_MS = 180_000;
/** Design planning runs before the agent on the same run clock (106 s measured on 2026-10-08, when a 30 s margin
 *  aborted a finished store as "cancelled"). */
const AGENT_PRE_AGENT_MS = 240_000;
/** Spec 2026-10-29 (agent cost): a run that used its steps unfinished gets one short continuation; the run's hard stop
 *  makes room for it… */
export const AGENT_CONTINUE_MS = 240_000;
/** …and it does not start with less than one long turn (112 s measured) plus a verify left. */
export const AGENT_CONTINUE_MIN_MS = 150_000;
/** The run's hard stop for the agent engine: the agent's own budget plus room before and after it, and for one continuation. */
export const agentRunHeadroom = (wallMs: number) => wallMs + AGENT_PRE_AGENT_MS + AGENT_CLOSE_MS + AGENT_CONTINUE_MS;
/** A stop on the tool-call cap or the first leg's clock continues (the merchant reads both as «límite de pasos»; live check
 *  2026-10-29, Andes ran out of time). Never credits, a cancel, a loop, a soft finding, a finished draft, or a draft that
 *  already passed its checks (review 2026-10-29: the continuation would reopen it for edits and could ship a worse one). */
export function agentShouldContinue(outcome: AgentRunResult, input: { calls: number; wallMs: number; aborted: boolean; finished: boolean; clean: boolean }): boolean {
  return outcome.status === 'limit' && (outcome.reason === 'steps' || outcome.reason === undefined) && input.calls > 0 && input.wallMs >= AGENT_CONTINUE_MIN_MS && !input.aborted && !input.finished && !input.clean;
}
/** The agent's budget measured against the run's hard stop: it stops on its own, warned and rescuable, before the run is aborted. */
export function agentWallWithin<T extends { wallMs: number }>(limits: T, runDeadline: number, now = Date.now()): T {
  return { ...limits, wallMs: Math.max(0, Math.min(limits.wallMs, runDeadline - now - AGENT_CLOSE_MS)) };
}
/** True when the run stopped because its time ran out rather than because someone cancelled it. */
export const abortedByTimeout = (signal?: AbortSignal) => Boolean(signal?.aborted && (signal.reason as { name?: string } | undefined)?.name === 'TimeoutError');

/** Model ↔ tools until a gated finish, a limit, exhausted retries or cancellation. Never saves anything itself. */
export async function runAgent(input: { model: AgentModel; toolbox: AgentLoopToolbox; tools?: readonly AgentToolDefinition[]; verifyTool?: string; instructions: string; opening: unknown[]; limits?: Partial<typeof AGENT_LIMITS>; signal?: AbortSignal; onStep?: (step: AgentStep) => void | Promise<void>; now?: () => number; sleep?: (ms: number) => Promise<void> }): Promise<AgentRunResult> {
  const limits = { ...AGENT_LIMITS, ...input.limits };
  const now = input.now ?? Date.now;
  const started = now();
  const transcript: unknown[] = [...input.opening];
  const { toolbox } = input;
  let closing = false;
  const compact = agentTranscriptCompactor();
  const tools = input.tools ?? AGENT_TOOLS;
  const verifyTool = input.verifyTool ?? 'verify';
  const ask = () => input.model({ instructions: input.instructions, transcript: compact(transcript), tools: closing ? tools.filter(tool => tool.name === 'finish') : tools });
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let toolCalls = 0;
  let idle = 0, budgetWarned = false;
  // A model that keeps asking for the same thing and getting the same answer (for example a screenshot after the last one)
  // burns the whole clock. Told once on the second repeat, stopped on the third, without claiming unfinished work is saved.
  let repeats = 0, lastSignature = '', warn = false;
  let repeatedFinding = '', findingCount = 0;
  const stepLimit = (): AgentRunResult => ({ status: 'limit', reason: 'steps', ...(repeatedFinding ? { finding: repeatedFinding } : {}) });
  const compositionAppearances = new Map<string, number>();
  while (true) {
    if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
    if (now() - started >= limits.wallMs) return { status: 'limit' };
    if (toolCalls >= limits.toolCalls) {
      if (closing || !toolbox.draftIsClean()) return stepLimit();
      // One bounded, finish-only turn can attest an already verified draft. No edits or implicit success.
      closing = true;
      transcript.push({ role: 'user', content: [{ type: 'input_text', text: 'Se agotaron las herramientas de edición. El borrador actual está verificado. Usa únicamente finish para informar completed si cumple todo el pedido, o partial/blocked con lo pendiente. No hay más ediciones disponibles.' }] });
    }
    if (!budgetWarned && (limits.toolCalls - toolCalls <= 8 || limits.wallMs - (now() - started) <= 90_000)) {
      budgetWarned = true;
      transcript.push({ role: 'user', content: [{ type: 'input_text', text: `Quedan ${limits.toolCalls - toolCalls} llamadas y ${Math.max(0, Math.round((limits.wallMs - (now() - started)) / 1000))} segundos. Prioriza los requisitos pendientes, verifica el resultado final y reserva una llamada para finish. Si ya está completo, no añadas cambios opcionales; termina. No reduzcas las comprobaciones para pasar.` }] });
    }
    let turn: AgentModelTurn | undefined;
    // A provider or network blip should not throw away minutes of work: retry twice, pausing a little longer each time.
    for (const pause of [0, 2000, 6000]) {
      if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
      if (now() - started + pause >= limits.wallMs) return { status: 'limit' };
      if (pause) {
        await sleep(pause);
        if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
        if (now() - started >= limits.wallMs) return { status: 'limit' };
      }
      try { turn = await ask(); break; }
      catch (error) {
        if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
        // The merchant's credit limit is a limit like the step count: the caller preserves a private checkpoint; retrying buys nothing.
        if ((error as { agentLimit?: boolean })?.agentLimit) return { status: 'limit', reason: 'credits' };
        if (pause === 6000) return { status: 'failed', reason: (error as Error).message, provider: true };
      }
    }
    if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
    if (now() - started >= limits.wallMs) return { status: 'limit' };
    if (!turn) return { status: 'failed', reason: 'El proveedor de IA no respondió.', provider: true };
    if (!turn.calls.length) {
      if (++idle >= 2) return { status: 'failed', reason: 'El agente dejó de usar herramientas.' };
      if (turn.output?.length) transcript.push(...turn.output);
      transcript.push({ role: 'user', content: [{ type: 'input_text', text: 'Continúa con las herramientas y termina con finish.' }] });
      continue;
    }
    idle = 0;
    transcript.push(...(turn.output?.length ? turn.output : turn.calls.map(call => ({ type: 'function_call', call_id: call.callId, name: call.name, arguments: call.arguments }))));
    const images: string[] = [];
    for (const call of turn.calls) {
      if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
      if (now() - started >= limits.wallMs) return { status: 'limit' };
      if (closing && call.name !== 'finish') return stepLimit();
      if (!closing && toolCalls >= limits.toolCalls) {
        // Every announced call needs a result before the finish-only model turn.
        // Do not execute leftover calls or let them mutate the verified draft.
        transcript.push({ type: 'function_call_output', call_id: call.callId, output: 'Not executed: tool-call budget exhausted.' });
        continue;
      }
      const before = toolbox.steps.length;
      const result = await toolbox.run(call.name, call.arguments);
      toolCalls++;
      transcript.push({ type: 'function_call_output', call_id: call.callId, output: result.output });
      if (result.image) images.push(result.image);
      if (result.images) images.push(...result.images);
      for (const step of toolbox.steps.slice(before)) await input.onStep?.(step);
      if (call.name === verifyTool && !toolbox.draftIsClean()) {
        // Review wording may change between passes; its stable identity must not buy another repair loop.
        for (const id of new Set([...result.output.matchAll(/\[composition:([a-zA-Z0-9_-]+)\]/g)].map(match => match[1]))) {
          const count = (compositionAppearances.get(id) || 0) + 1;
          compositionAppearances.set(id, count);
          if (count >= 2) return { status: 'failed', reason: `La revisión visual sigue pendiente [composition:${id}]. Se detuvo la corrección para conservar el borrador y evitar más consumo.` };
        }
        const finding = result.output.replace(/\s+/g, ' ').slice(0, 2000);
        findingCount = finding === repeatedFinding ? findingCount + 1 : 1;
        repeatedFinding = finding;
        // Opinions (palette, review, structure, the model's own requirements) get one correction, then the service ships the draft. A broken build gets three.
        const soft = toolbox.lastVerify?.hard === false;
        if (soft && findingCount >= 2) return { status: 'limit', reason: 'soft' };
        if (findingCount >= 3) return { status:'failed', reason:'La misma comprobación sigue fallando: ' + finding.slice(0,800) };
      } else if (call.name === verifyTool) { repeatedFinding = ''; findingCount = 0; }
      if (toolbox.finished) return { status: 'finished' };
      if (toolbox.stopped) return { status: 'failed', reason: toolbox.stopped.summary || 'Quedan requisitos pendientes.' };
      if (toolCalls >= limits.toolCalls) continue;
      const signature = `${call.name}|${call.arguments}|${result.output}`;
      repeats = signature === lastSignature ? repeats + 1 : 1;
      lastSignature = signature;
      if (repeats >= 3) return { status: 'limit', reason: 'loop' };
      if (repeats === 2) warn = true;
    }
    // Screenshots reach the model as images after the tool outputs, since function outputs carry text only.
    if (images.length) transcript.push({ role: 'user', content: images.map(image_url => ({ type: 'input_image', image_url, detail: 'auto' })) });
    if (warn) { warn = false; transcript.push({ role: 'user', content: [{ type: 'input_text', text: 'Estás repitiendo la misma acción y obtienes el mismo resultado. Cambia de estrategia: si verify ya está limpio y no quedan capturas, llama finish ahora.' }] }); }
  }
}

/** Spec 2026-10-29 (agent cost): stale content waits behind the recent window until this many tokens pile up, then goes in
 *  one batch, so between batches every request extends the previous one and the provider can bill it at the cached rate. */
export const AGENT_COMPACT_BATCH_TOKENS = 20_000;
/** Spec 2026-10-29 (home writer): a whole-file write replaced by a newer one is resent as this fixed line. */
export const AGENT_HOME_STUB = 'versión anterior de components/home.tsx reemplazada por una más nueva';

const hasImage = (item: any) => item.role === 'user' && Array.isArray(item.content) && item.content.some((part: any) => part.type === 'input_image');
/** Stale observations: every screenshot but the latest, and long file reads more than 12 items back. Never instructions,
 *  the original task, function calls or edit history. */
function staleIndexes(transcript: any[]): number[] {
  const calls = new Map<string, string>();
  for (const item of transcript) if (item.type === 'function_call') calls.set(item.call_id, item.name);
  let latestImage = -1;
  transcript.forEach((item, i) => { if (hasImage(item)) latestImage = i; });
  let latestHome = -1;
  transcript.forEach((item, i) => { if (item.type === 'function_call' && item.name === 'write_home') latestHome = i; });
  return transcript.flatMap((item, i) => (i > 0 && i < latestImage && hasImage(item))
    || (item.type === 'function_call' && item.name === 'write_home' && i < latestHome)
    || (i < transcript.length - 12 && item.type === 'function_call_output' && calls.get(item.call_id) === 'read_file' && typeof item.output === 'string' && item.output.length > 1200) ? [i] : []);
}
/** Always the same replacement for the same item, so a compacted item never changes again. */
function evicted(item: any) {
  if (item.type === 'function_call') return { ...item, arguments: JSON.stringify({ content: AGENT_HOME_STUB }) };
  if (item.type === 'function_call_output') return { ...item, output: 'Earlier file contents evicted. read_file returns the CURRENT version if needed.' };
  return { ...item, content: item.content.filter((part: any) => part.type !== 'input_image').concat({ type: 'input_text', text: 'Previous screenshot evicted. Use the latest screenshot; recapture if this page changed.' }) };
}

/** Preserve calls/results and the original task. Evict every stale observation at once. */
export function compactAgentTranscript(transcript: unknown[]): unknown[] {
  const stale = new Set(staleIndexes(transcript as any[]));
  return (transcript as any[]).map((item, i) => stale.has(i) ? evicted(item) : item);
}

/** The loop's compactor: remembers what it compacted and compacts only in batches of AGENT_COMPACT_BATCH_TOKENS.
 *  The loop only appends to its transcript, so an index keeps naming the same item. */
export function agentTranscriptCompactor(batchTokens = AGENT_COMPACT_BATCH_TOKENS) {
  const done = new Set<number>();
  return (transcript: unknown[]): unknown[] => {
    const items = transcript as any[];
    const pending = staleIndexes(items).filter(i => !done.has(i));
    if (pending.length && estimateInputTokens(pending.map(i => items[i])) >= batchTokens) for (const i of pending) done.add(i);
    return items.map((item, i) => done.has(i) ? evicted(item) : item);
  };
}
