import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ApiKeyMode, ApiKeyType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiKeyService } from "../api-key.service";

/**
 * Validates an embedded checkout's browser-safe key against the merchant and
 * mode of the PaymentIntent. The client secret remains the scoped payment
 * credential; the publishable key prevents cross-account or test/live mixups.
 */
@Injectable()
export class PublishableApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const publishableKey = this.stringValue(request.body?.publishableKey);
    const clientSecret = this.stringValue(request.body?.clientSecret);
    if (!publishableKey) throw new UnauthorizedException("Missing publishable key");
    if (!clientSecret) throw new UnauthorizedException("Missing client secret");

    const [apiKey, paymentIntent] = await Promise.all([
      this.apiKeys.verify(publishableKey, ApiKeyType.PUBLISHABLE),
      this.prisma.paymentIntent.findUnique({ where: { clientSecret }, include: { merchant: true } }),
    ]);
    if (!apiKey) throw new UnauthorizedException("Invalid publishable key");
    if (!paymentIntent) throw new UnauthorizedException("Invalid client secret");

    const expectedMode = paymentIntent.livemode ? ApiKeyMode.LIVE : ApiKeyMode.TEST;
    if (apiKey.merchantId !== paymentIntent.merchantId || apiKey.mode !== expectedMode) {
      throw new UnauthorizedException("Publishable key does not match this payment");
    }

    request.paymentIntent = paymentIntent;
    return true;
  }

  private stringValue(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
