import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConsumerSessionService } from "./consumer-session.service";

@Injectable()
export class ConsumerAuthGuard implements CanActivate {
  constructor(private readonly sessions: ConsumerSessionService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const token = value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
    if (!token) throw new UnauthorizedException("Falta la sesión");
    const user = await this.sessions.verify(token);
    if (!user) throw new UnauthorizedException("La sesión venció o no es válida");
    request.consumerUser = user;
    request.consumerSessionToken = token;
    return true;
  }
}
