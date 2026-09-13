import { SourceConversationFailure } from './source-conversation-failure';
import { SourceChatService } from './source-chat.service';
import { SourceProviderQuotaException } from './source-provider-error';
import * as websiteReference from './source-website-reference';
function setup(messages: any[] = []) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Café Aroma', logoUrl: '/v1/uploads/logo.png', _count: { paymentLinks: 3 } }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({data}) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }) },
  };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { businessType: 'Café Aroma', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' } } }) };
  const generation: any = { generate: jest.fn().mockResolvedValue({ revision: 1, label: 'Carta editorial' }) };
  const dialogue: any = { decide: jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Café de especialidad, estilo cálido y editorial.', generationInstruction: request.instruction, imageUses: [] }) };
  return { service: new SourceChatService(prisma, projects, generation, dialogue), prisma, projects, generation, dialogue, messages };
}
const request = { revision: 1, instruction: 'Crea una carta para mi cafetería, clara y cálida', assetUrls: [] };
it('completes a pending product request with a stock reply and clears it after saving',async()=>{
  const {service,dialogue,generation,messages}=setup();
  dialogue.decide.mockResolvedValueOnce({action:'reply',reply:'¿Cuántas unidades hay de cada combinación?',summary:'Camisa Bs 120, Negro y Blanco, M y L.',generationInstruction:'',imageUses:[]});
  const instruction='Crea el producto Camisa Bs 120, colores Negro y Blanco, tallas M y L';
  await service.send('m','s',{...request,instruction});
  expect(generation.generate).not.toHaveBeenCalled();
  await service.send('m','s',{...request,instruction:'cinco de cada una'});
  expect(generation.generate.mock.calls[0][2].instruction.split('Pedido actual del comercio:').at(-1)).toContain(instruction);
  expect(messages.at(-1).metadata.sourceSetup.pendingCatalogRequest).toBeUndefined();
  await service.send('m','s',{...request,instruction:'Cambia el fondo'});
  expect(generation.generate.mock.calls[1][2].instruction.split('Pedido actual del comercio:').at(-1)).not.toContain(instruction);
});
it('does not silently discard all uploads as references when the merchant says to use the pictures', async () => {
  const { service, dialogue, generation, messages } = setup();
  const photo = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
  dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary:'Campaign image; reference only.',generationInstruction:'Build with no images.',imageUses:[{url:photo,role:'reference',description:'Do not display'}]});
  await service.send('m','s',{...request,instruction:'use these pictures',assetUrls:[photo]});
  expect(generation.generate.mock.calls[0][4]).toEqual([expect.objectContaining({url:photo,role:'business'})]);
  expect(messages.at(-1).metadata.sourceSetup.imageUses[0].role).toBe('business');
  expect(generation.generate.mock.calls[0][2].instruction).toContain('Queda anulada');
});
describe('Website design references in chat', () => {
  afterEach(() => jest.restoreAllMocks());
  const reference = { url: 'https://example.com', status: 'inspected' as const, evidence: '{"outline":["header","section hero"],"css":".hero {gap:32px}"}' };
  it('inspects a reference before interpretation, forwards evidence to generation and remembers it on follow-ups', async () => {
    const inspect = jest.spyOn(websiteReference, 'inspectSourceWebsite').mockResolvedValue(reference);
    const { service, dialogue, generation, messages } = setup();
    const instruction = 'I want my website like this one https://example.com';
    await service.send('m', 's', { ...request, instruction });
    expect(inspect).toHaveBeenCalledWith(reference.url);
    expect(dialogue.decide.mock.calls[0][1].draft.websiteReferences).toEqual([reference]);
    expect(generation.generate.mock.calls[0][2].instruction).toContain(JSON.stringify([reference]));
    expect(messages.at(-1).metadata.sourceSetup.websiteReferences).toEqual([reference]);
    await service.send('m', 's', { ...request, instruction: 'Cambia solo el título' });
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(dialogue.decide.mock.calls[1][1].draft.websiteReferences).toEqual([reference]);
  });
  it('retains reference evidence across discovery replies and an identical failed-generation retry', async () => {
    const inspect = jest.spyOn(websiteReference, 'inspectSourceWebsite').mockResolvedValue(reference);
    const { service, projects, generation, dialogue } = setup();
    projects.current.mockResolvedValue({ revision: 0 });
    const initial = { ...request, revision: 0, instruction: 'Quiero mi sitio como https://example.com' };
    await service.send('m', 's', initial);
    await service.send('m', 's', { ...initial, instruction: 'Vendo café a vecinos' });
    generation.generate.mockRejectedValueOnce(new Error('generation failed'));
    const build = { ...initial, instruction: 'Usa rojo y crema' };
    await expect(service.send('m', 's', build)).rejects.toThrow('generation failed');
    await service.send('m', 's', build);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(dialogue.decide).toHaveBeenCalledTimes(3);
    expect(generation.generate.mock.calls[1][2].instruction).toContain(JSON.stringify([reference]));
  });
  it('asks for a screenshot instead of generating a claimed match after a failed inspection', async () => {
    jest.spyOn(websiteReference, 'inspectSourceWebsite').mockResolvedValue({ ...reference, status: 'unavailable', evidence: 'Unavailable' });
    const { service, generation } = setup();
    const result = await service.send('m', 's', { ...request, instruction: 'I want my website like https://example.com' });
    expect(result.assistantMessage.content).toContain('captura');
    expect(generation.generate).not.toHaveBeenCalled();
  });
});
describe('Source chat in the existing store conversation infrastructure', () => {
  it('ignores retired theme selections through discovery and generation', async () => {
    const { service, projects, dialogue, generation, messages } = setup([{ role: 'USER', content: 'Mi negocio', metadata: { revision: 0, themeId: 'sunny-market' } }]);
    projects.current.mockResolvedValue({ revision: 0 });
    dialogue.decide.mockResolvedValueOnce({ action: 'reply', reply: '¿Qué vendes?', summary: 'Tema elegido.', generationInstruction: '', imageUses: [] });
    const initial = { ...request, revision: 0, themeId: 'print-club' as const };
    await service.send('m', 's', initial);
    expect(dialogue.decide.mock.calls[0][1]).not.toHaveProperty('theme');
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Vendo cuadernos' });
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Genera la tienda usando mis fotos' });
    expect(generation.generate.mock.calls[0][2]).not.toHaveProperty('themeId');
    expect(messages.filter(message => message.role === 'USER').slice(1).every(message => !('themeId' in message.metadata))).toBe(true);
  });
  it('passes pasted location HTML intact to interpretation and generation even when the summary omits its URL', async () => {
    const { service, generation, dialogue } = setup();
    const instruction = 'Añade esta ubicación al pie: <iframe src="https://www.google.com/maps/embed?pb=!1m18!2d-68.12!3d-16.5&amp;hl=es" width="600" height="450"></iframe>';
    dialogue.decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 'Café con ubicación.', generationInstruction: 'Añade el mapa al pie sin cambiar el catálogo.', imageUses: [] });
    const result = await service.send('m', 's', { ...request, instruction });
    expect(dialogue.decide.mock.calls[0][1].instruction).toBe(instruction);
    expect(generation.generate.mock.calls[0][2].instruction).toContain(instruction);
    expect(result.userMessage.content).toBe(instruction);
    expect(result).toHaveProperty('revision');
  });
  it('passes revision-scoped browser evidence to generation without changing the merchant message or declaring visual success', async () => {
    const { service, generation } = setup();
    const browserReview = ['Escritorio · index.html · Ancho de la página: 1400 px en 1280 px'];
    const result = await service.send('m', 's', { ...request, browserReview });
    expect(generation.generate.mock.calls[0][2].instruction).toContain(JSON.stringify(browserReview));
    expect(generation.generate.mock.calls[0][2].instruction).toContain('atiende solo las relacionadas con el pedido actual');
    expect(result.userMessage.content).toBe(request.instruction);
    expect(result.assistantMessage.content).toContain('Guardé los cambios de tu tienda');
    expect(result.assistantMessage.content).toContain('comprobará');
  });
  it('passes the selection to chat and generation and reinterprets after switching providers', async () => {
    const { service, dialogue, generation } = setup();
    generation.generate.mockRejectedValueOnce(new Error('source validation failed'));
    await expect(service.send('m', 's', request)).rejects.toThrow('source validation failed');
    await service.send('m', 's', { ...request, model: 'deepseek-v4-flash' });
    expect(dialogue.decide).toHaveBeenCalledTimes(2);
    expect(dialogue.decide.mock.calls[1][1].model).toBe('deepseek-v4-flash');
    expect(generation.generate.mock.calls[1][2].model).toBe('deepseek-v4-flash');
  });
  it('gives interpretation saved page/assets and shares its budget with generation', async () => {
    const { service, projects, dialogue, generation } = setup();
    projects.version.mockResolvedValue({ snapshot: { files: [
      { path: 'index.html', content: '<h1>QUEMADO</h1><img src="assets/cake.webp">' },
      { path: 'assets/cake.webp', content: 'pixels', encoding: 'base64' },
    ] } });
    await service.send('m', 's', request);
    const context = dialogue.decide.mock.calls[0][1];
    expect(context.assetUrls).toEqual([]);
    expect(context.site.bundledAssets).toEqual([{ path: 'assets/cake.webp', references: ['index.html'] }]);
    expect(context.budget).toBe(generation.generate.mock.calls[0][3]);
  });
  it('reuses a validated decision on an immediate identical retry, but reinterprets changed requests', async () => {
    const { service, dialogue, generation } = setup();
    generation.generate.mockRejectedValueOnce(new Error('source validation failed'));
    await expect(service.send('m', 's', request)).rejects.toThrow('source validation failed');
    await service.send('m', 's', request);
    expect(dialogue.decide).toHaveBeenCalledTimes(1);
    expect(generation.generate).toHaveBeenCalledTimes(2);
    await service.send('m', 's', { ...request, instruction: 'Cambia el título' });
    expect(dialogue.decide).toHaveBeenCalledTimes(2);
  });
  it('preserves the provider balance explanation in the conversation and API error', async () => {
    const { service, dialogue, generation, messages } = setup();
    dialogue.decide.mockRejectedValueOnce(new SourceProviderQuotaException());
    await expect(service.send('m', 's', request)).rejects.toThrow('agotó su saldo en OpenAI');
    expect(generation.generate).not.toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({ role: 'ASSISTANT', metadata: { failed: true } });
    expect(messages.at(-1).content).toContain('agotó su saldo en OpenAI');
    expect(messages.at(-1).content).not.toContain('interpretar');
  });
  it('persists requests and replies with a source revision link', async () => {
    const { service, messages, generation } = setup();
    const result = await service.send('m','s',request);
    expect(result.assistantMessage.metadata).toMatchObject({ sourceRevision: 1 });
    expect(messages.map(m => [m.channel, m.role])).toEqual([['source','USER'],['source','ASSISTANT']]);
    expect(generation.generate.mock.calls[0][2].brief.businessType).toBe('Café Aroma');
    expect((await service.conversation('m','s')).messages).toEqual(messages);
  });
  it('toggles the optional form from chat without an AI generation', async () => {
    const {service,projects,generation}=setup();
    projects.setContactForm=jest.fn().mockResolvedValue({revision:2,label:'Formulario desactivado'});
    const result=await service.send('m','s',{...request,instruction:'Desactiva el formulario de contacto'});
    expect(projects.setContactForm).toHaveBeenCalledWith('m','s',1,false);
    expect(result.assistantMessage.content).toContain('Desactivé');
    expect(generation.generate).not.toHaveBeenCalled();
  });
  it('rejects foreign stores and stale requests before saving messages or generating', async () => {
    const { service, prisma, projects, generation } = setup();
    prisma.store.findFirst.mockResolvedValueOnce(null);await expect(service.send('other','s',request)).rejects.toThrow('Store not found');
    projects.current.mockResolvedValueOnce({revision:2});await expect(service.send('m','s',request)).rejects.toThrow('otra sesión');
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();expect(generation.generate).not.toHaveBeenCalled();
  });
  it('clarifies vague edits without generating', async () => {
    const { service, generation, dialogue } = setup();
    dialogue.decide.mockResolvedValueOnce({ action: 'reply', reply: '¿Quieres mejorar la portada o la lectura del catálogo?', summary: 'Pendiente: qué mejorar.', generationInstruction: '', imageUses: [] });
    const result = await service.send('m','s',{...request,instruction:'mejora'});
    expect(result.assistantMessage.content).toContain('portada'); expect(generation.generate).not.toHaveBeenCalled();
  });
  it('keeps the request and records a failed reply when generation fails', async () => {
    const { service, generation, messages } = setup();generation.generate.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.send('m','s',request)).rejects.toThrow('unavailable');
    expect(messages).toHaveLength(2);expect(messages[1].metadata.failed).toBe(true);
  });
  it('carries clarification context and attachments into the generation', async () => {
    const { service, generation, prisma, dialogue } = setup([{role:'USER',content:'Crea mi café'}, {role:'ASSISTANT',content:'¿Qué estilo?',metadata:{clarification:{},assetUrls:['/v1/uploads/a.png']}}]);
    await service.send('m','s',{...request,instruction:'Portada editorial'});
    expect(generation.generate.mock.calls[0][2]).toMatchObject({assetUrls:['/v1/uploads/a.png']});
    expect(dialogue.decide.mock.calls[0][1].messages).toEqual(expect.arrayContaining([expect.objectContaining({ content: 'Crea mi café' })]));
    expect(prisma.storeAgentThread.findUnique).toHaveBeenCalledWith(expect.objectContaining({include:{messages:{where:{channel:'source'},orderBy:{createdAt:'desc'},take:100}}}));
  });
});


