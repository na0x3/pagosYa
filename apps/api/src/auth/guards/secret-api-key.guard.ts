import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ApiKeyType } from "@prisma/client";
import { ApiKeyService } from "../api-key.service";

function extractBearer(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  const header = request.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim();
}

/** Authenticates merchant server-to-server calls via `sk_test_.../sk_live_...` secret keys. */
@Injectable()
export class SecretApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const presentedKey = extractBearer(request);
    if (!presentedKey) throw new UnauthorizedException("Missing API key");

    const apiKey = await this.apiKeyService.verify(presentedKey, ApiKeyType.SECRET);
    if (!apiKey) throw new UnauthorizedException("Invalid API key");

    request.merchant = apiKey.merchant;
    request.apiKeyMode = apiKey.mode;
    return true;
  }
}
