import { NotFoundException } from '@nestjs/common';
import { ApiKeyMode, ApiKeyType } from '@prisma/client';
import { McpKeysController } from './mcp-keys.controller';

describe('McpKeysController', () => {
  const keys = [
    { id: 'k1', type: ApiKeyType.MCP, mode: ApiKeyMode.LIVE, label: 'Claude', maskedKey: 'mk_live_••••abcd', createdAt: new Date(), revokedAt: null },
    { id: 'k2', type: ApiKeyType.SECRET, mode: ApiKeyMode.TEST, label: null, maskedKey: 'sk_test_••••wxyz', createdAt: new Date(), revokedAt: null },
  ];
  const service = () => ({ list: jest.fn(async () => keys), issue: jest.fn(async () => ({ id: 'k3', fullKey: 'mk_live_new', label: 'Cursor', createdAt: new Date() })), revoke: jest.fn(async () => undefined) });
  it('lists only MCP keys', async () => {
    await expect(new McpKeysController(service() as any).list({ id: 'm1' })).resolves.toEqual([keys[0]]);
  });
  it('issues a live MCP key and shows it once', async () => {
    const apiKeys = service();
    await expect(new McpKeysController(apiKeys as any).create({ id: 'm1' }, { label: 'Cursor' })).resolves.toMatchObject({ fullKey: 'mk_live_new' });
    expect(apiKeys.issue).toHaveBeenCalledWith('m1', ApiKeyType.MCP, ApiKeyMode.LIVE, 'Cursor');
  });
  it('revokes only this merchant\'s MCP keys', async () => {
    const apiKeys = service();
    await new McpKeysController(apiKeys as any).revoke({ id: 'm1' }, 'k1');
    expect(apiKeys.revoke).toHaveBeenCalledWith('m1', 'k1');
    await expect(new McpKeysController(apiKeys as any).revoke({ id: 'm1' }, 'k2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
