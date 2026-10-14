import { runAssistantTurn, type AssistantModel, type AssistantModelTurn } from './assistant-loop';

let n = 0;
const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args), callId: `c${n++}` });
const scripted = (turns: AssistantModelTurn[], seen: unknown[][] = []): AssistantModel => { let i = 0; return async ({ transcript }) => { seen.push([...transcript]); return turns[Math.min(i++, turns.length - 1)]; }; };

describe('assistant turn loop', () => {
  it('runs tools, feeds outputs back, and ends on a text answer', async () => {
    const run = jest.fn().mockResolvedValue('[{"nombre":"Chompa"}]');
    const seen: unknown[][] = [];
    const result = await runAssistantTurn({ model: scripted([{ calls: [call('buscar_productos', { consulta: 'chompa', categoria: null })] }, { calls: [], text: 'Tenemos la Chompa.' }], seen), toolbox: { run }, instructions: 'x', transcript: [{ role: 'user', content: 'hola' }], tools: [] });
    expect(result).toEqual({ text: 'Tenemos la Chompa.', toolCalls: 1 });
    expect(seen[1]).toContainEqual(expect.objectContaining({ type: 'function_call_output', output: '[{"nombre":"Chompa"}]' }));
  });

  it('stops after 4 tool calls, asks for an answer, and returns empty text if the model keeps calling', async () => {
    const run = jest.fn().mockResolvedValue('ok');
    const looping = scripted([{ calls: [call('buscar_info', { consulta: 'x' })] }]);
    const result = await runAssistantTurn({ model: looping, toolbox: { run }, instructions: 'x', transcript: [], tools: [] });
    expect(run).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ text: '', toolCalls: 4 });
  });

  it('after the cap, the next model call sees the answer-now message and a text answer is returned', async () => {
    const run = jest.fn().mockResolvedValue('ok');
    const seen: unknown[][] = [];
    const turns: AssistantModelTurn[] = [
      { calls: [call('buscar_info', { consulta: 'a' })] },
      { calls: [call('buscar_info', { consulta: 'b' })] },
      { calls: [call('buscar_info', { consulta: 'c' })] },
      { calls: [call('buscar_info', { consulta: 'd' })] },
      { calls: [], text: 'Listo, esto es lo que tengo.' },
    ];
    const result = await runAssistantTurn({ model: scripted(turns, seen), toolbox: { run }, instructions: 'x', transcript: [], tools: [] });
    expect(result).toEqual({ text: 'Listo, esto es lo que tengo.', toolCalls: 4 });
    expect(seen[4]).toContainEqual({ role: 'user', content: [{ type: 'input_text', text: 'Ya no puedes usar más herramientas en este turno. Responde ahora al cliente con lo que tienes.' }] });
  });

  it('a turn batching six calls runs the toolbox four times and answers the other two with the limit message', async () => {
    const run = jest.fn().mockResolvedValue('ok');
    const seen: unknown[][] = [];
    const batch = Array.from({ length: 6 }, (_, i) => call('buscar_info', { consulta: `q${i}` }));
    const result = await runAssistantTurn({ model: scripted([{ calls: batch }, { calls: [], text: 'Ok' }], seen), toolbox: { run }, instructions: 'x', transcript: [], tools: [] });
    expect(run).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ text: 'Ok', toolCalls: 4 });
    expect(seen[1]).toContainEqual({ type: 'function_call_output', call_id: batch[4].callId, output: 'Límite de consultas alcanzado.' });
    expect(seen[1]).toContainEqual({ type: 'function_call_output', call_id: batch[5].callId, output: 'Límite de consultas alcanzado.' });
  });

  it('pushes the model-provided output items to the transcript as-is instead of rebuilding function_call items', async () => {
    const run = jest.fn().mockResolvedValue('ok');
    const seen: unknown[][] = [];
    const reasoning = { type: 'reasoning', id: 'rs_1', summary: [] };
    const turn: AssistantModelTurn = { calls: [call('buscar_info', { consulta: 'x' })], output: [reasoning] };
    await runAssistantTurn({ model: scripted([turn, { calls: [], text: 'Ok' }], seen), toolbox: { run }, instructions: 'x', transcript: [], tools: [] });
    expect(seen[1]).toContain(reasoning);
    expect(seen[1].some((item) => (item as { type?: string }).type === 'function_call')).toBe(false);
  });
});