describe('Conversational first-site setup', () => {
  it('preserves legacy brand facts while requiring discovery before generation', async () => {
    const { service, projects, dialogue, generation } = setup([{ role: 'ASSISTANT', content: '¿A quién vendes?', metadata: {sourceSetup:{step:'audience',answers:{brand:'Crema y verde'},assetUrls:[]}} }]);
    projects.current.mockResolvedValue({revision:0});
    expect((await service.conversation('m','s')).setup).toMatchObject({step:'conversation',options:[]});
    await service.send('m','s',{revision:0,instruction:'Crea el sitio ahora',setupStep:'logo',setupAction:'generate'});
    expect(dialogue.decide.mock.calls[0][1]).toMatchObject({buildNow:true,draft:{answers:{brand:'Crema y verde'}}});
    expect(generation.generate).not.toHaveBeenCalled();
  });
  it('asks again on unrelated replies without assigning them to business fields', async () => {
    const { service, projects, dialogue, generation } = setup(); projects.current.mockResolvedValue({revision:0});
    const summary = 'Cafetería. Pendiente: fotos de productos; son opcionales.';
    dialogue.decide.mockResolvedValueOnce({action:'reply',reply:'¿Tienes fotos del café? También puedo empezar sin ellas.',summary,generationInstruction:'',imageUses:[]});
    await service.send('m','s',{revision:0,instruction:'Tengo una cafetería'});
    dialogue.decide.mockResolvedValueOnce({action:'reply',reply:'No entendí si quieres usar fotos del café o empezar sin ellas.',summary,generationInstruction:'',imageUses:[]});
    await service.send('m','s',{revision:0,instruction:'la luna es de queso'});
    expect(dialogue.decide.mock.calls[1][1].draft.answers).toEqual({context:summary});
    const restored = await service.conversation('m','s');
    expect(restored.setup?.prompt).toContain('No entendí');
    expect((restored.messages.at(-1)?.metadata as any).sourceSetup.answers).toEqual({context:summary});
    expect(generation.generate).not.toHaveBeenCalled();
  });
  it('preserves image corrections through reload, optional skips and failed generation retries', async () => {
    const { service, projects, dialogue, generation } = setup(); projects.current.mockResolvedValue({revision:0});
    const photo = '/v1/uploads/abc.png';
    const imageUses = [{url:photo,role:'product',description:'Bolsa de café, no es el logo.'}];
    const summary = 'Café Aroma. Sin logo: usar el nombre. Foto de café para la portada. Omitir preguntas de marca.';
    dialogue.decide.mockResolvedValueOnce({action:'reply',reply:'Entendido, es una foto de café. ¿La usamos en la portada?',summary,generationInstruction:'',imageUses});
    await service.send('m','s',{revision:0,instruction:'No es mi logo, es el café que vendo',assetUrls:[photo]});
    expect((await service.conversation('m','s')).setup?.prompt).toContain('foto de café');
    dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary,generationInstruction:'Crear el sitio usando la foto del café en la portada y un nombre de texto.',imageUses});
    await service.send('m','s',{revision:0,instruction:'Sí, usa esa foto en la portada'});
    dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary,generationInstruction:'Crear el sitio usando la foto del café en la portada y un nombre de texto.',imageUses});
    generation.generate.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.send('m','s',{revision:0,instruction:'Sí, empieza sin más preguntas',model:'gpt-5.6-luna',maxCredits:8})).rejects.toThrow('timeout');
    await service.send('m','s',{revision:0,instruction:'Inténtalo de nuevo',model:'gpt-5.6-luna',maxCredits:8});
    expect(dialogue.decide.mock.calls[2][1].draft).toMatchObject({assetUrls:[photo],imageUses,answers:{context:summary}});
    expect(generation.generate.mock.calls[1][2]).toMatchObject({assetUrls:[photo],model:'gpt-5.6-luna',maxCredits:8});
    expect(generation.generate.mock.calls[1][2].instruction).toContain('no es el logo');
  });
  it('keeps clarifying an existing-site edit if the next answer is still unclear', async () => {
    const { service, dialogue, generation } = setup();
    dialogue.decide.mockResolvedValue({action:'reply',reply:'¿Qué parte del sitio quieres cambiar?',summary:'Pendiente: cambio solicitado.',generationInstruction:'',imageUses:[]});
    await service.send('m','s',{...request,instruction:'mejora'});
    await service.send('m','s',{...request,instruction:'no sé qué dices'});
    expect(dialogue.decide).toHaveBeenCalledTimes(2); expect(generation.generate).not.toHaveBeenCalled();
  });
  it('retains context and attachments when interpretation fails', async () => {
    const { service, projects, dialogue, generation } = setup(); projects.current.mockResolvedValue({revision:0});
    dialogue.decide.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.send('m','s',{revision:0,instruction:'Mira esta imagen',assetUrls:['/v1/uploads/abc.png']})).rejects.toThrow('unavailable');
    expect(generation.generate).not.toHaveBeenCalled();
    await service.send('m','s',{revision:0,instruction:'Inténtalo de nuevo'});
    expect(dialogue.decide.mock.calls[1][1].assetUrls).toEqual(['/v1/uploads/abc.png']);
  });
  it('blocks quick creation until two question turns, then forwards generation preferences', async () => {
    const { service, projects, generation, dialogue } = setup(); projects.current.mockResolvedValue({revision:0});
    await service.send('m','s',{...request,revision:0,setupAction:'quick',model:'gpt-5.6-luna',maxCredits:8});
    expect(dialogue.decide.mock.calls[0][1].buildNow).toBe(true);
    expect(generation.generate).not.toHaveBeenCalled();
    await service.send('m','s',{revision:0,instruction:'Vendo café a vecinos',setupAction:'generate'});
    expect(generation.generate).not.toHaveBeenCalled();
    expect((await service.conversation('m','s')).setup?.prompt).toContain('estilo');
    dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary:'Café de barrio, tonos crema.',generationInstruction:'Crear la tienda de café.',imageUses:[]});
    await service.send('m','s',{revision:0,instruction:'Tonos crema, crea el sitio',model:'gpt-5.6-luna',maxCredits:8});
    expect(generation.generate.mock.calls[0][2]).toMatchObject({model:'gpt-5.6-luna',maxCredits:8});
  });
  it('restarts without losing the visible conversation or requiring AI', async () => {
    const { service, projects, dialogue, messages } = setup(); projects.current.mockResolvedValue({revision:0});
    await service.send('m','s',{revision:0,instruction:'Empecemos de nuevo',setupAction:'restart'});
    expect((await service.conversation('m','s')).setup?.step).toBe('conversation');
    expect(messages).toHaveLength(2); expect(dialogue.decide).not.toHaveBeenCalled();
  });
});

