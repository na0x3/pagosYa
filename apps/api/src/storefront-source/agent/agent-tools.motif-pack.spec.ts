import { AgentToolbox, AGENT_TOOLS } from './agent-tools';
import { AgentWorkspace } from './agent-workspace';
import { listMotifPacks } from '../source-motif-packs';

const toolbox = () => new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'heladería divertida', purpose: 'shop', maxScreenshots: 0 } as never);
const call = (box: AgentToolbox, id: string | null) => box.run('set_motif_pack', JSON.stringify({ id }));

describe('set_motif_pack', () => {
  it('refuses on a local edit that is not about decoration, and allows it when the merchant asks for it', async () => {
    const local = new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'cambia el precio del helado', purpose: 'shop', maxScreenshots: 0, motifPackAllowed: false } as never);
    expect((await call(local, 'icecream')).output).toMatch(/no cambia la decoración/);
    expect(local.pendingMotifPack).toBeUndefined();
  });
  it('lists every valid pack as a strict nullable enum', () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'set_motif_pack') as any;
    expect(tool.strict).toBe(true);
    expect(tool.parameters.properties.id.enum).toEqual([...listMotifPacks().map(pack => pack.id), null]);
  });
  it('holds the chosen pack for the save and reports its placements', async () => {
    const box = toolbox();
    const { output } = await call(box, 'icecream');
    expect(box.pendingMotifPack).toBe('icecream');
    expect(output).toContain('icecream');
    expect(output).toMatch(/sticker|button|divider/);
    expect(box.steps.at(-1)?.kind).toBe('set_motif_pack');
  });
  it('removes with null and refuses an unknown pack, leaving the choice unchanged', async () => {
    const box = toolbox();
    await call(box, null);
    expect(box.pendingMotifPack).toBeNull();
    expect((await call(box, 'unicorns')).output).toMatch(/no existe/);
    expect(box.pendingMotifPack).toBeNull();
  });
});
