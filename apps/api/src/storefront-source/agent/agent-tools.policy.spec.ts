import { AgentToolbox, AGENT_TOOLS } from './agent-tools';
import { AgentWorkspace } from './agent-workspace';

const toolbox = () => new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'cambia la política de devoluciones', purpose: 'shop', maxScreenshots: 0 } as never);
const call = (box: AgentToolbox, kind: string, text: string | null) => box.run('set_store_policy', JSON.stringify({ kind, text }));

describe('set_store_policy', () => {
  it('is a strict tool over the four Ajustes policies', () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'set_store_policy') as any;
    expect(tool.strict).toBe(true);
    expect(tool.parameters.properties.kind.enum).toEqual(['returns', 'delivery', 'privacy', 'terms']);
  });
  it('holds the new text for the save, says it goes to Ajustes, and records a step', async () => {
    const box = toolbox();
    const { output } = await call(box, 'returns', 'Aceptamos cambios dentro de 7 días con la boleta.');
    expect(box.pendingPolicies).toEqual({ returns: 'Aceptamos cambios dentro de 7 días con la boleta.' });
    expect(output).toMatch(/Ajustes/);
    expect(box.steps.at(-1)).toEqual(expect.objectContaining({ kind: 'set_store_policy', label: 'Actualizó la política Cambios y devoluciones' }));
  });
  it('removes a policy with null or empty text', async () => {
    const box = toolbox();
    await call(box, 'terms', null);
    await call(box, 'privacy', '   ');
    expect(box.pendingPolicies).toEqual({ terms: null, privacy: null });
  });
  it('refuses text Ajustes would refuse, changing nothing', async () => {
    const box = toolbox();
    expect((await call(box, 'returns', 'x'.repeat(6001))).output).toMatch(/6000/);
    expect(box.pendingPolicies).toEqual({});
  });
});
