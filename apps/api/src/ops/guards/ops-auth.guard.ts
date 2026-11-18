import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpsUserService } from "../ops-user.service";

/** IPv4 CIDR or exact match; an IPv4-mapped IPv6 address (::ffff:1.2.3.4) counts as its IPv4 address. */
export function ipAllowed(ip: string | undefined, allowed: readonly string[]): boolean {
  if (!allowed.length) return true;
  if (!ip) return false;
  const address = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const v4 = (text: string) => {
    const parts = text.split(".").map(Number);
    return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts.reduce((acc, n) => acc * 256 + n, 0) : null;
  };
  return allowed.some((entry) => {
    const [base, bits] = entry.split("/");
    if (bits === undefined) return base === address;
    const a = v4(address);
    const b = v4(base);
    const size = Number(bits);
    if (a === null || b === null || !Number.isInteger(size) || size < 0 || size > 32) return false;
    const block = 2 ** (32 - size);
    return Math.floor(a / block) === Math.floor(b / block);
  });
}

/** Only from the ops network when OPS_ALLOWED_IPS is set (ISO A-01: operations reachable through the VPN only). */
export function assertOpsNetwork(config: ConfigService | undefined, ip: string | undefined) {
  if (!ipAllowed(ip, config?.get<string[]>("app.opsAllowedIps") ?? [])) throw new ForbiddenException("Operaciones solo está disponible desde la red de pagosYa");
}

/** Authenticates a named pagosYa staff member: an opss_ session (token + code), or the bare ops_ token where codes are not on yet. */
@Injectable()
export class OpsAuthGuard implements CanActivate {
  constructor(
    private readonly opsUsers: OpsUserService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    assertOpsNetwork(this.config, request.ip);
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    const presented = value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : null;
    if (!presented) throw new UnauthorizedException("Missing ops token");

    const opsUser = await this.opsUsers.verify(presented);
    if (!opsUser) throw new UnauthorizedException("Invalid ops token");

    request.opsUser = opsUser;
    return true;
  }
}
