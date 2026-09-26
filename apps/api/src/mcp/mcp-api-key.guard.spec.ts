import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyType } from '@prisma/client';
import { McpApiKeyGuard } from './mcp-api-key.guard';

const context = (authorization?: string) => {
  const request: any = { headers: authorization ? { authorization } : {} };
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as any };
};

describe('McpApiKeyGuard', () => {
  it('accepts an MCP key and sets the merchant', async () => {
    const verify = jest.fn(async (key: string, type: ApiKeyType) => (type === ApiKeyType.MCP && key === 'mk_live_ok' ? { merchant: { id: 'm1' } } : null));
    const { request, context: ctx } = context('Bearer mk_live_ok');
    await expect(new McpApiKeyGuard({ verify } as any).canActivate(ctx)).resolves.toBe(true);
    expect(request.merchant).toEqual({ id: 'm1' });
    expect(verify).toHaveBeenCalledWith('mk_live_ok', ApiKeyType.MCP);
  });
  it('rejects a missing header and any key that is not an MCP key', async () => {
    const verify = jest.fn(async () => null);
    await expect(new McpApiKeyGuard({ verify } as any).canActivate(context().context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(new McpApiKeyGuard({ verify } as any).canActivate(context('Bearer sk_live_x').context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
