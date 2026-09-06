import { SourceGenerationService, validateGeneratedSource } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
const files = () => [
  {path:'index.html',content:'<!doctype html><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script>'},
  {path:'styles.css',content:'body { color: #222; }'}, {path:'site.js',content:'globalThis.__generatedSourceExecuted = true;'},
];
const input = {revision:0,brief:{businessType:'Café',audience:'Neighbors',primaryAction:'Order',visualDirection:'Menu first'},instruction:'Use a menu-led layout',assetUrls:[]};
function setup() {
  const prisma:any={store:{findFirst:jest.fn().mockResolvedValue({slug:'cafe'})},mediaAsset:{findFirst:jest.fn().mockResolvedValue(null)}};
  const stores:any={getStorePublic:jest.fn().mockResolvedValue({storeName:'Café',checkoutMode:'PAYMENT',items:[],categories:[],locations:[]})};
  const projects:any={state:jest.fn().mockResolvedValue({revision:0}),save:jest.fn().mockImplementation(async(_m,_s,value)=>({revision:1,snapshot:sourceProjectSnapshot(value)})),version:jest.fn()};
  const config:any={get:jest.fn((key:string)=>({'app.openAi.apiKey':'test-server-key','app.openAi.enabled':true,'app.checkoutOrigin':'http://localhost:5174','app.environment':'test'}[key]))};
  const uploads:any={getBuffer:jest.fn(),contentTypeFor:jest.fn().mockReturnValue('image/png')};
  return {service:new SourceGenerationService(prisma,stores,projects,uploads,config),prisma,projects,config,uploads,stores};
}
describe('Independent source generation',()=>{
  afterEach(()=>jest.restoreAllMocks());
  it('refreshes only public catalog fields for the owning merchant without tracking a storefront view', async () => {
    const { service, prisma, stores } = setup();
    prisma.store.findFirst.mockResolvedValueOnce(null);
    await expect(service.catalog('other', 's')).rejects.toThrow('Store not found');
    expect(stores.getStorePublic).not.toHaveBeenCalled();
    stores.getStorePublic.mockResolvedValueOnce({ storeName: 'Café', items: [{ id: 'p1', amount: 6500, stock: 7 }], categories: [], privateCredential: 'not-for-preview' });
    const catalog = await service.catalog('m', 's');
    expect(catalog.items[0].amount).toBe(6500);
    expect(catalog).not.toHaveProperty('privateCredential');
    expect(stores.getStorePublic).toHaveBeenCalledWith('cafe', { trackView: false });
  });
  it('packages generated files with portable commerce without executing source or exporting secrets',async()=>{
    const fetchMock=jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({label:'Café menu',files:files()})}]}]})));
    const {service}=setup();const result=await service.generate('m','s',input);
    expect((result as any).snapshot.files.map((f:any)=>f.path)).toEqual(expect.arrayContaining(['index.html','commerce.js','config.js','build.mjs','server.mjs','package.json','README.md']));
    expect(JSON.stringify(result)).not.toContain('test-server-key');
    expect((globalThis as any).__generatedSourceExecuted).toBeUndefined();
    const request=JSON.parse(fetchMock.mock.calls[0][1]!.body as string);expect(request.store).toBe(false);expect(request.text.format.strict).toBe(true);
  });
  it('checks ownership and revision before requesting a paid generation',async()=>{
    const fetchMock=jest.spyOn(globalThis,'fetch');const {service,prisma,projects}=setup();
    prisma.store.findFirst.mockResolvedValueOnce(null);await expect(service.generate('other','s',input)).rejects.toThrow('Store not found');
    projects.state.mockResolvedValueOnce({revision:2});await expect(service.generate('m','s',input)).rejects.toThrow('cambió');expect(fetchMock).not.toHaveBeenCalled();
  });
  it('denies foreign assets before reading their bytes or contacting the model',async()=>{
    const fetchMock=jest.spyOn(globalThis,'fetch');const {service,uploads}=setup();await expect(service.generate('m','s',{...input,assetUrls:['/v1/uploads/abc-123.png']})).rejects.toThrow('no pertenece');expect(uploads.getBuffer).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
  });
  it('checks the combined asset budget before contacting the model',async()=>{
    const fetchMock=jest.spyOn(globalThis,'fetch');const {service,prisma,uploads}=setup();
    prisma.mediaAsset.findFirst.mockResolvedValue({id:'owned'});
    for(let i=0;i<4;i++)uploads.getBuffer.mockResolvedValueOnce(Buffer.alloc(1_800_000,i));
    await expect(service.generate('m','s',{...input,assetUrls:['/v1/uploads/a.png','/v1/uploads/b.png','/v1/uploads/c.png','/v1/uploads/d.png']})).rejects.toThrow('6 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps the previous revision when output is incomplete or invalid',async()=>{
    const mock=jest.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({status:'incomplete'}))).mockResolvedValueOnce(new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'invalid'}]}]})));
    const {service,projects}=setup();await expect(service.generate('m','s',input)).rejects.toThrow('no se completó');await expect(service.generate('m','s',input)).rejects.toThrow('archivos válidos');expect(projects.save).not.toHaveBeenCalled();expect(mock).toHaveBeenCalledTimes(2);
  });
  it('rejects missing commerce hooks, reserved paths and broken JavaScript',()=>{
    expect(()=>validateGeneratedSource(files())).not.toThrow();
    expect(()=>validateGeneratedSource([...files(),{path:'commerce.js',content:'bad'}])).toThrow('reservado');
    expect(()=>validateGeneratedSource(files().map(f=>f.path==='site.js'?{...f,content:'function {'}:f))).toThrow('sintaxis');
    expect(()=>validateGeneratedSource(files().filter(f=>f.path!=='index.html'))).toThrow('catálogo');
  });
});
