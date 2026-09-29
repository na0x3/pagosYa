import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ApiKeyService } from '../auth/api-key.service';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { McpApiKeyGuard } from './mcp-api-key.guard';
import { McpController, McpToolsService } from './mcp.controller';

describe('pagosYa MCP over HTTP', () => {
  let app: INestApplication; let url: URL;
  const listForMerchant = jest.fn(async (merchantId: string) => [{ id: 's1', name: `Tienda de ${merchantId}`, slug: 's1', sourceProject: { revision: 1 }, publishedSourceRevision: null }]);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [McpController],
      providers: [McpApiKeyGuard,
        { provide: ApiKeyService, useValue: { verify: jest.fn(async (key: string) => (key === 'mk_live_ok' ? { merchant: { id: 'm1' } } : null)) } },
        { provide: McpToolsService, useValue: { deps: { stores: { listForMerchant }, products: {}, projects: {}, templates: { list: () => [] }, screenshot: jest.fn() } } }],
    }).overrideGuard(MerchantThrottlerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    await app.listen(0);
    url = new URL('/v1/mcp', await app.getUrl());
  });
  afterAll(async () => { await app.close(); });

  it('lets an MCP client with a key list tools and call one as that merchant', async () => {
    const client = new Client({ name: 'e2e', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: 'Bearer mk_live_ok' } } }));
    expect((await client.listTools()).tools.length).toBe(10);
    const result: any = await client.callTool({ name: 'list_stores', arguments: {} });
    expect(result.content[0].text).toContain('Tienda de m1');
    await client.close();
  });

  it('refuses requests without a valid MCP key', async () => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(response.status).toBe(401);
    const secret = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer sk_live_nope', 'content-type': 'application/json' }, body: '{}' });
    expect(secret.status).toBe(401);
  });

  it('serves Claude and ChatGPT connectors from a secret URL with no header, and refuses a wrong one', async () => {
    const client = new Client({ name: 'connector', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/v1/mcp/k/mk_live_ok', url)));
    expect((await client.listTools()).tools.length).toBe(10);
    await client.close();
    const wrong = await fetch(new URL('/v1/mcp/k/mk_live_nope', url), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(wrong.status).toBe(401);
    expect((await fetch(new URL('/v1/mcp/k/mk_live_ok', url))).status).toBe(405);
  });

  it('answers 405 to GET, since the server keeps no sessions', async () => {
    expect((await fetch(url, { headers: { authorization: 'Bearer mk_live_ok' } })).status).toBe(405);
  });
});
