import { BadRequestException, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Human logins for the merchant dashboard. Provisioned via
 * POST /v1/dashboard/signup, which requires the merchant's own secret key —
 * called from the merchant's own backend, once, to set up a login; never
 * from the browser. Every login after that uses email+password, never the
 * secret key.
 */
@Injectable()
export class MerchantUserService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(merchantId: string, email: string, password: string) {
    const existing = await this.prisma.merchantUser.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("A dashboard login already exists for that email");

    const hashedPassword = await argon2.hash(password);
    const user = await this.prisma.merchantUser.create({ data: { merchantId, email, hashedPassword } });
    return { id: user.id, email: user.email };
  }
}
