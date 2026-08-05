import { Inject, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "./tokens";
import { EmailProvider } from "./interfaces/email-provider.interface";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Human logins for the merchant dashboard. Provisioned via
 * POST /v1/dashboard/signup, which requires the merchant's own secret key —
 * called from the merchant's own backend, once, to set up a login; never
 * from the browser. Every login after that uses email+password, never the
 * secret key.
 */
@Injectable()
export class MerchantUserService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  /**
   * Always resolves the same way regardless of whether `email` is already
   * claimed. Returning a different result for "taken" vs "available" would
   * be a free account-existence oracle: POST /v1/merchants issues a working
   * TEST secret key to anyone with no review, and that key alone is enough
   * to reach this endpoint — so an unauthenticated caller could otherwise
   * probe arbitrary third-party emails, or worse, permanently squat one by
   * winning the signup race before its real owner ever tries. An unverified
   * MerchantUser row doesn't count as "claimed" — a later signup for the
   * same email supersedes it once it's stale — so nothing here permanently
   * blocks the real owner from getting their email back.
   */
  async signup(merchantId: string, email: string, password: string): Promise<{ message: string }> {
    const existing = await this.prisma.merchantUser.findUnique({ where: { email } });

    if (!existing || this.isStaleUnverified(existing)) {
      const hashedPassword = await argon2.hash(password);
      const user = existing
        ? await this.prisma.merchantUser.update({
            where: { id: existing.id },
            data: { merchantId, hashedPassword, emailVerifiedAt: null, createdAt: new Date() },
          })
        : await this.prisma.merchantUser.create({ data: { merchantId, email, hashedPassword } });

      // Invalidate any token from a prior (now-superseded) claim attempt.
      await this.prisma.emailVerificationToken.deleteMany({ where: { merchantUserId: user.id } });
      await this.issueVerification(user.id, email);
    }
    // Else: a verified account, or a still-fresh unverified one, already
    // owns this email — do nothing, but the response below never says so.

    return { message: "If that email can be used, check your inbox for a confirmation link." };
  }

  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    const candidates = await this.prisma.emailVerificationToken.findMany({
      where: { expiresAt: { gt: new Date() } },
    });

    for (const candidate of candidates) {
      if (await argon2.verify(candidate.hashedToken, token)) {
        await this.prisma.merchantUser.update({
          where: { id: candidate.merchantUserId },
          data: { emailVerifiedAt: new Date() },
        });
        await this.prisma.emailVerificationToken.delete({ where: { id: candidate.id } });
        return { verified: true };
      }
    }
    return { verified: false };
  }

  private isStaleUnverified(user: { emailVerifiedAt: Date | null; createdAt: Date }): boolean {
    return !user.emailVerifiedAt && Date.now() - user.createdAt.getTime() > VERIFICATION_TTL_MS;
  }

  private async issueVerification(merchantUserId: string, email: string): Promise<void> {
    const token = generateSecretPart();
    const hashedToken = await argon2.hash(token);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await this.prisma.emailVerificationToken.create({ data: { merchantUserId, hashedToken, expiresAt } });
    await this.emailProvider.send({
      to: email,
      subject: "Confirm your pagosYa dashboard login",
      body: `Confirm this email to activate your pagosYa dashboard login:\nGET /v1/dashboard/verify_email?token=${token}\n\nThis link expires in 24 hours. If you didn't request this, ignore it.`,
    });
  }
}
