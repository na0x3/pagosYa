import { SourceChatService } from './source-chat.service';
function setup(messages: any[] = []) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Café Aroma', logoUrl: '/v1/uploads/logo.png', _count: { paymentLinks: 3 } }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({data}) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }) },
  };
  const projects: any = { state: jest.fn().mockResolvedValue({ revision: 1 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { businessType: 'Café Aroma', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' } } }) };
  const generation: any = { generate: jest.fn().mockResolvedValue({ revision: 1, label: 'Carta editorial' }) };
  return { service: new SourceChatService(prisma, projects, generation), prisma, projects, generation, messages };
}
const request = { revision: 1, instruction: 'Crea una carta para mi cafetería, clara y cálida', assetUrls: [] };
describe('Source chat in the existing store conversation infrastructure', () => {
  it('persists requests and replies with a source revision link', async () => {
    const { service, messages, generation } = setup();
    const result = await service.send('m','s',request);
    expect(result.assistantMessage.metadata).toMatchObject({ sourceRevision: 1 });
    expect(messages.map(m => [m.channel, m.role])).toEqual([['source','USER'],['source','ASSISTANT']]);
    expect(generation.generate.mock.calls[0][2].brief.businessType).toBe('Café Aroma');
    expect((await service.conversation('m','s')).messages).toEqual(messages);
  });
  it('rejects foreign stores and stale requests before saving messages or generating', async () => {
    const { service, prisma, projects, generation } = setup();
    prisma.store.findFirst.mockResolvedValueOnce(null);await expect(service.send('other','s',request)).rejects.toThrow('Store not found');
    projects.state.mockResolvedValueOnce({revision:2});await expect(service.send('m','s',request)).rejects.toThrow('otra sesión');
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();expect(generation.generate).not.toHaveBeenCalled();
  });
  it('reuses YAPI clarification choices before a vague request spends a generation', async () => {
    const { service, generation } = setup();
    const result = await service.send('m','s',{...request,instruction:'mejora'});
    expect(result.assistantMessage.metadata).toHaveProperty('clarification');expect(generation.generate).not.toHaveBeenCalled();
  });
  it('keeps the request and records a failed reply when generation fails', async () => {
    const { service, generation, messages } = setup();generation.generate.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.send('m','s',request)).rejects.toThrow('unavailable');
    expect(messages).toHaveLength(2);expect(messages[1].metadata.failed).toBe(true);
  });
  it('carries clarification context and attachments into the generation', async () => {
    const { service, generation, prisma } = setup([{role:'USER',content:'Crea mi café'}, {role:'ASSISTANT',content:'¿Qué estilo?',metadata:{clarification:{},assetUrls:['/v1/uploads/a.png']}}]);
    await service.send('m','s',{...request,instruction:'Portada editorial'});
    expect(generation.generate.mock.calls[0][2]).toMatchObject({assetUrls:['/v1/uploads/a.png']});
    expect(generation.generate.mock.calls[0][2].instruction).toContain('Crea mi café');
    expect(prisma.storeAgentThread.findUnique).toHaveBeenCalledWith(expect.objectContaining({include:{messages:{where:{channel:'source'},orderBy:{createdAt:'desc'},take:100}}}));
  });
});


describe('Guided first-site setup', () => {
  it('asks about business, logo, catalog and colors, resumes after reload, and generates only after confirmation', async () => {
    const { service, projects, generation } = setup();
    projects.state.mockResolvedValue({ revision: 0 });
    const send = (instruction: string, setupStep: string, setupAction?: 'generate' | 'restart', assetUrls: string[] = []) => service.send('m', 's', { revision: 0, instruction, setupStep, setupAction, assetUrls });
    expect((await service.conversation('m', 's')).setup?.step).toBe('business');
    await send('Café de especialidad para vecinos del barrio', 'business');
    expect((await service.conversation('m', 's')).setup?.step).toBe('logo');
    await send('Usar mi logo actual', 'logo');
    expect((await service.conversation('m', 's')).setup?.prompt).toContain('3 productos');
    await send('Destacar café en grano y bebidas', 'products');
    await send('Crema y verde bosque, editorial', 'colors');
    await send('Quiero una carta fácil de leer', 'review');
    expect(generation.generate).not.toHaveBeenCalled();
    expect((await service.conversation('m', 's')).setup?.prompt).toContain('verde bosque');
    generation.generate.mockRejectedValueOnce(new Error('timeout'));
    await expect(send('Crear mi sitio', 'review', 'generate')).rejects.toThrow('timeout');
    expect((await service.conversation('m', 's')).setup?.step).toBe('review');
    await send('Crear mi sitio', 'review', 'generate');
    expect(generation.generate.mock.calls[1][2]).toMatchObject({ assetUrls: ['/v1/uploads/logo.png'], brief: { visualDirection: 'Crema y verde bosque, editorial' } });
    expect(generation.generate.mock.calls[1][2].instruction).toContain('Café de especialidad');
    expect(generation.generate.mock.calls[1][2].instruction).toContain('carta fácil');
  });
  it('rejects early generation and stale answers, and permits restarting without losing the conversation', async () => {
    const { service, projects, generation, messages } = setup(); projects.state.mockResolvedValue({ revision: 0 });
    await expect(service.send('m', 's', { ...request, revision: 0, setupAction: 'generate' })).rejects.toThrow('Primero completa');
    await service.send('m', 's', { ...request, revision: 0, setupStep: 'business' });
    await expect(service.send('m', 's', { ...request, revision: 0, setupStep: 'business' })).rejects.toThrow('avanzó');
    await service.send('m', 's', { ...request, revision: 0, setupStep: 'logo', setupAction: 'restart' });
    expect((await service.conversation('m', 's')).setup?.step).toBe('business');
    expect(messages).toHaveLength(4); expect(generation.generate).not.toHaveBeenCalled();
  });
});
