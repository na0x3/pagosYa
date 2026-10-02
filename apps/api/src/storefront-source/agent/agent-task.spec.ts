import { assertTaskFeasibility } from './agent-task';
import { AgentToolbox } from './agent-tools';
import { AgentWorkspace } from './agent-workspace';
import { validateTaskRequirements, agentProjectIndex, workspaceDigest, agentImagePaths } from './agent-task';
import { compactAgentTranscript } from './agent-loop';
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { captureAgentDraft } from './agent-capture';
import sharp from 'sharp';

jest.setTimeout(120000);
const requirement = { id:'r1', description:'El título pedido aparece', page:'index.html', check:'text', selector:'h1', expected:'Tu calma' };
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
beforeAll(async () => { base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa')); });
const box = () => { const files = base.files.filter(f => nextSourceFile(f.path)); return new AgentToolbox({ workspace: new AgentWorkspace(files, { redesign:false }), previous:files, base, instruction:'Cambia el título a Tu calma', purpose:'shop', maxScreenshots:8, taskRequired:true }); };
const finish = { summary:'Cambié el título.', sections:['Portada'], status:'completed', remaining:[] };

it('blocks completion on an unplanned broken section link and accepts the repaired draft', async () => {
  const tools = box();
  await tools.run('plan_task', JSON.stringify({ requirements: [requirement] }));
  await tools.run('edit_file', JSON.stringify({ path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }));
  await tools.run('edit_file', JSON.stringify({ path: 'components/home.tsx', search: '</h1>', replacement: '</h1><a href="#missing-section">Continuar</a>' }));
  expect((await tools.run('verify', '{}')).output).toContain('Enlace a sección inexistente: #missing-section');
  expect(tools.evidence.every(e => e.passed)).toBe(true);
  expect((await tools.run('finish', JSON.stringify(finish))).output).toContain('verify');
  expect(tools.finished).toBeNull();
  await tools.run('edit_file', JSON.stringify({ path: 'components/home.tsx', search: '<a href="#missing-section">Continuar</a>', replacement: '<section id="missing-section"><a href="#missing-section">Continuar</a></section>' }));
  expect((await tools.run('verify', '{}')).output).toBe('Todo en orden.');
  expect((await tools.run('finish', JSON.stringify(finish))).output).toBe('ok');
});

it('requires a plan, locks it after edits and verifies the actual requested text on both widths', async () => {
  const tools = box();
  const edit = { path:'components/home.tsx', search:'Un respiro', replacement:'Tu calma' };
  expect((await tools.run('edit_file', JSON.stringify(edit))).output).toContain('plan_task');
  await tools.run('plan_task', JSON.stringify({ requirements:[requirement] }));
  expect((await tools.run('verify','{}')).output).toContain('No cumple');
  expect((await tools.run('finish', JSON.stringify(finish))).output).toContain('verify');
  await tools.run('edit_file', JSON.stringify(edit));
  expect((await tools.run('plan_task', JSON.stringify({ requirements:[{...requirement,expected:'anything'}] }))).output).toContain('ya está fijado');
  expect((await tools.run('verify','{}')).output).toBe('Todo en orden.');
  expect(tools.evidence.map(e=>[e.width,e.passed])).toEqual([[1280,true],[390,true]]);
  expect((await tools.run('finish',JSON.stringify(finish))).output).toBe('ok');
});
it('stops honestly on unsupported work without marking a draft finished',async()=>{
  const tools=box();
  await tools.run('plan_task',JSON.stringify({requirements:[requirement]}));
  await tools.run('finish',JSON.stringify({...finish,status:'blocked',summary:'Falta el texto confirmado.',remaining:['r1']}));
  expect(tools.finished).toBeNull();expect(tools.stopped?.remaining).toEqual(['r1']);
});
it('rejects unregistered targets and identifies protected ownership and asset availability',()=>{
  expect(()=>validateTaskRequirements([{...requirement,page:'https://example.org'}],base.files)).toThrow();
  const index=agentProjectIndex([...base.files,{path:'assets/new.webp',content:'abcd',encoding:'base64'}]);
  expect(index.assets.find(a=>a.path==='assets/new.webp')).toMatchObject({available:true,bytes:3});
  expect(index.protected).toContain('components/store-data.tsx');
  expect(workspaceDigest(base.files)).not.toBe(workspaceDigest([...base.files,{path:'assets/new.webp',content:'x'}]));
});
it('rejects unsupported navigation checks before locking a plan or editing files', async () => {
  const tools = box();
  for (const expected of ['#catalogo', 'product.html?id=1', 'https://example.org/servicios.html']) {
    const result = await tools.run('plan_task', JSON.stringify({ requirements: [{ ...requirement, check: 'navigation', selector: 'a', expected }] }));
    expect(result.output).toContain('página local');
    expect(tools.requirements).toEqual([]);
  }
  const accepted = JSON.parse((await tools.run('plan_task', JSON.stringify({ requirements: [requirement] }))).output);
  expect(accepted).toEqual({ requirements: [requirement] });
});
it('captures the requested page, decodes supplied assets and reports missing image bytes',async()=>{
  const png=await sharp({create:{width:10,height:10,channels:3,background:'#ff6600'}}).png().toBuffer();
  const snap={...base,schemaVersion:1 as const,files:[{path:'second.html',encoding:'utf8' as const,content:'<h1>Second</h1><img src="assets/new.png" alt="New">'},{path:'assets/new.png',content:png.toString('base64'),encoding:'base64' as const}]};
  const good=await captureAgentDraft(snap,390,undefined,'second.html',[{...requirement,page:'second.html',expected:'Second'} as any]);
  expect(good.errors).toEqual([]);expect(good.evidence[0].passed).toBe(true);
  const bad=await captureAgentDraft({...snap,files:snap.files.slice(0,1)},390,undefined,'second.html');
  expect(bad.errors).toContain('Imagen no disponible: assets/new.png');
});
it('requires every image in a grouped requirement at both widths and names a missing image', async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff6600' } }).png().toBuffer();
  const paths = Array.from({ length: 6 }, (_, i) => `assets/photo-${i}.png`);
  const required = { ...requirement, check: 'image' as const, selector: 'img', expected: paths.join(', ') };
  expect(agentImagePaths(required.expected)).toEqual(paths);
  expect(() => agentImagePaths('assets/photo.png, https://example.org/a.png')).toThrow();
  const snapshot = { ...base, schemaVersion: 1 as const, files: [
    { path: 'index.html', encoding: 'utf8' as const, content: paths.map(path => `<img src="${path}" alt="Foto" width="10" height="10">`).join('') },
    ...paths.map(path => ({ path, content: png.toString('base64'), encoding: 'base64' as const })),
  ] };
  for (const width of [1280, 390] as const) {
    const evidence = (await captureAgentDraft(snapshot, width, undefined, 'index.html', [required, { ...required, id: 'r2', selector: 'body' }])).evidence;
    expect(evidence.map(row => row.passed)).toEqual([true, true]);
  }
  const missing = await captureAgentDraft({ ...snapshot, files: snapshot.files.slice(0, -1) }, 390, undefined, 'index.html', [required]);
  expect(missing.evidence[0]).toMatchObject({ passed: false, detail: expect.stringContaining('assets/photo-5.png') });
});
it('retains tool call/result pairing while evicting old file reads and screenshots',()=>{
  const transcript:any[]=[{role:'user',content:[{type:'input_text',text:'Original request'}]},{type:'function_call',name:'read_file',call_id:'a',arguments:'{}'},{type:'function_call_output',call_id:'a',output:'x'.repeat(10000)},{role:'user',content:[{type:'input_image',image_url:'old'}]},...Array.from({length:14},()=>({role:'user',content:'continue'})),{role:'user',content:[{type:'input_image',image_url:'new'}]}];
  const compact:any[]=compactAgentTranscript(transcript);
  expect(compact[0]).toEqual(transcript[0]);expect(compact[1]).toEqual(transcript[1]);expect(compact[2].call_id).toBe('a');expect(compact[2].output).toContain('evicted');expect(JSON.stringify(compact)).not.toContain('"old"');expect(JSON.stringify(compact)).toContain('"new"');
});

it('creates independent pages and verifies actual menu navigation on desktop and mobile',async()=>{
  const files=base.files.filter(f=>nextSourceFile(f.path));
  const tools=new AgentToolbox({workspace:new AgentWorkspace(files,{redesign:false}),previous:files,base,instruction:'Crea una página independiente Servicios y enlázala en el menú, no una sección.',purpose:'shop',maxScreenshots:8,taskRequired:true});
  const requirements=[{id:'r1',description:'El menú abre Servicios',page:'index.html',check:'navigation',selector:'header a[href="servicios.html"]',expected:'servicios.html'},{id:'r2',description:'Servicios tiene su propia página',page:'servicios.html',check:'text',selector:'h1',expected:'Servicios'}];
  await tools.run('plan_task',JSON.stringify({requirements}));
  expect((await tools.run('create_page',JSON.stringify({slug:'servicios',content:'import Shell from "./Shell"; export default function Services() { return <Shell><main><h1>Servicios</h1><p>Conoce nuestras clases.</p><a href="index.html">Volver al inicio</a></main></Shell>; }'}))).output).toContain('servicios.html');
  await tools.run('edit_file',JSON.stringify({path:'components/Shell.tsx',search:"const links = [",replacement:"const links = [{ label: 'Servicios', href: 'servicios.html' }, "}));
  expect((await tools.run('verify','{}')).output).toContain('Navegación fallida');
  await tools.run('edit_file',JSON.stringify({path:'styles/globals.css',search:'.pa2-nav{display:none}',replacement:'.pa2-nav{display:flex;flex-wrap:wrap;gap:8px;font-size:12px}.pa2-header{flex-wrap:wrap;gap:12px}'}));
  expect((await tools.run('verify','{}')).output).toBe('Todo en orden.');
  expect(tools.evidence).toHaveLength(4);expect(tools.evidence.every(e=>e.passed)).toBe(true);
  expect((await tools.run('create_page',JSON.stringify({slug:'servicios',content:'x'}))).output).toContain('ya existe');
});

it('rejects product-instance checks before editing an empty catalog while allowing empty-state checks', () => {
  const base = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' }];
  const rule: any = { id: 'r1', page: 'product.html', check: 'style', selector: '[data-pagosya-product] [data-part="gallery"]', expected: 'border-radius:28px', description: 'Gallery' };
  expect(() => assertTaskFeasibility([rule], base)).toThrow('catálogo está vacío');
  expect(() => assertTaskFeasibility([{ ...rule, check: 'text', selector: 'body', expected: 'No disponible' }], base)).not.toThrow();
  expect(() => assertTaskFeasibility([rule], [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[{"id":"p1"}]}};' }])).not.toThrow();
});
