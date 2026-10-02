import { SOURCE_CONVERSATION_TIMEOUT_MS } from './source-conversation-failure';
import { SourceConversationService } from './source-conversation.service';
import { SOURCE_LOCATION_INSTRUCTIONS } from './source-location';
import { SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS } from './source-website-reference';
import { newSourceSetup } from './source-setup';
import { SourceRequestBudget } from './source-request-budget';

const photo = '/v1/uploads/abc.png';
const input = () => ({ instruction: 'Te comparto estas imágenes para el sitio.', buildNow: false, revision: 0,
  store: {name:'Café Aroma',logoUrl:null}, draft: newSourceSetup(),
  messages: [{role:'USER',content:'Te comparto estas imágenes para el sitio.',metadata:{assetUrls:[photo]}}], assetUrls:[photo] });
const reply = () => ({action:'reply',reply:'Parece una foto de café. ¿La usamos en la portada?',summary:'Cafetería. Pendiente: uso de la foto.',generationInstruction:'',imageUses:[{url:photo,role:'unknown',description:'Foto de café; uso pendiente.'}]});
function setup() {
  const prisma: any = {mediaAsset:{findMany:jest.fn().mockResolvedValue([{url:photo}])}};
  const uploads: any = {getBuffer:jest.fn().mockResolvedValue(Buffer.from('image-pixels')),contentTypeFor:jest.fn().mockReturnValue('image/png')};
  const config: any = {get:jest.fn((key:string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-sol')};
  return {service:new SourceConversationService(prisma,uploads,config),prisma,uploads,config};
}
const originalFetch = global.fetch;
let fetchMock: jest.Mock;
function respond(decision: unknown, status = 'completed') {
  fetchMock.mockResolvedValueOnce({ok:true,json:async () => ({status,output:[{content:[{type:'output_text',text:JSON.stringify(decision)}]}]})});
}
beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock; });
afterEach(() => { global.fetch = originalFetch; });

describe('Source conversation interpretation', () => {
  it('accepts owned MP4 with a text-only model without treating it as image pixels', async () => {
    const { service, prisma, uploads, config } = setup();
    const url = '/v1/uploads/abc.mp4';
    prisma.mediaAsset.findMany.mockResolvedValue([{ url }]); uploads.getBuffer.mockResolvedValue(Buffer.alloc(3_000_000));
    config.get.mockImplementation((key: string) => key === 'app.deepSeek.apiKey' ? 'test-key' : key === 'app.deepSeek.enabled');
    const use = { url, role: 'background', description: 'Video de portada' };
    respond({ ...reply(), imageUses: [use] });
    const result = await service.decide('merchant', { ...input(), model: 'deepseek-v4-flash', assetUrls: [url], messages: [{ role: 'USER', content: 'Pon este video en portada', metadata: { assetUrls: [url] } }] });
    expect(result.imageUses).toEqual([use]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content.some((part: any) => part.type === 'input_image')).toBe(false);
    expect(JSON.stringify(body)).toContain('frames and audio have not been inspected');
    expect(JSON.parse(body.input[0].content[2].text).availableVideoUrls).toEqual([url]);
  });
  it('includes inspected website evidence and its limitations in the actual model request', async () => {
    const { service } = setup();
    const websiteReferences = [{ url: 'https://example.com', status: 'inspected' as const, evidence: '{"css":".hero {color:red}"}' }];
    respond({ ...reply(), imageUses: [] });
    await service.decide('merchant', { ...input(), assetUrls: [], instruction: 'I want my website like https://example.com', draft: { ...newSourceSetup(), websiteReferences } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.instructions).toContain(SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS);
    expect(JSON.parse(body.input[0].content[2].text).websiteReferences).toEqual(websiteReferences);
  });
  it('shows the editor browser-check findings to the decision model', async () => {
    const { service } = setup();
    respond(reply());
    const browserReview = ['Imágenes rotas: 2 imágenes no pudieron cargarse', 'Catálogo: añade un producto con nombre y precio'];
    await service.decide('merchant', { ...input(), instruction: 'Corrige lo detectado', browserReview });
    const context = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).input[0].content[2].text);
    expect(context.browserReview).toEqual(browserReview);
  });
  it('sends rendered references as image inputs and never as base64 text or merchant artwork', async () => {
    const { service } = setup();
    const image = 'data:image/jpeg;base64,cGl4ZWxz';
    const websiteReferences = [{ url: 'https://example.com', status: 'inspected' as const, evidence: 'HTML evidence', rendered: { status: 'captured' as const, limitations: ['Static states only'], captures: [{ url: 'https://example.com', viewport: 'desktop' as const, width: 1280, height: 844, y: 0, pageHeight: 844, missingImages: 0, image }] } }];
    respond({ ...reply(), imageUses: [] });
    await service.decide('merchant', { ...input(), assetUrls: [], draft: { ...newSourceSetup(), websiteReferences } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content).toContainEqual({ type: 'input_image', image_url: image, detail: 'auto' });
    expect(body.input[0].content.filter((part: any) => part.type === 'input_text').map((part: any) => part.text).join('')).not.toContain('cGl4ZWxz');
    expect(JSON.parse(body.input[0].content[2].text).availableImageUrls).toEqual([]);
  });
  it('uses the selected DeepSeek model for chat with OpenAI disabled', async () => {
    const { service, config } = setup();
    config.get.mockImplementation((key: string) => key === 'app.deepSeek.apiKey' ? 'deepseek-test-key' : key === 'app.deepSeek.enabled');
    respond({ ...reply(), imageUses: [] });
    await service.decide('merchant', { ...input(), model: 'deepseek-v4-flash', assetUrls: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/responses');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.instructions).toContain('JSON');
    expect(body.instructions).toContain(SOURCE_LOCATION_INSTRUCTIONS);
    expect(body.prompt_cache_key).toBeUndefined();
  });
  it('requires vision for attached images before any paid call, then sends pixels to DeepSeek vision', async () => {
    const { service, config } = setup();
    config.get.mockImplementation((key: string) => key === 'app.deepSeek.apiKey' ? 'deepseek-test-key' : undefined);
    await expect(service.decide('merchant', { ...input(), model: 'deepseek-v4-pro' })).rejects.toThrow('Flash Vision');
    expect(fetchMock).not.toHaveBeenCalled();
    respond(reply());
    await service.decide('merchant', { ...input(), model: 'deepseek-v4-flash-vision-exp' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content.some((part: any) => part.image_url?.startsWith('data:image/png;base64,'))).toBe(true);
  });
  it('does not retry DeepSeek balance exhaustion', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 402, json: async () => ({ error: { message: 'Insufficient Balance' } }) });
    await expect(service.decide('merchant', { ...input(), assetUrls: [], model: 'deepseek-v4-flash' })).rejects.toThrow('agotó su saldo en DeepSeek');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('sends the existing site inventory even when there are no new attachments', async () => {
    const { service } = setup();
    respond({ ...reply(), imageUses: [] });
    const site = { pageCapabilities: [], pages: [{ path: 'index.html', title: 'QUEMADO', headings: ['Tortas'] }], bundledAssets: [{ path: 'assets/cake.webp', references: ['index.html'] }], visualAssets: [], motion: 'subtle' as const };
    await service.decide('merchant', { ...input(), assetUrls: [], site });
    const context = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).input[0].content[2].text);
    expect(context.existingSite).toEqual(site);
    expect(context.availableImageUrls).toEqual([]);
    expect(context.requestProfile).toContain('ordinary language');
  });
  it('checks the shared budget before making a conversation call', async () => {
    const { service } = setup();
    // Conversation runs on the cheap model now, so a whole credit comfortably
    // covers one turn. Spend the allowance first to reach the guard.
    const budget = new SourceRequestBudget(1);
    budget.reserve('gpt-5.6-luna', 1000, 8000);
    await expect(service.decide('merchant', { ...input(), budget })).rejects.toThrow('límite restante');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['credit_balance_exhausted', 'insufficient_quota'])('reports %s without retrying or treating it as an interpretation failure', async code => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { type: 'insufficient_quota', code, message: 'Private provider details' } }) });
    await expect(service.decide('merchant', input())).rejects.toThrow('agotó su saldo en OpenAI');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('still retries transient rate limits', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { code: 'rate_limit_exceeded' } }) });
    respond(reply());
    expect((await service.decide('merchant', input())).action).toBe('reply');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('sends actual image pixels with their original URL and conversational context', async () => {
    const {service,prisma} = setup(); respond(reply());
    const result = await service.decide('merchant',input());
    expect(result.action).toBe('reply');
    expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith({where:{merchantId:'merchant',url:{in:[photo]}},select:{url:true}});
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.input[0].content).toEqual(expect.arrayContaining([
      {type:'input_text',text:`Image URL: ${photo}`},
      {type:'input_image',image_url:`data:image/png;base64,${Buffer.from('image-pixels').toString('base64')}`,detail:'auto'},
    ]));
    expect(JSON.parse(body.input[0].content[2].text)).toMatchObject({currentRequest:input().instruction,buildNow:false,revision:0});
  });
  it('keeps confirmed brand values cacheable while messages and store details change', async () => {
    const { prisma, uploads, config } = setup();
    const brand = { data: { confirmed: [
      { field: 'voice', value: 'Warm and direct', evidence: 'Private evidence', source: 'merchant' },
      { field: 'accent', value: '#135724', evidence: '', source: 'merchant' },
    ], suggested: [{ field: 'voice', value: 'Unconfirmed suggestion' }] } };
    const service = new SourceConversationService(prisma, uploads, config, { get: jest.fn().mockResolvedValue(brand) } as any);
    respond(reply()); respond(reply()); respond(reply());
    await service.decide('merchant', { ...input(), storeId: 's1' });
    brand.data.confirmed.reverse();
    await service.decide('merchant', { ...input(), storeId: 's1', instruction: 'Make the product page clearer', revision: 1, store: { name: 'Updated café', logoUrl: null } });
    brand.data.confirmed.find(fact => fact.field === 'voice')!.value = 'Calm and precise';
    await service.decide('merchant', { ...input(), storeId: 's1' });
    const requests = fetchMock.mock.calls.map(call => JSON.parse(call[1].body));
    expect(requests[0].instructions).toBe(requests[1].instructions);
    // The cached prefix is the static instructions, so it survives brand edits,
    // a new message and a different store. Brand and context sit after it.
    expect(requests[0].input[0].content[0]).toEqual(requests[1].input[0].content[0]);
    expect(requests[0].input[0].content[0]).toEqual(requests[2].input[0].content[0]);
    expect(requests[0].input[0].content[0]).toEqual({ type: 'input_text', text: expect.any(String), prompt_cache_breakpoint: { mode: 'explicit' } });
    expect(requests[0].input[0].content[0].text).not.toContain('Warm and direct');
    expect(JSON.parse(requests[0].input[0].content[1].text)).toEqual({ confirmedBrand: { voice: 'Warm and direct', accent: '#135724' } });
    expect(requests[1].input[0].content[1]).not.toHaveProperty('prompt_cache_breakpoint');
    expect(requests[1].input[0].content[2].text).toContain('Make the product page clearer');
    expect(JSON.parse(requests[1].input[0].content[2].text)).not.toHaveProperty('confirmedBrand');
    expect(requests[2].input[0].content[1].text).toContain('Calm and precise');
    expect(requests[0].prompt_cache_options).toEqual({ mode: 'explicit', ttl: '30m' });

    // A different merchant reuses the same cached prefix and the same routing key.
    // Keying per store threw the cache away: most stores never generate twice
    // inside the 30-minute window, so their first call could never hit.
    respond(reply());
    await service.decide('other-merchant', { ...input(), storeId: 's1' });
    const other = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
    expect(other.input[0].content[0]).toEqual(requests[0].input[0].content[0]);
    expect(other.prompt_cache_key).toBe(requests[0].prompt_cache_key);
  });
  it('does not send unsupported explicit-cache options to an older configured conversation model', async () => {
    const { service, config } = setup();
    config.get.mockImplementation((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.5');
    respond(reply()); await service.decide('merchant', input());
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.prompt_cache_options).toBeUndefined();
    expect(request.input[0].content.every((block: any) => !block.prompt_cache_breakpoint)).toBe(true);
    expect(JSON.parse(request.input[0].content[1].text)).toEqual({ confirmedBrand: {} });
    expect(JSON.parse(request.input[0].content[2].text).currentRequest).toBe(input().instruction);
  });
  it('retains confirmed roles when the next response omits an already understood image', async () => {
    const {service,uploads} = setup();
    const request = input(); request.messages=[];
    request.draft.imageUses=[{url:photo,role:'product',description:'Café, no logo.'}];
    respond({...reply(),imageUses:[]});
    expect((await service.decide('merchant',request)).imageUses).toEqual(request.draft.imageUses);
    expect(uploads.getBuffer).not.toHaveBeenCalled();
  });
  it('inspects only three current pictures when memory contains 24 older image annotations', async () => {
    const {service,prisma,uploads} = setup();
    const selected = ['/v1/uploads/ba.png','/v1/uploads/bb.png','/v1/uploads/bc.png'];
    const request = input(); request.assetUrls=selected;
    request.messages[0].metadata.assetUrls=selected;
    request.draft.imageUses=Array.from({length:24}, (_, i) => ({url:`/v1/uploads/a${i.toString(16)}.png`,role:'product' as const,description:'Foto anterior.'}));
    prisma.mediaAsset.findMany.mockResolvedValue(selected.map(url => ({url})));
    respond({...reply(),imageUses:selected.map(url => ({url,role:'product',description:'Foto nueva.'}))});
    const decision = await service.decide('merchant',request);
    expect(decision.imageUses.map(use => use.url)).toEqual(selected);
    expect(prisma.mediaAsset.findMany.mock.calls[0][0].where.url.in).toEqual(selected);
    expect(uploads.getBuffer).toHaveBeenCalledTimes(3);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content.filter((item: any) => item.type === 'input_image')).toHaveLength(3);
    expect(JSON.parse(body.input[0].content[2].text).availableImageUrls).toEqual(selected);
  });
  it('filters obsolete image context and ignores only known historical annotations', async () => {
    const {service} = setup(); const request = input();
    const old = {url:'/v1/uploads/def.png',role:'product' as const,description:'Previous photo'};
    request.draft.imageUses=[old];
    request.messages.unshift({role:'USER',content:'Previous request',metadata:{assetUrls:[old.url]}});
    respond({...reply(),imageUses:[old,...reply().imageUses]});
    expect((await service.decide('merchant',request)).imageUses).toEqual(reply().imageUses);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const context = JSON.parse(body.input[0].content[2].text);
    expect(context.imageUses).toEqual([]);
    expect(context.recentConversation[0].assetUrls).toEqual([]);
    expect(body.text.format.schema.properties.imageUses.items.properties.url.enum).toEqual([photo]);
  });
  it('recovers once from incomplete output under the same timeout', async () => {
    const {service} = setup(); respond(reply(),'incomplete'); respond(reply());
    expect((await service.decide('merchant',input())).action).toBe('reply');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].signal).toBe(fetchMock.mock.calls[0][1].signal);
  });
  it('stops after two invalid replies and never accepts foreign image references', async () => {
    const {service} = setup();
    const invalid = {...reply(), imageUses:[{url:'/v1/uploads/def.png',role:'product',description:'Foreign'}]};
    respond(invalid); respond(invalid);
    await expect(service.decide('merchant',input())).rejects.toThrow('interpretar');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('accepts corrections to an image role instead of retaining an incorrect logo assignment', async () => {
    const {service} = setup(); const request = input();
    request.draft.imageUses=[{url:photo,role:'logo',description:'Anterior suposición.'}];
    respond({...reply(),imageUses:[{url:photo,role:'product',description:'El usuario aclara: producto.'}]});
    expect((await service.decide('merchant',request)).imageUses[0].role).toBe('product');
  });
  it('rejects foreign uploads before reading pixels or calling the model', async () => {
    const {service,prisma,uploads} = setup(); prisma.mediaAsset.findMany.mockResolvedValue([]);
    await expect(service.decide('merchant',input())).rejects.toThrow('este comercio');
    expect(uploads.getBuffer).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['https://example.com/image.png','/v1/uploads/../../secret.png'])('rejects unsafe asset URLs: %s', async url => {
    const {service,prisma,uploads} = setup();prisma.mediaAsset.findMany.mockResolvedValue([{url}]);
    await expect(service.decide('merchant',{...input(),assetUrls:[url]})).rejects.toThrow('este comercio');
    expect(uploads.getBuffer).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    {...reply(),imageUses:[{url:'/v1/uploads/def.png',role:'logo',description:'Invented URL'}]},
    {...reply(),imageUses:[{url:photo,role:'hero',description:'Unsupported role'}]},
    {...reply(),action:'generate',generationInstruction:''},
    {...reply(),reply:''},
    null,
  ])('fails closed on an invalid decision instead of generating', async decision => {
    const {service} = setup(); respond(decision); respond(decision);
    await expect(service.decide('merchant',input())).rejects.toThrow('interpretar');
  });
  it('distinguishes incomplete output from connection failures', async () => {
    const {service} = setup(); respond(reply(), 'incomplete'); respond(reply(), 'incomplete');
    await expect(service.decide('merchant', input())).rejects.toThrow('respuesta incompleta');
    fetchMock.mockRejectedValueOnce(new Error('connection reset')).mockRejectedValueOnce(new Error('connection reset'));
    await expect(service.decide('merchant', input())).rejects.toThrow('problema de conexión');
  });
  it('uses a 120-second deadline, reports timeout without a retry and records safe diagnostics', async () => {
    const { prisma, uploads, config } = setup();
    const record = jest.fn();
    const service = new SourceConversationService(prisma, uploads, config, undefined, { record } as any);
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchMock.mockImplementationOnce(async () => { controller.abort(); throw new Error('private provider details'); });
    try {
      await expect(service.decide('merchant', { ...input(), storeId: 's' })).rejects.toMatchObject({
        message: expect.stringContaining('120 segundos'), diagnostic: { code: 'timeout', attempt: 1, timeoutMs: 120000 },
      });
      expect(timeout).toHaveBeenCalledWith(SOURCE_CONVERSATION_TIMEOUT_MS);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith('s', 'conversation', expect.any(String), null, expect.any(Number), 'FAILED', expect.objectContaining({ code: 'timeout', timeoutMs: 120000 }));
      expect(JSON.stringify(record.mock.calls)).not.toContain('private provider details');
    } finally { timeout.mockRestore(); }
  });
  it('records HTTP status and request identifier without including provider error text', async () => {
    const { prisma, uploads, config } = setup(); const record = jest.fn();
    const service = new SourceConversationService(prisma, uploads, config, undefined, { record } as any);
    fetchMock.mockResolvedValue({ ok: false, status: 503, headers: new Headers({ 'x-request-id': 'req_diagnostic_123' }), json: async () => ({ error: { message: 'private provider body' } }) });
    await expect(service.decide('merchant', { ...input(), storeId: 's' })).rejects.toMatchObject({ diagnostic: { code: 'provider_http', httpStatus: 503, requestId: 'req_diagnostic_123' } });
    expect(record.mock.calls[1][6]).toMatchObject({ code: 'provider_http', attempt: 2, httpStatus: 503, requestId: 'req_diagnostic_123' });
  });
  it('does not pretend to understand when AI is disabled', async () => {
    const {service,config} = setup();config.get.mockReturnValue(false);
    await expect(service.decide('merchant',input())).rejects.toThrow('configurada');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports missing or oversized images without pretending to inspect them', async () => {
    const {service,uploads} = setup();uploads.getBuffer.mockResolvedValueOnce(null);
    await expect(service.decide('merchant',input())).rejects.toThrow('disponible');
    uploads.getBuffer.mockResolvedValueOnce(Buffer.alloc(2_000_001));
    await expect(service.decide('merchant',input())).rejects.toThrow('2 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('offers every Plantilla by id in the instructions and requires the template fields', async () => {
    const { service } = setup();
    respond({ ...reply(), startFrom: 'template', templates: [{ id: 'tostado', reason: 'Café de especialidad' }], chosenTemplateId: '', rework: false });
    const result = await service.decide('merchant', { ...input(), offeredTemplates: [{ id: 'miga', name: 'Miga' }] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.instructions).toContain('- tostado: Tostado');
    expect(body.text.format.schema.required).toEqual(expect.arrayContaining(['startFrom', 'templates', 'chosenTemplateId', 'rework']));
    expect(body.text.format.schema.properties.chosenTemplateId.enum).toEqual(expect.arrayContaining(['tostado', '']));
    expect(JSON.parse(body.input[0].content[2].text).offeredTemplates).toEqual([{ id: 'miga', name: 'Miga' }]);
    expect(result).toMatchObject({ startFrom: 'template', templates: [{ id: 'tostado', reason: 'Café de especialidad' }], chosenTemplateId: '', rework: false });
  });

  it('knows which Plantilla the store started from and its look, so a new style can be recognised as a rework', async () => {
    const { service } = setup();
    respond({ ...reply(), startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: true });
    const startedFrom = { id: 'pausa', name: 'Pausa', description: 'Estudio de pilates: tonos cálidos, arcos suaves', untouched: true };
    await service.decide('merchant', { ...input(), startedFromTemplate: startedFrom });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(body.input[0].content[2].text).startedFromTemplate).toEqual(startedFrom);
    expect(body.instructions).toContain('startedFromTemplate');
  });

  it('defaults the template fields when a provider omits or garbles them', async () => {
    const { service } = setup();
    respond({ ...reply(), startFrom: 'maybe', templates: 'tostado', rework: 'yes' });
    expect(await service.decide('merchant', input())).toMatchObject({ startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: false });
  });
});


it('inspects the owned photo and explicitly delegates a draft without fabricated selling facts', async () => {
  const {service, uploads} = setup();
  respond({action:'generate',reply:'',summary:'Foto de café; precio pendiente.',generationInstruction:'Crear borrador con la foto.',imageUses:[{url:photo,role:'product',description:'Café'}]});
  const result = await service.decide('merchant',{...input(),productPhoto:true});
  expect(result.action).toBe('generate'); expect(uploads.getBuffer).toHaveBeenCalledWith('abc.png');
  const body=JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(JSON.parse(body.input[0].content[2].text).productPhoto).toBe(true);
  expect(body.input[0].content.some((part:any)=>part.type==='input_image')).toBe(true);
  expect(body.instructions).toContain('Do not ask the two discovery questions');
  expect(body.instructions).toContain('No invented prices, stock');
});

it('stops on a ChatGPT authorization outage and preserves its safe diagnostic', async () => {
  const { service, config } = setup();
  config.get.mockImplementation((key:string)=>key==='app.chatgptPlan'?{url:'http://127.0.0.1:1234/v1/responses',secret:'local-test'}:key==='app.environment'?'development':key==='app.openAi.apiKey'?'unused':key==='app.openAi.enabled'?true:'gpt-5.6-sol');
  fetchMock.mockResolvedValue({ok:false,status:503,headers:new Headers(),json:async()=>({error:{code:'chatgpt_authentication_unavailable',upstreamStatus:500,message:'private upstream details'}})});
  await expect(service.decide('merchant',input())).rejects.toMatchObject({diagnostic:{code:'provider_http',providerCode:'chatgpt_authentication_unavailable',upstreamStatus:500}});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
