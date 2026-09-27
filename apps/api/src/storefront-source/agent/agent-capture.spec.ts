import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { agentPreviewSnapshot, captureAgentDraft } from './agent-capture';

jest.setTimeout(120_000);

describe('agent capture', () => {
  it('compiles an edited draft over the store runtime and screenshots it on a phone', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace('Un respiro', 'Tu calma') } : f);
    const snapshot = await agentPreviewSnapshot(base, authored);
    expect(snapshot.files.find(f => f.path === '_compiled/home.js')!.content).toContain('Tu calma');
    expect(snapshot.files.some(f => f.path === 'config.js')).toBe(true);
    const shot = await captureAgentDraft(snapshot, 390);
    expect(shot.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(shot.thumbnail.length).toBeLessThan(shot.image.length);
    expect(shot.errors).toEqual([]);
  });
});
