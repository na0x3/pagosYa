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
});
