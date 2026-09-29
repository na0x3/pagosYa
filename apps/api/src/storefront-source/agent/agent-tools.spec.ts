import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { AgentWorkspace } from './agent-workspace';
import { AgentToolbox, AGENT_TOOLS } from './agent-tools';

jest.setTimeout(120_000);
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
let authored: Array<{ path: string; content: string }>;
beforeAll(async () => {
  base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
  authored = base.files.filter(f => nextSourceFile(f.path));
});
const toolbox = (gate?: (files: any[]) => Promise<string | null>) => new AgentToolbox({ workspace: new AgentWorkspace(authored, { redesign: false }), previous: authored, base, instruction: 'cambia el título', purpose: 'shop', maxScreenshots: 8, gate });
const edit = (search: string, replacement: string) => JSON.stringify({ path: 'components/home.tsx', search, replacement });
const finish = JSON.stringify({ summary: 'Cambié el título', sections: ['Portada'] });

describe('AgentToolbox', () => {
  it('declares every tool with a strict JSON schema', () => {
    expect(AGENT_TOOLS.map(t => t.name)).toEqual(['list_files', 'read_file', 'edit_file', 'write_file', 'screenshot', 'verify', 'set_product_card_theme', 'finish']);
    for (const tool of AGENT_TOOLS) expect(tool.strict).toBe(true);
  });
  it('reads and edits, recording merchant-facing steps without source code', async () => {
    const box = toolbox();
    expect((await box.run('read_file', JSON.stringify({ path: 'components/home.tsx' }))).output).toContain('Un respiro');
    expect((await box.run('edit_file', edit('Un respiro', 'Tu calma'))).output).toBe('ok');
    expect(box.steps.map(s => s.label)).toEqual(['Leyó components/home.tsx', 'Editó components/home.tsx']);
  });
  it('refuses finish until a clean verify ran after the last edit', async () => {
    const box = toolbox();
    expect((await box.run('finish', finish)).output).toContain('verify');
    expect((await box.run('verify', '{}')).output).toBe('Todo en orden.');
    await box.run('edit_file', edit('Un respiro', 'Tu calma'));
    expect((await box.run('finish', finish)).output).toContain('verify');
    await box.run('verify', '{}');
    expect((await box.run('finish', finish)).output).toBe('ok');
    expect(box.finished).toEqual({ summary: 'Cambié el título', sections: ['Portada'] });
  });
  it('returns the save gate’s message on finish and keeps working', async () => {
    const box = toolbox(async () => 'Falta el catálogo');
    await box.run('verify', '{}');
    expect((await box.run('finish', finish)).output).toContain('Falta el catálogo');
    expect(box.finished).toBeNull();
  });
  it('reports a compile error found by verify and by screenshot as tool results', async () => {
    const box = toolbox();
    await box.run('edit_file', edit('<h1 className="pa2-display">', '<Missing /><h1 className="pa2-display">'));
    expect((await box.run('verify', '{}')).output).toMatch(/^1\. \[typescript\].*Missing/);
    expect((await box.run('screenshot', JSON.stringify({ width: 390 }))).output).toContain('No se pudo capturar');
    expect(box.draftIsClean()).toBe(false);
  });
  it('hands the compiled draft to the live preview after a clean verify', async () => {
    const previews: Array<Array<{ path: string; content: string }>> = [];
    const box = new AgentToolbox({ workspace: new AgentWorkspace(authored, { redesign: false }), previous: authored, base, instruction: 'cambia el título', purpose: 'shop', maxScreenshots: 8, onPreview: files => { previews.push(files); } });
    await box.run('edit_file', edit('Un respiro', 'Tu calma'));
    await box.run('verify', '{}');
    expect(previews).toHaveLength(1);
    expect(previews[0].find(f => f.path === '_compiled/home.js')!.content).toContain('Tu calma');
  });
  it('answers unknown tools, malformed arguments and read-only paths as tool errors', async () => {
    const box = toolbox();
    expect((await box.run('delete_everything', '{}')).output).toContain('inválid');
    expect((await box.run('read_file', '{not json')).output).toContain('inválid');
    expect((await box.run('write_file', JSON.stringify({ path: 'components/store-data.tsx', content: 'x' }))).output).toContain('Solo se pueden');
    expect(box.steps).toEqual([]);
  });
});
