import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { AgentWorkspace } from './agent-workspace';
import { AgentToolbox } from './agent-tools';
import { runAgent, agentLimits, AGENT_LIMITS, AGENT_CLOSE_MS, agentRunHeadroom, agentWallWithin, abortedByTimeout, type AgentModel, type AgentModelTurn } from './agent-loop';

jest.setTimeout(120_000);
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
beforeAll(async () => { base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa')); });
const toolbox = () => { const authored = base.files.filter(f => nextSourceFile(f.path)); return new AgentToolbox({ workspace: new AgentWorkspace(authored, { redesign: false }), previous: authored, base, instruction: 'cambia el título', purpose: 'shop', maxScreenshots: 8 }); };
const scripted = (turns: AgentModelTurn[]): AgentModel => { let i = 0; return async () => turns[Math.min(i++, turns.length - 1)]; };
let n = 0;
const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args), callId: `c${n++}` });

describe('runAgent', () => {
  describe('acceptIfBuildable', () => {
    it('ships a draft that builds even when soft checks never passed', async () => {
      const box = toolbox();
      box.workspace.edit('components/home.tsx', 'Un respiro', 'Tu calma');
      expect(box.finished).toBeNull();
      expect(await box.acceptIfBuildable()).toBe(true);
      expect(box.finished).toEqual({ summary: '', sections: [] });
    });
    it('never ships a draft that does not compile', async () => {
      const box = toolbox();
      box.workspace.edit('components/home.tsx', 'Un respiro', '{<Missing />');
      expect(await box.acceptIfBuildable()).toBe(false);
      expect(box.finished).toBeNull();
    });
  });
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
  it('reserves one finish-only turn for an already verified draft instead of losing it to the step limit', async () => {
    const box = toolbox();
    box.workspace.edit('components/home.tsx', 'Un respiro', 'Tu calma');
    const seen: string[][] = [];
    let turn = 0;
    const model: AgentModel = async ({ tools }) => {
      seen.push(tools.map(tool => tool.name));
      return { calls: [turn++ ? call('finish', { status: 'completed', summary: 'Verificado', sections: ['Portada'], remaining: [] }) : call('verify', {})] };
    };
    expect(await runAgent({ toolbox: box, instructions: 'x', opening: [], limits: { toolCalls: 1 }, model })).toEqual({ status: 'finished' });
    expect(seen[1]).toEqual(['finish']);
  });
  it('never executes a late edit in the finish-only turn', async () => {
    const box = toolbox();
    box.workspace.edit('components/home.tsx', 'Un respiro', 'Tu calma');
    let turn = 0;
    const model: AgentModel = async () => ({ calls: [turn++ ? call('edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Changed' }) : call('verify', {})] });
    expect(await runAgent({ toolbox: box, instructions: 'x', opening: [], limits: { toolCalls: 1 }, model })).toEqual({ status: 'limit' });
    expect(box.workspace.read('components/home.tsx')).toContain('Tu calma');
    expect(box.finished).toBeNull();
  });
  it('stops at the wall-clock limit', async () => {
    let t = 0;
    const result = await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], now: () => (t += 200_000), model: scripted([{ calls: [call('list_files', {})] }]) });
    expect(result).toEqual({ status: 'limit' });
  });
  it('does not execute tools returned after the deadline', async () => {
    let time = 0;
    const box = toolbox();
    const run = jest.spyOn(box, 'run');
    const result = await runAgent({ toolbox: box, instructions: 'x', opening: [], now: () => time, limits: { wallMs: 100 }, model: async () => {
      time = 100;
      return { calls: [call('list_files', {})] };
    } });
    expect(result).toEqual({ status: 'limit' });
    expect(run).not.toHaveBeenCalled();
  });
  it('does not spend another provider call when retry backoff would exceed the deadline', async () => {
    const model = jest.fn(async () => { throw new Error('temporary outage'); });
    const sleep = jest.fn(async () => {});
    expect(await runAgent({ toolbox: toolbox(), instructions: 'x', opening: [], now: () => 0, limits: { wallMs: 1000 }, model, sleep })).toEqual({ status: 'limit' });
    expect(model).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
  it('stops between tools when a batch consumes the remaining time', async () => {
    let time = 0;
    const box = toolbox();
    const run = jest.spyOn(box, 'run').mockImplementation(async () => {
      time = 100;
      return { output: 'ok' };
    });
    const result = await runAgent({ toolbox: box, instructions: 'x', opening: [], now: () => time, limits: { wallMs: 100 }, model: scripted([{ calls: [call('list_files', {}), call('list_files', {})] }]) });
    expect(result).toEqual({ status: 'limit' });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('answers skipped batch calls before asking the model to finish a verified draft', async () => {
    const box = toolbox();
    const verify = call('verify', {});
    const edit = call('edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Unexpected change' });
    let turn = 0;
    const model: AgentModel = async ({ transcript, tools }) => {
      if (!turn++) return { calls: [verify, edit] };
      expect(tools.map(tool => tool.name)).toEqual(['finish']);
      for (const requested of [verify, edit]) {
        expect(transcript).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function_call_output', call_id: requested.callId })]));
      }
      expect(transcript).toEqual(expect.arrayContaining([expect.objectContaining({ call_id: edit.callId, output: 'Not executed: tool-call budget exhausted.' })]));
      return { calls: [call('finish', { status: 'completed', summary: 'Verificado', sections: ['Portada'], remaining: [] })] };
    };
    expect(await runAgent({ toolbox: box, instructions: 'x', opening: [], limits: { toolCalls: 1 }, model })).toEqual({ status: 'finished' });
    expect(box.workspace.read('components/home.tsx')).not.toContain('Unexpected change');
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

  it('stops the agent before the run is aborted, even after a slow design phase, and keeps its full budget when there is room', () => {
    const plan = agentLimits(true);
    const runStart = 0, deadline = runStart + agentRunHeadroom(plan.wallMs);
    // 2026-10-08, store "excess": design took 106 s, then the old 750 s hard stop aborted the agent mid-verify.
    expect(agentWallWithin(plan, deadline, 106_000).wallMs).toBe(plan.wallMs);
    const designDone = 106_000, agentStop = designDone + agentWallWithin(plan, deadline, designDone).wallMs;
    expect(deadline - agentStop).toBeGreaterThanOrEqual(AGENT_CLOSE_MS);
    // A design phase that overruns its allowance shortens the agent instead of letting the run be aborted.
    const late = agentWallWithin(plan, deadline, 400_000);
    expect(late.wallMs).toBeLessThan(plan.wallMs);
    expect(deadline - (400_000 + late.wallMs)).toBe(AGENT_CLOSE_MS);
    expect(agentWallWithin(plan, deadline, deadline).wallMs).toBe(0);
    expect(agentWallWithin(plan, deadline, 0).toolCalls).toBe(plan.toolCalls);
  });

  it('tells a run that ran out of time from one that was cancelled', async () => {
    const cancelled = new AbortController(); cancelled.abort();
    expect(abortedByTimeout(cancelled.signal)).toBe(false);
    const timed = AbortSignal.any([new AbortController().signal, AbortSignal.timeout(1)]);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(abortedByTimeout(timed)).toBe(true);
    expect(abortedByTimeout(undefined)).toBe(false);
  });
});

describe('runAgent repetition guard', () => {
  it('stops at the second appearance of a composition identity even when wording and other findings change', async () => {
    const box = toolbox();
    jest.spyOn(box, 'run').mockResolvedValueOnce({ output: '1. [composition:campaign-hierarchy] galeria.html: crowded images' }).mockResolvedValueOnce({ output: '1. [scope] Different issue\n2. [composition:campaign-hierarchy] campaign images still compete' });
    const model = jest.fn(scripted([{ calls: [call('verify', {})] }]));
    const result = await runAgent({ toolbox: box, instructions: 'x', opening: [], model });
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('[composition:campaign-hierarchy]');
    expect(model).toHaveBeenCalledTimes(2);
    expect(box.finished).toBeNull();
  });

  it('stops at the second identical soft finding so the service can ship the draft, but gives a hard finding a third try', async () => {
    const finding = '1. [scope] index.html (1280) r2: No cumple: el footer conserva la paleta';
    const soft = toolbox();
    jest.spyOn(soft, 'run').mockImplementation(async () => { soft.lastVerify = { version: -1, clean: false, hard: false }; return { output: finding }; });
    const softModel = jest.fn(scripted([{ calls: [call('verify', {})] }]));
    expect(await runAgent({ toolbox: soft, instructions: 'x', opening: [], model: softModel })).toEqual({ status: 'limit', reason: 'soft' });
    expect(softModel).toHaveBeenCalledTimes(2);
    const hard = toolbox();
    jest.spyOn(hard, 'run').mockImplementation(async () => { hard.lastVerify = { version: -1, clean: false, hard: true }; return { output: '1. [typescript] Missing is not defined' }; });
    const hardModel = jest.fn(scripted([{ calls: [call('verify', {})] }]));
    const result = await runAgent({ toolbox: hard, instructions: 'x', opening: [], model: hardModel });
    expect(result.status).toBe('failed');
    expect(hardModel).toHaveBeenCalledTimes(3);
  });

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
