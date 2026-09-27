import { AGENT_TOOLS, type AgentStep, type AgentToolbox } from './agent-tools';

export type AgentModelCall = { name: string; arguments: string; callId: string };
export type AgentModelTurn = { calls: AgentModelCall[]; text?: string; output?: unknown[] };
export type AgentModel = (input: { instructions: string; transcript: unknown[]; tools: typeof AGENT_TOOLS }) => Promise<AgentModelTurn>;
export type AgentRunResult = { status: 'finished' | 'limit' | 'failed'; reason?: string };
export const AGENT_LIMITS = { toolCalls: 40, wallMs: 360_000, screenshots: 8 };

/** Model ↔ tools until a gated finish, a limit, a second failed model call or cancellation. Never saves anything itself. */
export async function runAgent(input: { model: AgentModel; toolbox: AgentToolbox; instructions: string; opening: unknown[]; limits?: Partial<typeof AGENT_LIMITS>; signal?: AbortSignal; onStep?: (step: AgentStep) => void | Promise<void>; now?: () => number }): Promise<AgentRunResult> {
  const limits = { ...AGENT_LIMITS, ...input.limits };
  const now = input.now ?? Date.now;
  const started = now();
  const transcript: unknown[] = [...input.opening];
  const { toolbox } = input;
  const ask = () => input.model({ instructions: input.instructions, transcript, tools: AGENT_TOOLS });
  let toolCalls = 0;
  let idle = 0;
  while (true) {
    if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
    if (toolCalls >= limits.toolCalls || now() - started >= limits.wallMs) return { status: 'limit' };
    let turn: AgentModelTurn;
    try { turn = await ask(); }
    catch {
      if (input.signal?.aborted) return { status: 'failed', reason: 'cancelled' };
      try { turn = await ask(); } catch (error) { return { status: 'failed', reason: (error as Error).message }; }
    }
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
      const before = toolbox.steps.length;
      const result = await toolbox.run(call.name, call.arguments);
      toolCalls++;
      transcript.push({ type: 'function_call_output', call_id: call.callId, output: result.output });
      if (result.image) images.push(result.image);
      for (const step of toolbox.steps.slice(before)) await input.onStep?.(step);
      if (toolbox.finished) return { status: 'finished' };
      if (toolCalls >= limits.toolCalls) break;
    }
    // Screenshots reach the model as images after the tool outputs, since function outputs carry text only.
    if (images.length) transcript.push({ role: 'user', content: images.map(image_url => ({ type: 'input_image', image_url, detail: 'auto' })) });
  }
}
