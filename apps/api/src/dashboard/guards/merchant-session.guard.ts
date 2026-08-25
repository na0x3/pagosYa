import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { MerchantSessionService } from "../merchant-session.service";

/** Session-only (not secret-key) auth — used where the raw token itself matters, e.g. logout revokes exactly the presented session. */
@Injectable()
export class MerchantSessionGuard implements CanActivate {
  constructor(private readonly sessions: MerchantSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    const presented = value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : null;
    if (!presented) throw new UnauthorizedException("Missing session token");

    const session = await this.sessions.verify(presented);
    if (!session) throw new UnauthorizedException("Invalid or expired session");

    request.merchant = { id: session.merchantId };
    request.merchantUser = { id: session.merchantUserId, email: session.email };
    request.sessionToken = presented;
    return true;
  }
}
