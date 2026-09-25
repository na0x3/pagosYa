import { sourceVisualFields, applySourceVisualEdit } from './source-visual-edit';
import { sourceHomeRegions } from './source-edit-scope';
import { SourceProjectsService } from './source-projects.service';
import type { SourceProjectFileDto as File } from './dto/save-source-project.dto';

const fixture = (): File[] => [
  { path: 'components/home.tsx', content: `import {Hero, Catalog, StoreTheme} from '@pagosya/ui';
    const tokens = {paper:'#fafafa', ink:'#123456', accent:'#654321'};
    export default function Home(){return <StoreTheme tokens={tokens}><main id="contenido"><section id="hero"><Hero variant="split" title="Hello &amp; welcome" image={{src:'/assets/a.jpg',alt:'Photo'}}/><h2>Our story</h2></section><section id="menu"><Catalog title="Shop"/><div data-pagosya-catalog><p>Protected</p></div></section><section id="story"><p>Last chapter</p></section></main></StoreTheme>}` },
  { path: 'assets/a.jpg', content: 'AAAA', encoding: 'base64' }, { path: 'assets/b.jpg', content: 'BBBB', encoding: 'base64' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG={data:{items:[{name:"Protected product",amount:2500}]}};' },
  { path: 'design-direction.json', content: JSON.stringify({ selected: 0, concepts: [{ layout: { sections: ['hero','menu','story'], catalogSection:'menu', standaloneIntro:true, productsInOpening:false } }] }) },
  { path: 'visual-system.json', content: JSON.stringify({ layout: {sectionOrder:['hero','menu','story'],catalogSection:'menu'} }) },
];

describe('deterministic visual editing', () => {
  it('lists literal display fields and approved images without exposing runtime/config data', () => {
    const fields = sourceVisualFields(fixture());
    expect(fields.some(field => field.value === 'Our story')).toBe(true);
    expect(fields.some(field => field.value === 'Hello & welcome')).toBe(true);
    expect(fields.filter(field => field.kind === 'color')).toHaveLength(3);
    expect(fields.find(field => field.kind === 'image')?.options).toEqual(['/assets/a.jpg', '/assets/b.jpg']);
    expect(fields.some(field => /Protected/.test(field.value))).toBe(false);
    expect(fields.find(field => field.value === 'split')?.options).toContain('editorial');
  });

  it('replaces only the selected text and escapes markup/code as a string literal', () => {
    const files = fixture();
    const field = sourceVisualFields(files).find(field => field.value === 'Our story')!;
    const changed = applySourceVisualEdit(files, field.id, '<script>{alert("x")}</script>').files;
    expect(changed[0].content).toContain('<h2>{"<script>{alert(\\"x\\")}</script>"}</h2>');
    expect(changed.slice(1)).toEqual(files.slice(1));
    expect(sourceVisualFields(changed).some(field => field.value === '<script>{alert("x")}</script>')).toBe(true);
    expect(() => applySourceVisualEdit(changed, field.id, 'Stale')).toThrow('elemento cambió');
  });

  it('validates colors/options/images, preserving the rest of each file', () => {
    const files = fixture(), fields = sourceVisualFields(files);
    const image = fields.find(field => field.kind === 'image')!, color = fields.find(field => field.kind === 'color')!, variant = fields.find(field => field.value === 'split')!;
    expect(() => applySourceVisualEdit(files, image.id, 'javascript:alert(1)')).toThrow('imagen existente');
    expect(applySourceVisualEdit(files, image.id, '/assets/b.jpg').files[0].content).toContain('src:"/assets/b.jpg"');
    expect(() => applySourceVisualEdit(files, color.id, '#fff; background:url(x)')).toThrow('hexadecimal');
    expect(applySourceVisualEdit(files, color.id, '#006644').files[0].content).toContain('paper:"#006644"');
    expect(() => applySourceVisualEdit(files, variant.id, 'unknown')).toThrow('opción válida');
    expect(applySourceVisualEdit(files, variant.id, 'editorial').files[0].content).toContain('variant="editorial"');
  });

  it('reorders literal sections and synchronizes both design manifests', () => {
    const files = fixture();
    const field = sourceVisualFields(files).find(field => field.label.includes('«story»'))!;
    const next = applySourceVisualEdit(files, field.id, 'hero').files;
    expect(sourceHomeRegions(next).map(region => region.id)).toEqual(['story','hero','menu']);
    expect(sourceHomeRegions(next).map(region => region.text).sort()).toEqual(sourceHomeRegions(files).map(region => region.text).sort());
    expect(JSON.parse(next.find(file => file.path === 'design-direction.json')!.content).concepts[0].layout.sections).toEqual(['story','hero','menu']);
    expect(JSON.parse(next.find(file => file.path === 'visual-system.json')!.content).layout.sectionOrder).toEqual(['story','hero','menu']);
  });

  it('edits static HTML and root custom color declarations with source offsets', () => {
    const files = [
      { path:'index.html',content:'<!doctype html><html><head><title>Title</title></head><body><main><h1>A &amp; B</h1><img src="assets/a.jpg" alt="A photo"><div data-pagosya-catalog><p>Protected</p></div></main></body></html>' },
      { path:'styles.css',content:':root { --paper: #ffffff; --ink:#222; } .text { color:#abc; }' },
    ];
    const fields = sourceVisualFields(files);
    expect(fields.filter(field => field.kind === 'color')).toHaveLength(2);
    const image = fields.find(field => field.kind === 'image')!;
    const alt = fields.find(field => field.value === 'A photo')!;
    const text = fields.find(field => field.value === 'A & B')!;
    expect(applySourceVisualEdit(files, alt.id, 'Photo "quoted"').files[0].content).toContain('alt="Photo &quot;quoted&quot;"');
    expect(applySourceVisualEdit(files, text.id, 'New <b>text</b>').files[0].content).toContain('<h1>New &lt;b&gt;text&lt;/b&gt;</h1>');
    expect(image.value).toBe('assets/a.jpg');
    const color = fields.find(field => field.value === '#ffffff')!;
    expect(applySourceVisualEdit(files, color.id, '#010203').files[1].content).toBe(':root { --paper: #010203; --ink:#222; } .text { color:#abc; }');
  });

  it('enforces ownership/current revision then saves through existing CAS and recompilation', async () => {
    const service = new SourceProjectsService({} as any);
    const files = fixture(), field = sourceVisualFields(files).find(field => field.value === 'Our story')!;
    const current = jest.spyOn(service, 'current').mockResolvedValue({ revision: 7, slug: 'shop', updatedAt: null } as any);
    jest.spyOn(service, 'version').mockResolvedValue({ snapshot: { files, brief: { businessType:'shop' } } } as any);
    const save = jest.spyOn(service, 'save').mockResolvedValue({revision:8} as any);
    await expect(service.visualEdit('merchant', 'shop', { revision:7,fieldId:field.id,value:'New story' })).resolves.toEqual({revision:8});
    expect(save).toHaveBeenCalledWith('merchant','shop',expect.objectContaining({ revision:7,files:expect.any(Array),brief:{businessType:'shop'} }));
    current.mockResolvedValue({revision:8} as any);
    await expect(service.visualFields('merchant','shop',7)).rejects.toThrow('proyecto cambió');
    await expect(service.visualEdit('merchant','shop',{revision:7,fieldId:field.id,value:'Stale'})).rejects.toThrow('proyecto cambió');
    expect(save).toHaveBeenCalledTimes(1);
  });
});

it('offers literal token typefaces, adds a local font declaration and bundles its licensed bytes on save', async () => {
  const { withSourceFonts } = await import('./source-fonts');
  const files: File[] = [{ path: 'components/theme.tsx', content: 'const tokens = {displayFont:"My brand font",bodyFont:"system-ui"}; export default tokens;' }, { path: 'styles/globals.css', content: ':root{--space:20px}' }];
  const field = sourceVisualFields(files).find(field => field.label === 'Tipografía · Títulos')!;
  expect(field.options).toContain('My brand font');
  expect(field.options).toContain('"Fraunces", serif');
  expect(() => applySourceVisualEdit(files, field.id, 'url(https://untrusted.test/font)')).toThrow('opción válida');
  const changed = applySourceVisualEdit(files, field.id, '"Fraunces", serif').files;
  expect(changed[0].content).toContain('displayFont:"\\"Fraunces\\", serif"');
  expect(changed[1].content).toContain(":root{--space:20px}\n/* pagosya-visual-font:fraunces */");
  expect(changed[1].content).toContain("src:url('/assets/fraunces.ttf')");
  const bundled = await withSourceFonts(changed);
  expect(bundled).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'assets/fraunces.ttf', encoding: 'base64' }), expect.objectContaining({ path: 'assets/fraunces-OFL.txt' })]));
  const body = sourceVisualFields(changed).find(candidate => candidate.label === 'Tipografía · Texto')!;
  const second = applySourceVisualEdit(changed, body.id, '"Fraunces", serif').files;
  expect(second[1].content.match(/pagosya-visual-font:fraunces/g)).toHaveLength(1);
});
it('edits an existing literal focal position or inserts one without changing photo identity', () => {
  for (const properties of ["src:'/assets/a.jpg',alt:'Photo'", "src:'/assets/a.jpg',alt:'Photo',", "src:'/assets/a.jpg',alt:'Photo',position:'25% 30%'"]) {
    const files: File[] = [{ path: 'components/home.tsx', content: `export default function Home(){return <Hero image={{${properties}}}/>}` }];
    const field = sourceVisualFields(files).find(field => field.label === 'Hero · Encuadre')!;
    expect(field.options).toContain('50% 0%');
    expect(() => applySourceVisualEdit(files, field.id, '0; background:url(x)')).toThrow('opción válida');
    const changed = applySourceVisualEdit(files, field.id, '50% 0%').files;
    expect(changed[0].content).toContain('position:"50% 0%"');
    expect(changed[0].content).toContain("src:'/assets/a.jpg',alt:'Photo'");
    expect(changed[0].content).not.toContain(',,');
    expect(sourceVisualFields(changed).filter(candidate => candidate.label === 'Hero · Encuadre')).toHaveLength(1);
  }
});
it('does not expose code-generated fonts, unknown objects or spread image positions', () => {
  const files: File[] = [{ path: 'components/home.tsx', content: `const tokens={displayFont:pickFont()}; const other={bodyFont:'Secret'}; export default function Home(){return <Hero image={{src:'/assets/a.jpg',...image}}/>}` }];
  expect(sourceVisualFields(files).some(field => /Tipografía|Encuadre/.test(field.label))).toBe(false);
});

it('matches rendered JSX attribute text while preserving literal entities in JavaScript expressions', () => {
  const files: File[] = [{ path: 'components/home.tsx', content: 'export default function Home(){return <><Hero title="A &amp; B"/><Hero title={"A &amp; B"}/></>}' }];
  const fields = sourceVisualFields(files).filter(field => field.label === 'Hero · title');
  expect(fields.map(field => ({ value: field.value, previewValue: field.previewValue }))).toEqual([
    { value: 'A & B', previewValue: 'A & B' },
    { value: 'A &amp; B', previewValue: 'A &amp; B' },
  ]);
  const changed = applySourceVisualEdit(files, fields[1].id, 'C &amp; D').files;
  expect(changed[0].content).toContain('title={"C &amp; D"}');
  expect(changed[0].content).toContain('title="A &amp; B"');
  expect(sourceVisualFields(changed).find(field => field.value === 'C &amp; D')?.previewValue).toBe('C &amp; D');
});
