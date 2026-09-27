import { ConflictException, NotFoundException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, MCP_TOOL_NAMES, type McpDeps } from './mcp-tools';

const snapshot = { schemaVersion: 1, brief: { businessType: 'Café', audience: 'V', primaryAction: 'C', visualDirection: 'P', templateId: 'tostado' }, files: [
  { path: 'components/home.tsx', content: 'export default function Home(){return <main/>}', encoding: 'utf8' },
  { path: 'assets/hero.jpg', content: 'AAAA', encoding: 'base64' },
] };

// The double is typed loosely so each test can reach Jest's mock helpers.
function deps(): any {
  return {
    stores: { listForMerchant: jest.fn(async () => [{ id: 's1', name: 'Café', slug: 'cafe', sourceProject: { revision: 3 }, publishedSourceRevision: 2 }]) },
    products: {
      listForStore: jest.fn(async () => [{ id: 'p1', name: 'Café molido', amount: 5000 }]),
      create: jest.fn(async (_m: string, _s: string, dto: any) => ({ id: 'p2', ...dto })),
      update: jest.fn(async (_m: string, _s: string, id: string, dto: any) => ({ id, ...dto })),
    },
    projects: {
      current: jest.fn(async (_m: string, storeId: string) => { if (storeId !== 's1') throw new NotFoundException('Store not found'); return { slug: 'cafe', revision: 3, updatedAt: null }; }),
      version: jest.fn(async () => ({ revision: 3, snapshot })),
      editFiles: jest.fn(async () => ({ revision: 4, label: 'Edición de components/home.tsx' })),
    },
    templates: { list: jest.fn(() => [{ id: 'tostado', name: 'Tostado', category: 'comida', description: 'Café.', tags: [], order: 1 }]), apply: jest.fn(async () => ({ revision: 4, label: 'Plantilla: Tostado' })) },
    screenshot: jest.fn(async () => Buffer.from('png-bytes')),
  };
}

async function connect(d = deps()) {
  const server = buildMcpServer(d as McpDeps, 'm1');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, d };
}
const text = (result: any) => result.content.map((part: any) => part.text || '').join('');

describe('pagosYa MCP tools', () => {
  it('offers exactly the build tools, nothing that publishes or touches money', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map(tool => tool.name).sort();
    expect(names).toEqual([...MCP_TOOL_NAMES].sort());
    expect(names).toHaveLength(10);
    expect(names.filter(name => /publish|payout|refund|payment|key|domain/.test(name))).toEqual([]);
  });
  it('lists the merchant\'s stores', async () => {
    const { client, d } = await connect();
    const result = await client.callTool({ name: 'list_stores', arguments: {} });
    expect(d.stores.listForMerchant).toHaveBeenCalledWith('m1');
    expect(JSON.parse(text(result))).toEqual([expect.objectContaining({ id: 's1', name: 'Café', revision: 3 })]);
  });
  it('does not reveal another merchant\'s store', async () => {
    const { client } = await connect();
    const result: any = await client.callTool({ name: 'get_store', arguments: { storeId: 'foreign' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('No encontré esa tienda.');
  });
  it('returns text files with contents and binary files by path', async () => {
    const { client } = await connect();
    const body = JSON.parse(text(await client.callTool({ name: 'get_design_files', arguments: { storeId: 's1' } })));
    expect(body).toMatchObject({ revision: 3, files: [{ path: 'components/home.tsx' }], binaryPaths: ['assets/hero.jpg'] });
  });
  it('saves design files as one revision, and asks to re-read after a conflict', async () => {
    const { client, d } = await connect();
    const files = [{ path: 'components/home.tsx', content: 'x' }];
    const saved = await client.callTool({ name: 'write_design_files', arguments: { storeId: 's1', revision: 3, files } });
    expect(d.projects.editFiles).toHaveBeenCalledWith('m1', 's1', { revision: 3, files });
    expect(text(saved)).toContain('"revision":4');
    d.projects.editFiles.mockRejectedValueOnce(new ConflictException('El proyecto cambió.'));
    const stale: any = await client.callTool({ name: 'write_design_files', arguments: { storeId: 's1', revision: 2, files } });
    expect(stale.isError).toBe(true);
    expect(text(stale)).toContain('Vuelve a leer los archivos');
  });
  it('applies a template without any YAPI adaptation', async () => {
    const { client, d } = await connect();
    await client.callTool({ name: 'apply_template', arguments: { storeId: 's1', templateId: 'tostado', revision: 3 } });
    expect(d.templates.apply).toHaveBeenCalledWith('m1', 's1', 'tostado', 3);
  });
  it('validates products like the dashboard form', async () => {
    const { client, d } = await connect();
    const bad: any = await client.callTool({ name: 'create_product', arguments: { storeId: 's1', product: { name: 'Café', amount: -5 } } });
    expect(bad.isError).toBe(true);
    expect(d.products.create).not.toHaveBeenCalled();
    await client.callTool({ name: 'create_product', arguments: { storeId: 's1', product: { name: 'Café', amount: 5000 } } });
    expect(d.products.create).toHaveBeenCalledWith('m1', 's1', expect.objectContaining({ name: 'Café', amount: 5000 }));
  });
  it('returns a PNG screenshot of the current design', async () => {
    const { client, d } = await connect();
    const result: any = await client.callTool({ name: 'screenshot_store', arguments: { storeId: 's1', width: 390 } });
    expect(d.screenshot).toHaveBeenCalledWith(snapshot, 390, 'index.html');
    expect(result.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png', data: Buffer.from('png-bytes').toString('base64') });
  });
});
