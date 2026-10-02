import { rankDirections } from './source-directions';
import { agentDraftPreviews } from './agent/agent-draft-previews';
import { SourceConversationFailure } from './source-conversation-failure';
import { SourceChatService, referenceOnlyNotice, TEMPLATE_QUESTION, TEMPLATE_ADAPTATION_MAX_CREDITS, TEMPLATE_UNIQUE_OFFER, TEMPLATE_REWORK_BRIEF } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';
import { sourceRequestProfile } from './source-request-profile';
import { sourceRedesignRequested } from './source-context';
import { sourceGenerationPlan } from './source-generation-policy';
import { SourceProviderQuotaException } from './source-provider-error';
import { BadGatewayException } from '@nestjs/common';
import * as websiteReference from './source-website-reference';
function setup(messages: any[] = []) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Café Aroma', logoUrl: '/v1/uploads/logo.png', _count: { paymentLinks: 3 } }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({data}) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }) },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
  };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { businessType: 'Café Aroma', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' } } }) };
  const generation: any = { generate: jest.fn().mockResolvedValue({ revision: 1, label: 'Carta editorial' }), newBudget: jest.fn((maxCredits?: number) => new SourceRequestBudget(maxCredits)) };
  // Existing first-site tests exercise the from-scratch path; the template path sets startFrom explicitly.
  const dialogue: any = { decide: jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Café de especialidad, estilo cálido y editorial.', generationInstruction: request.instruction, imageUses: [], startFrom: 'scratch' }) };
  const templates: any = { apply: jest.fn().mockResolvedValue({ revision: 1, label: 'Plantilla: Tostado' }) };
  return { service: new SourceChatService(prisma, projects, generation, dialogue, templates), prisma, projects, generation, dialogue, templates, messages };
}
const request = { revision: 1, instruction: 'Crea una carta para mi cafetería, clara y cálida', assetUrls: [] };
it('takes the run budget from the generation service, so a run that costs nothing is not capped', async () => {
  const { service, generation } = setup();
  const free = new SourceRequestBudget(1, true);
  generation.newBudget.mockReturnValue(free);
  await service.send('m', 's', { ...request, maxCredits: 200 });
  expect(generation.newBudget).toHaveBeenCalledWith(200);
  expect(generation.generate.mock.calls[0][3]).toBe(free);
});
it('retains the selected website purpose across discovery and sends it into the first generation', async () => {
  const { service, projects, dialogue, generation } = setup();
  projects.current.mockResolvedValue({ revision: 0 });
  await service.send('m', 's', { ...request, revision: 0, sitePurpose: 'portfolio', instruction: 'Un portafolio de arquitectura' });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Para clientes de proyectos residenciales' });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Usa las fotos y una composición cinematográfica' });
  expect(dialogue.decide.mock.calls.every((call: any[]) => call[1].draft.sitePurpose === 'portfolio')).toBe(true);
  expect(generation.generate.mock.calls[0][2].brief).toMatchObject({ sitePurpose: 'portfolio', primaryAction: 'Explorar proyectos y contactar' });
});

