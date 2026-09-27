import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeyType } from '@prisma/client';
import { ApiKeyService } from '../auth/api-key.service';

/** Authenticates the pagosYa MCP server with `mk_live_…` keys only (spec 2026-09-26 §3.3). Secret and publishable
 * keys are refused here, and MCP keys are refused by every other guard because each checks its own type. */
@Injectable()
export class McpApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    // Claude and ChatGPT connectors cannot send headers: their secret URL carries the key (/v1/mcp/k/<key>), revocable like any key.
    const pathKey = typeof request.params?.key === 'string' ? request.params.key : '';
    const key = typeof value === 'string' && value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : pathKey;
    if (!key) throw new UnauthorizedException('Falta la clave de pagosYa para tu IA.');
    const apiKey = await this.apiKeys.verify(key, ApiKeyType.MCP);
    if (!apiKey) throw new UnauthorizedException('La clave no es válida o fue revocada.');
    request.merchant = apiKey.merchant;
    return true;
  }
}
