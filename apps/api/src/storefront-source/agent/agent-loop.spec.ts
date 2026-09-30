import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { AgentWorkspace } from './agent-workspace';
import { AgentToolbox } from './agent-tools';
import { runAgent, agentLimits, AGENT_LIMITS, type AgentModel, type AgentModelTurn } from './agent-loop';

jest.setTimeout(120_000);
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
beforeAll(async () => { base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa')); });
const toolbox = () => { const authored = base.files.filter(f => nextSourceFile(f.path)); return new AgentToolbox({ workspace: new AgentWorkspace(authored, { redesign: false }), previous: authored, base, instruction: 'cambia el título', purpose: 'shop', maxScreenshots: 8 }); };
const scripted = (turns: AgentModelTurn[]): AgentModel => { let i = 0; return async () => turns[Math.min(i++, turns.length - 1)]; };
let n = 0;
const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args), callId: `c${n++}` });

describe('runAgent', () => {
  it('runs tools until a gated finish, replaying every call and output in the transcript', async () => {
    const box = toolbox();
    const seen: unknown[][] = [];
    const turns: AgentModelTurn[] = [
      { calls: [call('edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' })] },
      { calls: [call('finish', { summary: 'Listo', sections: ['Portada'] })] },
      { calls: [call('verify', {})] },
      { calls: [call('finish', { summary: 'Listo', sections: ['Portada'] })] },
    ];
    let i = 0;
    const model: AgentModel = async ({ transcript }) => { seen.push([...transcript]); return turns[i++]; };
    const steps: string[] = [];
    const result = await runAgent({ toolbox: box, instructions: 'x', opening: [{ role: 'user', content: [{ type: 'input_text', text: 'pedido' }] }], model, onStep: s => { steps.push(s.label); } });
    expect(result).toEqual({ status: 'finished' });
    expect(box.finished?.sections).toEqual(['Portada']);
    expect(seen[1]).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function_call', name: 'edit_file' }), expect.objectContaining({ type: 'function_call_output', output: 'ok' })]));
    expect(steps).toEqual(['Editó components/home.tsx', 'Verificó: todo en orden', 'Terminó']);
  });
  it('stops at the tool-call limit', async () => {
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], limits: { toolCalls: 3 }, model: scripted([{ calls: [call('list_files', {})] }]) });
    expect(result).toEqual({ status: 'limit' });
  });
  it('stops at the wall-clock limit', async () => {
    let t = 0;
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], now: () => (t += 200_000), model: scripted([{ calls: [call('list_files', {})] }]) });
    expect(result).toEqual({ status: 'limit' });
  });
  it('retries a failing model call twice with a pause before each retry, then fails with its message', async () => {
    let calls = 0;
    const pauses: number[] = [];
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], sleep: async ms => { pauses.push(ms); }, model: async () => { calls++; throw new Error('provider down'); } });
    expect(calls).toBe(3);
    expect(pauses).toEqual([2000, 6000]);
    expect(result).toEqual({ status: 'failed', reason: 'provider down' });
  });
  it('carries on when a retry succeeds', async () => {
    let calls = 0;
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], limits: { toolCalls: 1 }, sleep: async () => {}, model: async () => { if (++calls < 3) throw new Error('blip'); return { calls: [{ name: 'list_files', arguments: '{}', callId: 'r1' }] }; } });
    expect(result).toEqual({ status: 'limit' });
  });
  it('treats running out of credits as a limit, without a retry', async () => {
    let calls = 0;
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], model: async () => { calls++; throw Object.assign(new Error('sin créditos'), { agentLimit: true }); } });
    expect(calls).toBe(1);
    expect(result).toEqual({ status: 'limit', reason: 'credits' });
  });
  it('reminds once after a turn without tool calls, then fails', async () => {
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], model: scripted([{ calls: [], text: 'hola' }]) });
    expect(result.status).toBe('failed');
  });
  it('stops when cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    expect(await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], signal: controller.signal, model: scripted([{ calls: [call('list_files', {})] }]) })).toEqual({ status: 'failed', reason: 'cancelled' });
  });
});

describe('agent limits', () => {
  it('gives a free ChatGPT-plan run twice the time, because the bridge is slower than a paid API', () => {
    expect(agentLimits(false)).toEqual(AGENT_LIMITS);
    expect(agentLimits(true)).toEqual({ ...AGENT_LIMITS, wallMs: 720_000 });
  });
});

describe('runAgent repetition guard', () => {
  it('warns the model on the second identical result and stops on the third, long before the tool-call limit', async () => {
    const seen: string[] = [];
    const model: AgentModel = async ({ transcript }) => { seen.push(JSON.stringify(transcript)); return { calls: [call('list_files', {})] }; };
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], model });
    expect(result).toEqual({ status: 'limit', reason: 'loop' });
    expect(seen).toHaveLength(3);
    expect(seen[1]).not.toContain('repitiendo');
    expect(seen[2]).toContain('repitiendo');
  });

  it('does not call a run a loop while its calls differ or only alternate', async () => {
    const paths = ['components/home.tsx', 'components/Shell.tsx'];
    let i = 0;
    const model: AgentModel = async () => ({ calls: [call('read_file', { path: paths[i++ % paths.length] })] });
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], limits: { toolCalls: 8 }, model });
    expect(result).toEqual({ status: 'limit' });
  });
});
