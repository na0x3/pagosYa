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
    expect(AGENT_TOOLS.map(t => t.name)).toEqual(['inspect_asset', 'search_illustrations', 'inspect_project', 'plan_task', 'set_account_theme', 'set_motif_pack', 'set_store_policy', 'create_page', 'list_files', 'read_file', 'edit_file', 'edit_file_batch', 'write_file', 'screenshot', 'verify', 'set_product_card_theme', 'finish']);
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
  it('invalidates verified drafts after a batch and rejects malformed batches without changing files', async () => {
    const box = toolbox();
    const path = 'components/home.tsx';
    await box.run('verify', '{}');
    const version = box.workspace.version;
    for (const edits of [[], [{ search: 'Un respiro', replacement: null }], Array.from({ length: 21 }, () => ({ search: 'x', replacement: 'y' }))]) {
      expect((await box.run('edit_file_batch', JSON.stringify({ path, edits }))).output).toContain('entre 1 y 20');
    }
    expect(box.workspace.version).toBe(version);
    expect(box.draftIsClean()).toBe(true);
    expect((await box.run('edit_file_batch', JSON.stringify({ path, edits: [{ search: 'Un respiro', replacement: 'Tu calma' }] }))).output).toBe('ok');
    expect(box.draftIsClean()).toBe(false);
    expect((await box.run('finish', finish)).output).toContain('verify');
  });
  it('requires a task plan before a batch can change the draft', async () => {
    const box = new AgentToolbox({ workspace: new AgentWorkspace(authored, { redesign: false }), previous: authored, base, instruction: 'cambia el título', purpose: 'shop', maxScreenshots: 8, taskRequired: true });
    expect((await box.run('edit_file_batch', JSON.stringify({ path: 'components/home.tsx', edits: [{ search: 'Un respiro', replacement: 'Tu calma' }] }))).output).toContain('plan_task');
    expect(box.workspace.version).toBe(0);
  });
  it('returns the save gate’s message on finish and keeps working', async () => {
    const box = toolbox(async () => 'Falta el catálogo');
    expect((await box.run('verify', '{}')).output).toContain('Falta el catálogo');
    expect((await box.run('finish', finish)).output).toContain('verify');
    expect(box.finished).toBeNull();
  });
  it('reports a compile error found by verify and by screenshot as tool results', async () => {
    const box = toolbox();
    await box.run('edit_file', edit('<h1 className="pa2-display">', '<Missing /><h1 className="pa2-display">'));
    expect((await box.run('verify', '{}')).output).toMatch(/^1\. \[typescript\].*Missing/);
    expect((await box.run('screenshot', JSON.stringify({ width: 390 }))).output).toContain('No se pudo capturar');
    expect(box.draftIsClean()).toBe(false);
  });
  it('streams renderable edits before verify and keeps them when the next edit cannot compile', async () => {
    const previews: Array<Array<{ path: string; content: string }>> = [];
    const box = new AgentToolbox({ workspace: new AgentWorkspace(authored, { redesign: false }), previous: authored, base, instruction: 'cambia el título', purpose: 'shop', maxScreenshots: 8, onPreview: files => { previews.push(files); } });
    await box.run('edit_file', edit('Un respiro', 'Tu calma'));
    expect(box.lastVerify).toBeNull();
    expect(previews).toHaveLength(1);
    expect(previews[0].find(f => f.path === '_compiled/home.js')!.content).toContain('Tu calma');
    await box.run('edit_file', edit('<h1 className="pa2-display">', '<Missing /><h1 className="pa2-display">'));
    expect(previews).toHaveLength(1);
    expect(box.draftIsClean()).toBe(false);
  });
  it('answers unknown tools, malformed arguments and read-only paths as tool errors', async () => {
    const box = toolbox();
    expect((await box.run('delete_everything', '{}')).output).toContain('inválid');
    expect((await box.run('read_file', '{not json')).output).toContain('inválid');
    expect((await box.run('write_file', JSON.stringify({ path: 'components/store-data.tsx', content: 'x' }))).output).toContain('Solo se pueden');
    expect(box.steps).toEqual([]);
  });
});

describe('AgentToolbox screenshots', () => {
  it('tells the model what to do when the screenshots are used up, instead of leaving it to ask again', async () => {
    const box = new AgentToolbox({ workspace: new AgentWorkspace(authored, { redesign: false }), previous: authored, base, instruction: 'x', purpose: 'shop', maxScreenshots: 0 });
    const result = await box.run('screenshot', JSON.stringify({ width: 1280 }));
    expect(result.output).toContain('Ya no quedan capturas');
    expect(result.output).toContain('finish');
    expect(result.image).toBeUndefined();
  });
});

// Spec 2026-10-08-store-built-in-account-pages: YAPI designs the account pages; the controls always stay usable.
describe('set_account_theme', () => {
  const box = (instruction: string, accountThemeAllowed: boolean) => new AgentToolbox({ workspace: new AgentWorkspace([...authored, { path: 'assets/hero.jpg', content: 'x', encoding: 'base64' } as any], { redesign: false }), previous: authored, base, instruction, purpose: 'shop', maxScreenshots: 8, accountThemeAllowed } as any);
  it('stores a sanitized theme and reports what it dropped', async () => {
    const tools = box('haz el login más elegante', true);
    const result = await tools.run('set_account_theme', JSON.stringify({ layout: 'split', photo: 'assets/hero.jpg', css: '[data-part=input]{display:none}' }));
    expect(tools.pendingAccountTheme).toEqual({ layout: 'split', photo: 'assets/hero.jpg' });
    expect(result.output).toContain('protected part');
  });
  it('keeps what an earlier call set when a field is null', async () => {
    const tools = box('rediseña la cuenta', true);
    await tools.run('set_account_theme', JSON.stringify({ layout: 'panel', photo: null, css: null }));
    await tools.run('set_account_theme', JSON.stringify({ layout: null, photo: null, css: '[data-part=title]{letter-spacing:1px}' }));
    expect(tools.pendingAccountTheme?.layout).toBe('panel');
    expect(tools.pendingAccountTheme?.css).toContain('letter-spacing');
  });
  it('refuses the tool on an edit that is not about the account', async () => {
    const tools = box('cambia el footer', false);
    expect((await tools.run('set_account_theme', JSON.stringify({ layout: 'panel', photo: null, css: null }))).output).toContain('no cambia la cuenta');
    expect(tools.pendingAccountTheme).toBeNull();
  });
});