describe('Image batches for existing-site edits', () => {
  const images = (count: number, prefix: string) => Array.from({length:count}, (_, i) => `/v1/uploads/${prefix}${i}.png`);
  const selected = images(3, 'b');
  it('uses three selected pictures despite more than 24 historical uploads and a legacy setup draft', async () => {
    const old = images(24, 'a');
    const {service,dialogue,generation} = setup([
      {role:'ASSISTANT',content:'Detalles iniciales',metadata:{sourceSetup:{step:'review',answers:{brand:'Cálido'},assetUrls:old}}},
      {role:'ASSISTANT',content:'Sitio creado',metadata:{sourceRevision:1}},
      ...Array.from({length:10}, (_, i) => ({role:'USER',content:'Añade estas fotos',metadata:{assetUrls:images(3,`c${i}`)}})),
    ]);
    await service.send('m','s',{...request,instruction:'Reforma el sitio con estas fotos',assetUrls:selected});
    expect(dialogue.decide.mock.calls[0][1].assetUrls).toEqual(selected);
    expect(generation.generate.mock.calls[0][2].assetUrls).toEqual(selected);
    expect(dialogue.decide.mock.calls[0][1].draft.answers.brand).toBe('Cálido');
  });
  it('repairs an accumulated failed draft on a text-only retry using the latest actual upload batch', async () => {
    const {service,dialogue,generation} = setup([
      {role:'ASSISTANT',content:'Sitio creado',metadata:{sourceRevision:1}},
      {role:'USER',content:'Añade estas fotos',metadata:{assetUrls:images(24,'a')}},
      {role:'USER',content:'Usa estas tres',metadata:{assetUrls:selected}},
      {role:'ASSISTANT',content:'Falló',metadata:{failed:true,sourceSetup:{step:'conversation',answers:{context:'Café'},assetUrls:[...images(24,'a'),...selected],imageUses:[]}}},
    ]);
    await service.send('m','s',{...request,instruction:'Inténtalo de nuevo'});
    expect(dialogue.decide.mock.calls[0][1].assetUrls).toEqual(selected);
    expect(generation.generate.mock.calls[0][2].assetUrls).toEqual(selected);
  });
  it('does not resubmit legacy uploads that were already used in a completed revision', async () => {
    const old = images(24,'a');
    const {service,dialogue,generation} = setup([
      {role:'USER',content:'Crea el sitio',metadata:{assetUrls:old}},
      {role:'ASSISTANT',content:'Detalles',metadata:{sourceSetup:{step:'review',answers:{brand:'Editorial'},assetUrls:old}}},
      {role:'ASSISTANT',content:'Sitio creado',metadata:{sourceRevision:1}},
    ]);
    await service.send('m','s',{...request,instruction:'Cambia el color del título'});
    expect(dialogue.decide.mock.calls[0][1].assetUrls).toEqual([]);
    expect(generation.generate.mock.calls[0][2].assetUrls).toEqual([]);
  });
  it('uses the replacement batch throughout a failed edit and a subsequent text-only retry', async () => {
    const {service,dialogue,generation} = setup();
    dialogue.decide.mockResolvedValueOnce({action:'reply',reply:'¿Dónde usamos las fotos?',summary:'Pendiente: ubicación.',generationInstruction:'',imageUses:[]});
    await service.send('m','s',{...request,assetUrls:images(24,'a')});
    generation.generate.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.send('m','s',{...request,assetUrls:selected})).rejects.toThrow('timeout');
    await service.send('m','s',{...request,instruction:'Inténtalo de nuevo'});
    expect(generation.generate.mock.calls.map((call: any[]) => call[2].assetUrls)).toEqual([selected,selected]);
  });
  it('still combines a logo and later product photos before the first site is created', async () => {
    const {service,projects,dialogue,generation} = setup(); projects.current.mockResolvedValue({revision:0});
    dialogue.decide.mockResolvedValueOnce({action:'reply',reply:'¿Tienes fotos de productos?',summary:'Logo recibido.',generationInstruction:'',imageUses:[]});
    await service.send('m','s',{revision:0,instruction:'Este es mi logo',assetUrls:['/v1/uploads/a.png']});
    await service.send('m','s',{revision:0,instruction:'Estas son las fotos, crea el sitio',assetUrls:selected});
    dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary:'Café con fotos.',generationInstruction:'Crear tienda',imageUses:[]});
    await service.send('m','s',{revision:0,instruction:'Usa crema y verde'});
    expect(generation.generate.mock.calls[0][2].assetUrls).toEqual(['/v1/uploads/a.png',...selected]);
  });
  it('rejects an actual oversized selected batch before persisting or generating', async () => {
    const {service,prisma,dialogue,generation} = setup();
    await expect(service.send('m','s',{...request,assetUrls:images(25,'a')})).rejects.toThrow('25 imágenes');
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
    expect(dialogue.decide).not.toHaveBeenCalled(); expect(generation.generate).not.toHaveBeenCalled();
  });
});

