import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ApiKeyType } from "@prisma/client";
import { ApiKeyService } from "../../auth/api-key.service";
import { MerchantSessionService } from "../merchant-session.service";

/**
 * Accepts EITHER a merchant secret key (sk_test_.../sk_live_...) OR a
 * dashboard session token (dash_...) — dispatched by prefix, same way the
 * codebase already distinguishes sk_/pk_/ops_. Lets the dashboard reuse the
 * exact same read/setup endpoints merchant backends use server-to-server,
 * without ever needing a secret key in the browser. Money-moving endpoints
 * (creating/confirming payment intents, refunds) deliberately keep
 * SecretApiKeyGuard only — a dashboard session must not be able to move
 * money it wasn't explicitly built to move.
 */
@Injectable()
export class MerchantAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly sessions: MerchantSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    const presented = value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : null;
    if (!presented) throw new UnauthorizedException("Missing credentials");

    if (presented.startsWith("dash_")) {
      const session = await this.sessions.verify(presented);
      if (!session) throw new UnauthorizedException("Invalid or expired session");
      request.merchant = { id: session.merchantId };
      request.merchantUser = { id: session.merchantUserId, email: session.email };
      return true;
    }

    const apiKey = await this.apiKeys.verify(presented, ApiKeyType.SECRET);
    if (!apiKey) throw new UnauthorizedException("Invalid credentials");
    request.merchant = apiKey.merchant;
    request.apiKeyMode = apiKey.mode;
    return true;
  }
}
