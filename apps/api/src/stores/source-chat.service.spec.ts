import { SourceChatService } from './source-chat.service';
function setup(messages: any[] = []) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Café Aroma' }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({data}) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }) },
  };
  const projects: any = { state: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() };
  const generation: any = { generate: jest.fn().mockResolvedValue({ revision: 1, label: 'Carta editorial' }) };
  return { service: new SourceChatService(prisma, projects, generation), prisma, projects, generation, messages };
}
const request = { revision: 0, instruction: 'Crea una carta para mi cafetería, clara y cálida', assetUrls: [] };
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