it('keeps timeout cause and attachments in one saved failure message', async () => {
  const messages: any[] = []; const { service, dialogue, generation } = setup(messages);
  dialogue.decide.mockRejectedValue(new SourceConversationFailure({ code: 'timeout', attempt: 1, timeoutMs: 120000 }));
  const assetUrls = ['/v1/uploads/abc.mp4'];
  await expect(service.send('m', 's', { revision: 1, instruction: 'Usa este video', assetUrls })).rejects.toMatchObject({ status: 504 });
  expect(generation.generate).not.toHaveBeenCalled();
  const failure = messages.at(-1);
  expect(failure.content).toContain('120 segundos');
  expect(failure.content).not.toContain('interpretar');
  expect(failure.content.match(/quedaron guardados/g)).toHaveLength(1);
  expect(failure.metadata).toMatchObject({ failed: true, failure: { code: 'timeout', stage: 'conversation' }, sourceSetup: { assetUrls } });
});


describe('Store from a single product photo', () => {
  const photo = '/v1/uploads/abc.png';
  it('generates the first draft without discovery and forwards only the chosen photo', async () => {
    const { service, projects, generation, dialogue } = setup([{role:'ASSISTANT', metadata:{sourceSetup:{discoveryReplies:0,step:'conversation',answers:{},assetUrls:['/v1/uploads/old.png'],imageUses:[]}}}]);
    projects.current.mockResolvedValue({revision:0});
    dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary:'Diseño desde una foto. Precio pendiente.',generationInstruction:'Diseñar con la foto, sin inventar precios ni crear productos.',imageUses:[{url:photo,role:'product',description:'Producto fotografiado'}]});
    await service.send('m','s',{revision:0,instruction:'Crea mi tienda desde esta foto.',setupAction:'product-photo',assetUrls:[photo],maxCredits:8});
    expect(dialogue.decide.mock.calls[0][1]).toMatchObject({productPhoto:true,assetUrls:[photo]});
    expect(generation.generate.mock.calls[0][2]).toMatchObject({revision:0,assetUrls:[photo],maxCredits:8});
    expect(generation.generate.mock.calls[0][2].instruction).toContain('sin inventar precios');
  });
  it.each([{urls:[]}, {urls:['/v1/uploads/abc.mp4']}, {urls:[photo,photo]}])('rejects invalid photo batches before saving messages: $urls', async ({urls}) => {
    const {service,projects,prisma,dialogue,generation} = setup(); projects.current.mockResolvedValue({revision:0});
    await expect(service.send('m','s',{revision:0,instruction:'Crear tienda',setupAction:'product-photo',assetUrls:urls as string[]})).rejects.toThrow('Elige una sola foto');
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled(); expect(dialogue.decide).not.toHaveBeenCalled(); expect(generation.generate).not.toHaveBeenCalled();
  });
  it('keeps an ambiguous photo as a clarification instead of forcing generation', async () => {
    const { service, projects, dialogue, generation } = setup(); projects.current.mockResolvedValue({revision:0});
    dialogue.decide.mockResolvedValue({action:'reply',reply:'No distingo el producto. ¿Puedes subir una foto más clara?',summary:'Foto poco clara.',generationInstruction:'',imageUses:[{url:photo,role:'unknown',description:''}]});
    const result = await service.send('m','s',{revision:0,instruction:'Crear tienda',setupAction:'product-photo',assetUrls:[photo]});
    expect(result.assistantMessage.content).toContain('foto más clara'); expect(generation.generate).not.toHaveBeenCalled();
  });
});
