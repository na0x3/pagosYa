import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Authenticates checkout-iframe calls via a PaymentIntent's `client_secret`.
 * Scoped to exactly one PaymentIntent — never a merchant-wide credential.
 */
@Injectable()
export class ClientSecretGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    const clientSecret = value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : null;
    if (!clientSecret) throw new UnauthorizedException("Missing client secret");

    const paymentIntentIdFromParam = request.params?.id;
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { clientSecret },
    });

    if (!paymentIntent) throw new UnauthorizedException("Invalid client secret");
    if (paymentIntentIdFromParam && paymentIntentIdFromParam !== paymentIntent.id) {
      throw new UnauthorizedException("Client secret does not match resource");
    }

    request.paymentIntent = paymentIntent;
    return true;
  }
}
