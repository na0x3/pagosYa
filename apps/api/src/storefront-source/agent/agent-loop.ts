import { AGENT_TOOLS, type AgentStep, type AgentToolbox } from './agent-tools';

export type AgentModelCall = { name: string; arguments: string; callId: string };
export type AgentModelTurn = { calls: AgentModelCall[]; text?: string; output?: unknown[] };
export type AgentModel = (input: { instructions: string; transcript: unknown[]; tools: typeof AGENT_TOOLS }) => Promise<AgentModelTurn>;
export type AgentRunResult = { status: 'finished' | 'limit' | 'failed'; reason?: string };
export const AGENT_LIMITS = { toolCalls: 40, wallMs: 360_000, screenshots: 8 };
/** A run on the merchant's own ChatGPT plan is free but slower than a paid API (calls of 20-90 s), so it gets twice the time. */
export const agentLimits = (chatgptPlan: boolean) => chatgptPlan ? { ...AGENT_LIMITS, wallMs: AGENT_LIMITS.wallMs * 2 } : AGENT_LIMITS;

/** Model ↔ tools until a gated finish, a limit, exhausted retries or cancellation. Never saves anything itself. */
export async function runAgent(input: { model: AgentModel; toolbox: AgentToolbox; instructions: string; opening: unknown[]; limits?: Partial<typeof AGENT_LIMITS>; signal?: AbortSignal; onStep?: (step: AgentStep) => void | Promise<void>; now?: () => number; sleep?: (ms: number) => Promise<void> }): Promise<AgentRunResult> {
  const limits = { ...AGENT_LIMITS, ...input.limits };
  const now = input.now ?? Date.now;
  const started = now();
  const transcript: unknown[] = [...input.opening];
  const { toolbox } = input;
  let closing = false;
  const ask = () => input.model({ instructions: input.instructions, transcript: compactAgentTranscript(transcript), tools: closing ? AGENT_TOOLS.filter(tool => tool.name === 'finish') : AGENT_TOOLS });
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let toolCalls = 0;
  let idle = 0, budgetWarned = false;
  // A model that keeps asking for the same thing and getting the same answer (for example a screenshot after the last one)
  // burns the whole clock. Told once on the second repeat, stopped on the third, without claiming unfinished work is saved.
  let repeats = 0, lastSignature = '', warn = false;
  let repeatedFinding = '', findingCount = 0;
  const compositionAppearances = new Map<string, number>();
  while (true) {
    if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
    if (now() - started >= limits.wallMs) return { status: 'limit' };
    if (toolCalls >= limits.toolCalls) {
      if (closing || !toolbox.draftIsClean()) return { status: 'limit' };
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
        if (pause === 6000) return { status: 'failed', reason: (error as Error).message };
      }
    }
    if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
    if (now() - started >= limits.wallMs) return { status: 'limit' };
    if (!turn) return { status: 'failed', reason: 'El proveedor de IA no respondió.' };
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
      if (closing && call.name !== 'finish') return { status: 'limit' };
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
      for (const step of toolbox.steps.slice(before)) await input.onStep?.(step);
      if (call.name === 'verify' && !toolbox.draftIsClean()) {
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
      } else if (call.name === 'verify') { repeatedFinding = ''; findingCount = 0; }
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

/** Preserve calls/results and the original task. Evict stale observations, never instructions or edit history. */
export function compactAgentTranscript(transcript: unknown[]): unknown[] {
  const calls = new Map<string, string>();
  for (const item of transcript as any[]) if (item.type === 'function_call') calls.set(item.call_id, item.name);
  let latestImage = -1;
  (transcript as any[]).forEach((item, i) => { if (item.role === 'user' && Array.isArray(item.content) && item.content.some((part: any) => part.type === 'input_image')) latestImage = i; });
  return (transcript as any[]).map((item, i) => {
    if (i > 0 && i < latestImage && item.role === 'user' && Array.isArray(item.content) && item.content.some((part: any) => part.type === 'input_image')) return { ...item, content: item.content.filter((part: any) => part.type !== 'input_image').concat({ type:'input_text', text:'Previous screenshot evicted. Use the latest screenshot; recapture if this page changed.' }) };
    if (i < transcript.length - 12 && item.type === 'function_call_output' && calls.get(item.call_id) === 'read_file' && typeof item.output === 'string' && item.output.length > 1200) return { ...item, output:'Earlier file contents evicted. read_file returns the CURRENT version if needed.' };
    return item;
  });
}
