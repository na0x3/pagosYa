import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { OpsUserService } from "../ops-user.service";

/** Authenticates a named pagosYa staff member via their own ops_... token (see OpsUserService). */
@Injectable()
export class OpsAuthGuard implements CanActivate {
  constructor(private readonly opsUsers: OpsUserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
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
