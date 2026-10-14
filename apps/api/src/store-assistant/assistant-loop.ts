export type AssistantModelTurn = { calls: Array<{ name: string; arguments: string; callId: string }>; text?: string; output?: unknown[] };
export type AssistantModel = (input: { instructions: string; transcript: unknown[]; tools: unknown[] }) => Promise<AssistantModelTurn>;

const ANSWER_NOW = 'Ya no puedes usar más herramientas en este turno. Responde ahora al cliente con lo que tienes.';

/** YAPI's runAgent treats text as failure and needs `finish`; a chat turn ends on the first text answer. */
export async function runAssistantTurn(input: {
  model: AssistantModel; toolbox: { run(name: string, args: string): Promise<string> };
  instructions: string; transcript: unknown[]; tools: unknown[]; maxToolCalls?: number;
}): Promise<{ text: string; toolCalls: number }> {
  const max = input.maxToolCalls ?? 4;
  const transcript = [...input.transcript];
  let toolCalls = 0;
  for (let nudged = false; ;) {
    const turn = await input.model({ instructions: input.instructions, transcript, tools: input.tools });
    if (!turn.calls.length) return { text: (turn.text ?? '').trim(), toolCalls };
    if (nudged) return { text: '', toolCalls };
    transcript.push(...(turn.output?.length ? turn.output : turn.calls.map((c) => ({ type: 'function_call', call_id: c.callId, name: c.name, arguments: c.arguments }))));
    for (const c of turn.calls) {
      const output = toolCalls < max ? await input.toolbox.run(c.name, c.arguments) : 'Límite de consultas alcanzado.';
      if (toolCalls < max) toolCalls++;
      transcript.push({ type: 'function_call_output', call_id: c.callId, output });
    }
    if (toolCalls >= max) { transcript.push({ role: 'user', content: [{ type: 'input_text', text: ANSWER_NOW }] }); nudged = true; }
  }
}
