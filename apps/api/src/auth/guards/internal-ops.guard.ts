import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";

/**
 * Bootstrapping-only secret, deliberately separate from InternalSecretGuard's
 * rail-callback one. It now gates a single thing: creating/revoking named
 * OpsUser accounts (see apps/api/src/ops/). Day-to-day actions like KYC
 * review use OpsAuthGuard's per-person tokens instead, so every decision is
 * attributed to a specific, revocable reviewer rather than "whoever has this
 * shared secret."
 */
@Injectable()
export class InternalOpsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    const presented = value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : null;
    const expected = this.config.get<string>("app.internalOpsSecret");

    if (!presented || !expected) throw new UnauthorizedException("Missing internal secret");

    const presentedBuf = Buffer.from(presented);
    const expectedBuf = Buffer.from(expected);
    const matches =
      presentedBuf.length === expectedBuf.length && timingSafeEqual(presentedBuf, expectedBuf);

    if (!matches) throw new UnauthorizedException("Invalid internal secret");
    return true;
  }
}