it('keeps the saved presentation purpose when an older client omits the selector', async () => {
  const { service, projects, generation } = setup();
  projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'Estudio', audience: 'Clientes', primaryAction: 'Consultar', visualDirection: 'Minimal', sitePurpose: 'service' } } });
  await service.send('m', 's', { ...request, instruction: 'Cambia el título' });
  expect(generation.generate.mock.calls[0][2].brief.sitePurpose).toBe('service');
});
it('cannot change an existing shop into a presentation site through a local edit selector', async () => {
  const { service, dialogue, generation } = setup();
  await expect(service.send('m', 's', { ...request, sitePurpose: 'portfolio', instruction: 'Cambia el título' })).rejects.toThrow('rediseño explícito');
  expect(dialogue.decide).not.toHaveBeenCalled();
  expect(generation.generate).not.toHaveBeenCalled();
});
it('retains accepted photo roles through an unrelated section edit', async () => {
  const photo = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
  const { service, dialogue, generation, messages } = setup([{ role:'ASSISTANT', metadata:{sourceRevision:1,sourceSetup:{assetUrls:[],imageUses:[{url:photo,role:'business',description:'Portada aprobada'}]}} }]);
  dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary:'Remove reference photos',generationInstruction:'Replace photos with drawings',imageUses:[]});
  await service.send('m','s',{...request,instruction:'Añade una sección de preparación orgánica'});
  expect(generation.generate.mock.calls[0][4]).toContainEqual(expect.objectContaining({url:photo,role:'business'}));
  expect(messages.at(-1).metadata.sourceSetup.imageUses).toContainEqual(expect.objectContaining({url:photo,role:'business'}));
  expect(generation.generate.mock.calls[0][2].instruction).toContain('no amplían el pedido actual');
});
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
    const build = { ...initial, instruction: 'Usa rojo y crema', setupAction: 'generate' as const };
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
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Genera la tienda usando mis fotos', setupAction: 'generate' });
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
  it('opens the reply with the agent summary and the sections it built', async () => {
    const { service, generation } = setup();
    generation.generate.mockResolvedValueOnce({ revision: 1, label: 'Portada nueva', agent: { summary: 'Construí tu portada nueva.', sections: ['Portada', 'Productos'], steps: [] } });
    const result = await service.send('m', 's', request);
    expect(result.assistantMessage.content).toMatch(/^Construí tu portada nueva\.\n\n• Portada\n• Productos\n\nGuardé una revisión verificada/);
    expect(result.assistantMessage.metadata).toMatchObject({ agentSummary: 'Construí tu portada nueva.', agentSections: ['Portada', 'Productos'] });
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
  it('passes the current preview page through interpretation and generation', async () => {
    const { service, projects, dialogue, generation } = setup();
    projects.version.mockResolvedValue({ snapshot: { files: [{ path: 'acceso-ingresar.html', content: '<h1>Ingresar</h1>' }] } });
    await service.send('m', 's', { ...request, currentPage: 'acceso-ingresar.html' });
    expect(dialogue.decide.mock.calls[0][1].site.currentPage).toBe('acceso-ingresar.html');
    expect(generation.generate.mock.calls[0][2].currentPage).toBe('acceso-ingresar.html');
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
  it('explains retries using the active ChatGPT plan instead of API credits', async () => {
    const { service, generation, messages } = setup();
    generation.usesChatGptPlan = true;
    generation.generate.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.send('m', 's', request)).rejects.toThrow('unavailable');
    expect(messages.at(-1).content).toContain('saldo del plan de ChatGPT');
    expect(messages.at(-1).content).not.toContain('puede consumir créditos de IA');
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
  it('preserves legacy brand facts and builds once the brief is usable', async () => {
    const { service, projects, dialogue, generation } = setup([{ role: 'ASSISTANT', content: '¿A quién vendes?', metadata: {sourceSetup:{step:'audience',answers:{brand:'Crema y verde'},assetUrls:[]}} }]);
    projects.current.mockResolvedValue({revision:0});
    expect((await service.conversation('m','s')).setup).toMatchObject({step:'conversation',options:[]});
    await service.send('m','s',{revision:0,instruction:'Crea el sitio ahora',setupStep:'logo',setupAction:'generate'});
    expect(dialogue.decide.mock.calls[0][1]).toMatchObject({buildNow:true,draft:{answers:{brand:'Crema y verde'}}});
    expect(generation.generate).toHaveBeenCalledTimes(1);
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
    dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary,generationInstruction:'Crear el sitio usando la foto del café en la portada y un nombre de texto.',imageUses,startFrom:'scratch'});
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
  it('builds a usable brief immediately and forwards generation preferences', async () => {
    const { service, projects, generation, dialogue } = setup(); projects.current.mockResolvedValue({revision:0});
    await service.send('m','s',{...request,revision:0,setupAction:'quick',model:'gpt-5.6-luna',maxCredits:8});
    expect(dialogue.decide.mock.calls[0][1].buildNow).toBe(true);
    expect(generation.generate).toHaveBeenCalledTimes(1);
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
    dialogue.decide.mockResolvedValue({action:'generate',reply:'',summary:'Café con fotos.',generationInstruction:'Crear tienda',imageUses:[],startFrom:'scratch'});
    await service.send('m','s',{revision:0,instruction:'Usa crema y verde',setupAction:'generate'});
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

it('never saves or throws a validator diagnostic, whichever stage produced it', async () => {
  // A 502 from outside generate(): the gate used to run only inside the attempt
  // loop, so the conversation and save paths reached merchants verbatim.
  const messages: any[] = []; const { service, dialogue } = setup(messages);
  dialogue.decide.mockRejectedValue(new BadGatewayException(
    'requested images are absent from the design: assets/image-9eb40d2cb55e.jpg. Display these actual local images',
  ));
  await expect(service.send('m', 's', { revision: 1, instruction: 'Usa mis fotos' })).rejects.toMatchObject({
    message: expect.not.stringMatching(/assets\/|absent|Display these/i),
  });
  const failure = messages.at(-1);
  expect(failure.content).not.toMatch(/assets\/|absent|Display these|image-9eb40d2cb55e/i);
  expect(failure.content).toContain('comprobaciones automáticas');
  expect(failure.content).toContain('quedaron guardados');
  expect(failure.metadata).toMatchObject({ failed: true });
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


describe('build progress', () => {
  it('persists request-scoped progress and attaches the completed activity to the reply', async () => {
    const {service,prisma,generation,messages}=setup();
    prisma.storeAgentMessage.update=jest.fn().mockResolvedValue({});
    generation.generate.mockImplementation(async (...args: any[]) => {
      await args[5]('building');
      await args[5]('validating');
      await args[5]('saving');
      return {revision:2,label:'Cambios'};
    });
    await service.send('m','s',{...request,requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'});
    const writes=prisma.storeAgentMessage.update.mock.calls.map((call:any[])=>call[0].data.metadata);
    expect(writes[0].requestId).toBe('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(writes[0].progress.steps[0].stage).toBe('interpreting');
    expect(writes.at(-1).progress.status).toBe('completed');
    expect(messages.at(-1).metadata.progress.steps.map((step:any)=>step.stage)).toEqual(['interpreting','building','validating','saving']);
  });
  it('checks store ownership before looking up request progress', async () => {
    const {service,prisma}=setup();
    prisma.store.findFirst.mockResolvedValue(null);
    prisma.storeAgentMessage.findFirst=jest.fn();
    await expect(service.progress('other','s','id')).rejects.toThrow('Store not found');
    expect(prisma.storeAgentMessage.findFirst).not.toHaveBeenCalled();
  });
  it('marks a failed generation without adding a successful saving step', async () => {
    const {service,prisma,generation,messages}=setup();
    prisma.storeAgentMessage.update=jest.fn().mockResolvedValue({});
    generation.generate.mockImplementation(async (...args:any[])=>{await args[5]('building');throw new Error('Failed');});
    await expect(service.send('m','s',{...request,requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'})).rejects.toThrow('Failed');
    const progress=messages.at(-1).metadata.progress;
    expect(progress.status).toBe('failed');
    expect(progress.steps.at(-1)).toMatchObject({stage:'building',status:'failed'});
    expect(progress.steps.some((step:any)=>step.stage==='saving')).toBe(false);
  });
});

describe('referenceOnlyNotice', () => {
  const photo = (n: number) => `/v1/uploads/0000000${n}-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp`;
  it('tells the merchant when uploaded photos were kept only as style references', () => {
    expect(referenceOnlyNotice([1, 2, 3].map(n => ({ url: photo(n), role: 'reference' })), [1, 2, 3].map(photo))).toContain('Usé tus 3 fotos solo como referencia de estilo, así que no aparecen en la tienda');
    expect(referenceOnlyNotice([{ url: photo(1), role: 'reference' }, { url: photo(2), role: 'product' }], [photo(1), photo(2)])).toContain('Usé 1 de tus fotos solo como referencia');
    expect(referenceOnlyNotice([{ url: photo(1), role: 'reference' }], [photo(1)])).toContain('«usa estas fotos en la tienda»');
  });
  it('stays silent when every upload is shown or none was attached in this request', () => {
    expect(referenceOnlyNotice([{ url: photo(1), role: 'product' }], [photo(1)])).toBe('');
    expect(referenceOnlyNotice([{ url: photo(1), role: 'reference' }], [])).toBe('');
    expect(referenceOnlyNotice([{ url: '/v1/uploads/clip.mp4', role: 'reference' }], ['/v1/uploads/clip.mp4'])).toBe('');
  });
});

const discovered = () => [{ role: 'ASSISTANT', content: '¿Qué estilo quieres?', metadata: { sourceSetup: { step: 'conversation', answers: { context: 'Cafetería de especialidad en Santa Cruz' }, assetUrls: [], imageUses: [], discoveryReplies: 2, sitePurpose: 'shop' } } }];
const firstShop = (messages: any[] = discovered()) => { const env = setup(messages); env.projects.current.mockResolvedValue({ revision: 0 }); return env; };

it('does not append a template question to a necessary clarification', async () => {
  const { service, projects, dialogue, messages } = setup([{ role: 'ASSISTANT', content: '¿Qué ofreces?', metadata: { sourceSetup: { step: 'conversation', answers: {}, assetUrls: [], imageUses: [], discoveryReplies: 1, sitePurpose: 'shop' } } }]);
  projects.current.mockResolvedValue({ revision: 0 });
  dialogue.decide.mockResolvedValue({ action: 'reply', reply: '¿Qué estilo y colores quieres?', summary: 'Cafetería', generationInstruction: '', imageUses: [] });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Vendo café de especialidad' });
  expect(messages.at(-1).content).toBe('¿Qué estilo y colores quieres?');
});

it('offers three Plantillas when the merchant chooses templates', async () => {
  const { service, dialogue, generation, messages } = firstShop();
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería de especialidad', generationInstruction: 'Crea la tienda', imageUses: [], startFrom: 'unknown', templates: [{ id: 'tostado', reason: 'Hecha para café' }], chosenTemplateId: '', rework: false });
  const result = await service.send('m', 's', { ...request, revision: 0, instruction: 'Quiero usar una plantilla' });
  expect(generation.generate).not.toHaveBeenCalled();
  expect((result as { revision?: unknown }).revision).toBeUndefined();
  const choices = messages.at(-1).metadata.templateChoices;
  expect(choices).toHaveLength(3);
  expect(choices[0]).toEqual({ id: 'tostado', name: 'Tostado', reason: 'Hecha para café' });
  expect(messages.at(-1).metadata.sourceSetup.answers.context).toBe('Cafetería de especialidad');
});

it('builds a scratch store from its brief without offering generic design directions', async () => {
  const { service, dialogue, generation, messages } = firstShop();
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Skincare con el lenguaje visual de Rhode', generationInstruction: 'Sigue la referencia de Rhode', imageUses: [], startFrom: 'scratch', templates: [], chosenTemplateId: '', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Desde cero, como la web de Rhode' });
  expect(generation.generate).toHaveBeenCalledTimes(1);
  expect(generation.generate.mock.calls[0][2].instruction).toContain('Sigue la referencia de Rhode');
  expect(messages.some((message: any) => message.metadata?.directionChoices)).toBe(false);
});

it('builds from scratch with the direction the merchant tapped', async () => {
  const offered = [...discovered(), { role: 'ASSISTANT', content: 'Elige una dirección', metadata: { directionChoices: rankDirections('Hamburguesería retro'), sourceSetup: { ...discovered()[0].metadata.sourceSetup, startFrom: 'scratch' } } }];
  const { service, dialogue, generation } = firstShop(offered);
  dialogue.decide.mockResolvedValue({ action: 'reply', reply: '¿Algo más?', summary: 'Hamburguesería retro', generationInstruction: '', imageUses: [], startFrom: 'scratch', templates: [], chosenTemplateId: '', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Retro americana', directionId: 'retro-americana' });
  expect(generation.generate).toHaveBeenCalledTimes(1);
  expect(generation.generate.mock.calls[0][2].instruction).toContain('Dirección visual elegida por el comercio (obligatoria): «Retro americana»');
});

it('keeps the chosen direction when a failed build is retried, without asking again', async () => {
  const offered = [...discovered(), { role: 'ASSISTANT', content: 'Elige una dirección', metadata: { directionChoices: rankDirections('Hamburguesería retro'), sourceSetup: { ...discovered()[0].metadata.sourceSetup, startFrom: 'scratch' } } }];
  const { service, dialogue, generation, messages } = firstShop(offered);
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Hamburguesería retro', generationInstruction: 'Crea la tienda', imageUses: [], startFrom: 'scratch', templates: [], chosenTemplateId: '', rework: false });
  generation.generate.mockRejectedValueOnce(new Error('timeout'));
  await expect(service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Nocturno neón', directionId: 'neon-nocturno' })).rejects.toThrow('timeout');
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Inténtalo de nuevo' });
  expect(generation.generate).toHaveBeenCalledTimes(2);
  expect(generation.generate.mock.calls[1][2].instruction).toContain('«Nocturno neón»');
  expect(messages.filter((message: any) => message.metadata?.directionChoices)).toHaveLength(1);
});

it('serves the live draft preview only to the store owner and only when it is newer', async () => {
  const { service } = firstShop();
  agentDraftPreviews.set('s', [{ path: 'index.html', content: '<h1>Borrador</h1>' }]);
  const first = await service.draftPreview('m', 's');
  expect(first.files).toEqual([{ path: 'index.html', content: '<h1>Borrador</h1>' }]);
  expect(await service.draftPreview('m', 's', first.at!)).toEqual({ at: first.at });
  agentDraftPreviews.clear('s');
});

it('refuses a direction that was not offered', async () => {
  const { service } = firstShop();
  await expect(service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Lujo', directionId: 'lujo-sobrio' })).rejects.toThrow('direcciones sugeridas');
});

it('offers a fresh set when the merchant keeps talking instead of choosing', async () => {
  const offered = [...discovered(), { role: 'ASSISTANT', content: 'Elegí estas 3 plantillas', metadata: { templateChoices: [{ id: 'tostado', name: 'Tostado', reason: 'r' }], sourceSetup: discovered()[0].metadata.sourceSetup } }];
  const { service, dialogue, generation, messages } = firstShop(offered);
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería verde', generationInstruction: 'x', imageUses: [], startFrom: 'template', templates: [{ id: 'huerta', reason: 'Verde' }], chosenTemplateId: '', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Que sea más verde' });
  expect(generation.generate).not.toHaveBeenCalled();
  expect(messages.at(-1).metadata.templateChoices[0].id).toBe('huerta');
  expect(dialogue.decide.mock.calls[0][1].offeredTemplates).toEqual([{ id: 'tostado', name: 'Tostado' }]);
});

it('keeps service sites and existing designs on today\'s path', async () => {
  const serviceSite = firstShop([{ ...discovered()[0], metadata: { sourceSetup: { ...discovered()[0].metadata.sourceSetup, sitePurpose: 'service' } } }]);
  serviceSite.dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Estudio', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: false });
  await serviceSite.service.send('m', 's', { ...request, revision: 0, instruction: 'Diseña' });
  expect(serviceSite.generation.generate).toHaveBeenCalledTimes(1);
  const existing = setup();
  existing.dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Café', generationInstruction: 'x', imageUses: [], startFrom: 'template', templates: [{ id: 'tostado', reason: 'r' }], chosenTemplateId: '', rework: false });
  await existing.service.send('m', 's', { ...request, instruction: 'Cambia el título' });
  expect(existing.generation.generate).toHaveBeenCalledTimes(1);
});

const withCards = () => [...discovered(), { role: 'ASSISTANT', content: 'Elegí estas 3 plantillas', metadata: { templateChoices: [{ id: 'tostado', name: 'Tostado', reason: 'r' }, { id: 'miga', name: 'Miga', reason: 'r' }, { id: 'huella', name: 'Huella', reason: 'r' }], sourceSetup: discovered()[0].metadata.sourceSetup } }];

it('applies a tapped card, then adapts it for free with the conversation summary', async () => {
  const { service, templates, generation, dialogue, messages } = firstShop(withCards());
  generation.generate.mockResolvedValue({ revision: 2, label: 'Tostado adaptada' });
  const result: any = await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Tostado', templateId: 'tostado' });
  expect(dialogue.decide).not.toHaveBeenCalled();
  expect(templates.apply).toHaveBeenCalledWith('m', 's', 'tostado', 0);
  const [, , dto, budget, , , execution] = generation.generate.mock.calls[0];
  expect(dto).toMatchObject({ revision: 1, maxCredits: TEMPLATE_ADAPTATION_MAX_CREDITS, brief: { templateId: 'tostado', sitePurpose: 'shop', businessInformation: 'Cafetería de especialidad en Santa Cruz' } });
  expect(dto.instruction).toContain('Cafetería de especialidad en Santa Cruz');
  expect(dto.instruction).toMatch(/conserva el diseño de la plantilla/i);
  expect(budget).toBeInstanceOf(SourceRequestBudget);
  expect(execution).toEqual({ free: true });
  expect(result.revision.revision).toBe(2);
  expect(messages.at(-1).content).toContain(TEMPLATE_UNIQUE_OFFER);
  expect(messages.at(-1).metadata.sourceRevision).toBe(2);
});

it('uses the ChatGPT-plan budget for template adaptation without an API credit cap', async () => {
  const { service, generation } = firstShop(withCards());
  const budget = new SourceRequestBudget(TEMPLATE_ADAPTATION_MAX_CREDITS, true);
  generation.newBudget.mockReturnValue(budget);
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Miga', templateId: 'miga' });
  expect(generation.newBudget).toHaveBeenCalledWith(TEMPLATE_ADAPTATION_MAX_CREDITS);
  expect(generation.generate.mock.calls[0][3]).toBe(budget);
  for (let turn = 0; turn < 30; turn++) expect(() => budget.reserve('gpt-5.6-terra', 30000, 16000)).not.toThrow();
});

it('applies a card the merchant names in words', async () => {
  const { service, templates, dialogue } = firstShop(withCards());
  dialogue.decide.mockResolvedValue({ action: 'reply', reply: 'Perfecto', summary: 'Cafetería', generationInstruction: '', imageUses: [], startFrom: 'template', templates: [], chosenTemplateId: 'miga', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'la segunda' });
  expect(templates.apply).toHaveBeenCalledWith('m', 's', 'miga', 0);
});

it('rejects a card that was not offered on the latest message, before saving anything', async () => {
  const { service, templates, generation, prisma } = firstShop(withCards());
  await expect(service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Pixel', templateId: 'pixel' })).rejects.toThrow('Elige una de las plantillas sugeridas');
  expect(templates.apply).not.toHaveBeenCalled();
  expect(generation.generate).not.toHaveBeenCalled();
  expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
});

it('rejects a second tap once the store has a design', async () => {
  const { service, projects, templates } = setup(withCards());
  projects.current.mockResolvedValue({ revision: 2 });
  await expect(service.send('m', 's', { ...request, revision: 2, instruction: 'Usar Tostado', templateId: 'tostado' })).rejects.toThrow('ya tiene un diseño');
  expect(templates.apply).not.toHaveBeenCalled();
});

it('keeps the applied template when the adaptation fails, and says so plainly', async () => {
  const { service, generation, messages } = firstShop(withCards());
  generation.generate.mockRejectedValue(new BadGatewayException('upstream 502 invalid json at position 12'));
  const result: any = await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Tostado', templateId: 'tostado' });
  expect(result.revision.revision).toBe(1);
  expect(messages.at(-1).metadata.sourceRevision).toBe(1);
  expect(messages.at(-1).content).toContain('Tu tienda ya tiene la plantilla Tostado');
  expect(messages.at(-1).content).not.toContain('position 12');
  expect(messages.at(-1).metadata.sourceSetup.assetUrls).toEqual(generation.generate.mock.calls[0][2].assetUrls);
});

it('reworks a template-based store when the merchant asks for a more unique look, as a paid edit', async () => {
  const { service, projects, dialogue, generation } = setup();
  projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Plantilla', sitePurpose: 'shop', templateId: 'tostado' } } });
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Café', generationInstruction: 'Rediseña', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: true });
  await service.send('m', 's', { ...request, instruction: 'Hazla más única' });
  const [, , dto, , , , execution] = generation.generate.mock.calls[0];
  expect(dto.instruction).toContain(TEMPLATE_REWORK_BRIEF);
  expect(dto.brief.templateId).toBe('tostado');
  expect(execution?.free).toBeUndefined();
  // Reworking a template restyles every file; as a local edit it could only fail (rewrites rejected, output cut short).
  expect(execution?.redesign).toBe(true);
});

it('tells the dialogue which Plantilla the store started from and whether it is still untouched', async () => {
  const { service, projects, dialogue } = setup();
  projects.current.mockResolvedValue({ revision: 1, slug: 's' });
  projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'Pilates', audience: 'V', primaryAction: 'Reservar', visualDirection: 'Plantilla', sitePurpose: 'shop', templateId: 'pausa', templateRevision: 1 }, files: [] } });
  dialogue.decide.mockResolvedValue({ action: 'reply', reply: '¿Algo más?', summary: 'Pilates', generationInstruction: '', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: false });
  await service.send('m', 's', { ...request, instruction: 'moderna y clínica' });
  expect(dialogue.decide.mock.calls[0][1].startedFromTemplate).toMatchObject({ id: 'pausa', name: 'Pausa', untouched: true });
});

it('treats a rework request on a store without a template as an ordinary edit', async () => {
  const { service, dialogue, generation } = setup();
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Café', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: true });
  await service.send('m', 's', { ...request, instruction: 'Hazla más única' });
  expect(generation.generate.mock.calls[0][2].instruction).not.toContain(TEMPLATE_REWORK_BRIEF);
  expect(generation.generate.mock.calls[0][6]?.redesign).toBeFalsy();
});

describe('final review fixes', () => {
  it('runs the free adaptation on Terra as a scoped palette-and-copy request, never a redesign', async () => {
    const { service, generation } = firstShop(withCards());
    generation.generate.mockResolvedValue({ revision: 2, label: 'x' });
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Tostado', templateId: 'tostado', model: 'deepseek-v4-flash' });
    const dto = generation.generate.mock.calls[0][2];
    expect(dto.model).toBe('gpt-5.6-terra');
    expect(dto.instruction).toContain('Pedido actual del comercio:');
    expect(sourceRedesignRequested(dto.instruction)).toBe(false);
    expect(sourceRequestProfile(dto.instruction, true).scope).not.toBe('full-redesign');
    expect(sourceGenerationPlan(dto.model, 1, dto.instruction).maxOutputTokens).toBe(10000);
  });

  it('still accepts a card after YAPI answered a question in plain text', async () => {
    const history = [...withCards(), { role: 'USER', content: '¿La segunda tiene fotos grandes?', metadata: {} }, { role: 'ASSISTANT', content: 'Sí, Miga usa fotos grandes.', metadata: { sourceSetup: discovered()[0].metadata.sourceSetup } }];
    const { service, templates, dialogue } = firstShop(history);
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Miga', templateId: 'miga' });
    expect(templates.apply).toHaveBeenCalledWith('m', 's', 'miga', 0);
    const typed = firstShop(history);
    typed.dialogue.decide.mockResolvedValue({ action: 'reply', reply: 'Perfecto', summary: 'Cafetería', generationInstruction: '', imageUses: [], startFrom: 'template', templates: [], chosenTemplateId: 'huella', rework: false });
    await typed.service.send('m', 's', { ...request, revision: 0, instruction: 'la tercera' });
    expect(typed.dialogue.decide.mock.calls[0][1].offeredTemplates.map((offer: any) => offer.id)).toEqual(['tostado', 'miga', 'huella']);
    expect(typed.templates.apply).toHaveBeenCalledWith('m', 's', 'huella', 0);
    expect(dialogue.decide).not.toHaveBeenCalled();
  });

  it('puts the rework brief in the current request, so the generator treats it as a visual change', async () => {
    const { service, projects, dialogue, generation } = setup();
    projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Plantilla', sitePurpose: 'shop', templateId: 'tostado' } } });
    dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Café', generationInstruction: 'Rediseña', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: true });
    await service.send('m', 's', { ...request, instruction: 'Hazla más única' });
    const { instruction } = generation.generate.mock.calls[0][2];
    expect(instruction.split('Pedido actual del comercio:').at(-1)).toContain(TEMPLATE_REWORK_BRIEF);
    const profile = sourceRequestProfile(instruction, true);
    expect(profile.scope).not.toBe('functional-or-content');
    expect(profile.scope).not.toBe('full-redesign');
    expect(profile.visualDomains).toEqual(expect.arrayContaining(['typography', 'palette']));
  });

  it('does not offer a retry that does not exist after a failed adaptation', async () => {
    const { service, generation, messages } = firstShop(withCards());
    generation.generate.mockRejectedValue(new Error('boom'));
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Tostado', templateId: 'tostado' });
    expect(messages.at(-1).content).not.toMatch(/vuelve a intentarlo/i);
  });

  it('remembers "desde cero" across turns', async () => {
    const { service, dialogue, generation, messages } = firstShop();
    dialogue.decide.mockResolvedValueOnce({ action: 'reply', reply: '¿Algo más sobre tus colores?', summary: 'Cafetería', generationInstruction: '', imageUses: [], startFrom: 'scratch', templates: [], chosenTemplateId: '', rework: false });
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Desde cero, por favor' });
    dialogue.decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 'Cafetería', generationInstruction: 'Crea', imageUses: [], startFrom: 'unknown', templates: [{ id: 'tostado', reason: 'r' }], chosenTemplateId: '', rework: false });
    await service.send('m', 's', { ...request, revision: 0, instruction: 'Tonos tierra' });
    // A remembered scratch choice proceeds without another preset question.
    expect(generation.generate).toHaveBeenCalledTimes(1);
    expect(messages.at(-1).metadata.directionChoices).toBeUndefined();
    expect(messages.some((message: any) => message.metadata?.templateChoices)).toBe(false);
  });
});

describe('template swaps before any change', () => {
  const untouched = (templateRevision: number) => ({ snapshot: { brief: { businessType: 'Café', audience: 'V', primaryAction: 'C', visualDirection: 'P', sitePurpose: 'shop', templateId: 'tostado', templateRevision, businessInformation: 'Cafetería' } } });
  it('lets a card be tapped again while the store is untouched, and applies on top of the current revision', async () => {
    const { service, projects, templates } = setup(withCards());
    projects.current.mockResolvedValue({ revision: 2 }); projects.version.mockResolvedValue(untouched(2));
    await service.send('m', 's', { ...request, revision: 2, instruction: 'Usar Miga', templateId: 'miga' });
    expect(templates.apply).toHaveBeenCalledWith('m', 's', 'miga', 2);
  });
  it('refuses a card once the merchant edited the store', async () => {
    const { service, projects, templates } = setup(withCards());
    projects.current.mockResolvedValue({ revision: 3 }); projects.version.mockResolvedValue(untouched(2));
    await expect(service.send('m', 's', { ...request, revision: 3, instruction: 'Usar Miga', templateId: 'miga' })).rejects.toThrow('ya tiene un diseño');
    expect(templates.apply).not.toHaveBeenCalled();
  });
  it('adapts for free up to the 4th template version and not after', async () => {
    for (const [count, adapted] of [[4, true], [5, false]] as const) {
      const { service, projects, templates, generation, prisma, messages } = setup(withCards());
      projects.current.mockResolvedValue({ revision: 2 }); projects.version.mockResolvedValue(untouched(2));
      templates.apply.mockResolvedValue({ revision: 3, label: 'Plantilla: Miga' }); prisma.storeSourceVersion.count.mockResolvedValue(count);
      generation.generate.mockResolvedValue({ revision: 4, label: 'x' });
      await service.send('m', 's', { ...request, revision: 2, instruction: 'Usar Miga', templateId: 'miga' });
      expect(generation.generate).toHaveBeenCalledTimes(adapted ? 1 : 0);
      if (!adapted) expect(messages.at(-1).content).toContain('pídeme que la adapte');
    }
  });
  it('marks the adapted version as the one the template produced', async () => {
    const { service, projects, templates, generation } = setup(withCards());
    projects.current.mockResolvedValue({ revision: 2 }); projects.version.mockResolvedValue(untouched(2));
    templates.apply.mockResolvedValue({ revision: 3, label: 'Plantilla: Miga' }); generation.generate.mockResolvedValue({ revision: 4, label: 'x' });
    await service.send('m', 's', { ...request, revision: 2, instruction: 'Usar Miga', templateId: 'miga' });
    expect(generation.generate.mock.calls[0][2].brief.templateRevision).toBe(4);
  });
  it('gallery picks on a YAPI-flow untouched store go through the free adaptation', async () => {
    const { service, projects, templates, generation } = setup([]);
    projects.current.mockResolvedValue({ revision: 2 }); projects.version.mockResolvedValue(untouched(2));
    templates.apply.mockResolvedValue({ revision: 3, label: 'Plantilla: Miga' }); generation.generate.mockResolvedValue({ revision: 4, label: 'x' });
    const saved = await service.applyTemplate('m', 's', 'miga', 2);
    expect(generation.generate.mock.calls[0][6]).toEqual({ free: true });
    expect(saved).toMatchObject({ revision: 4, adapted: true });
  });
  it('gallery picks on a store without a YAPI conversation stay instant', async () => {
    const { service, projects, templates, generation } = setup([]);
    projects.current.mockResolvedValue({ revision: 5 }); projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'Café', audience: 'V', primaryAction: 'C', visualDirection: 'P' } } });
    templates.apply.mockResolvedValue({ revision: 6, label: 'Plantilla: Miga' });
    await expect(service.applyTemplate('m', 's', 'miga', 5)).resolves.toMatchObject({ revision: 6, adapted: false });
    expect(generation.generate).not.toHaveBeenCalled();
  });
});

it.each([false, true])('retains uploads after a template fallback, including legacy cleared lists (%s)', async legacy => {
  const uploads = ['/v1/uploads/bread.jpg', '/v1/uploads/cover.mp4'];
  const discovery = discovered()[0];
  const prior = { ...discovery, metadata: { sourceSetup: { ...discovery.metadata.sourceSetup, assetUrls: uploads } } };
  const fallback = { role: 'ASSISTANT', content: 'No pude adaptar', metadata: { sourceRevision: 1, adaptationFailed: true, sourceSetup: { ...discovery.metadata.sourceSetup, assetUrls: legacy ? [] : uploads } } };
  const { service, generation } = setup([prior, fallback]);
  await service.send('m', 's', { ...request, instruction: 'Usa mis fotos y el video para la portada' });
  expect(generation.generate.mock.calls[0][2].assetUrls).toEqual(uploads);
});

it('uses a custom design when the brief is usable and no template was requested', async () => {
  const { service, dialogue, generation, templates, messages } = firstShop();
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería', generationInstruction: 'Crea', imageUses: [], startFrom: 'unknown' });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Verde y blanco' });
  expect(messages.at(-1).metadata.startChoices).toBeUndefined();
  expect(messages.at(-1).metadata.templateChoices).toBeUndefined();
  expect(generation.generate).toHaveBeenCalledTimes(1);
  expect(templates.apply).not.toHaveBeenCalled();
});
it('honors explicit scratch requests even when the model suggests an offered template, and remembers the choice', async () => {
  const { service, dialogue, generation, templates, messages } = firstShop(withCards());
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería', generationInstruction: 'Crea', imageUses: [], startFrom: 'template', chosenTemplateId: 'miga' });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Desde cero, sin plantillas' });
  expect(messages.at(-1).metadata.sourceSetup.startFrom).toBe('scratch');
  expect(messages.at(-1).metadata.directionChoices).toBeUndefined();
  expect(generation.generate).toHaveBeenCalledTimes(1);
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería', generationInstruction: 'Crea', imageUses: [], startFrom: 'template' });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Elige tú, empieza ya' });
  expect(templates.apply).not.toHaveBeenCalled();
  expect(generation.generate).toHaveBeenCalledTimes(2);
  expect(generation.generate.mock.calls[0][2].revision).toBe(0);
  expect(generation.generate.mock.calls[0][2].brief.templateId).toBeUndefined();
});


it('does not turn an automatically ranked direction into a binding merchant palette', async () => {
  const offered = [...discovered(), { role: 'ASSISTANT', content: 'Opciones', metadata: { directionChoices: rankDirections('Editorial'), sourceSetup: { ...discovered()[0].metadata.sourceSetup, startFrom: 'scratch', directionId: 'editorial-minimal' } } }];
  const { service, dialogue, generation } = firstShop(offered);
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Luz Papel, editorial azul y blanco, sans', generationInstruction: 'Crea una tienda azul y blanca desde cero', imageUses: [], startFrom: 'scratch', templates: [], chosenTemplateId: '', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Elige los detalles y crea la tienda ahora' });
  expect(generation.generate).toHaveBeenCalledTimes(1);
  const instruction = generation.generate.mock.calls[0][2].instruction;
  expect(instruction).toContain('azul y blanco');
  expect(instruction).not.toContain('Dirección visual elegida por el comercio (obligatoria)');
  expect(instruction).not.toContain('#f7f4ee');
});
