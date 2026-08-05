import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface VerifiedSession {
  merchantId: string;
  merchantUserId: string;
  email: string;
}

/** Issues/verifies/revokes dash_... dashboard session tokens — what lets apps/merchant-dashboard authenticate without ever holding a secret key. */
@Injectable()
export class MerchantSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<{ token: string; expiresAt: Date; merchant: { id: string } }> {
    const user = await this.prisma.merchantUser.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.hashedPassword, password))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    // Checked after the password match, so this never adds a new
    // enumeration signal — reaching this point already requires knowing
    // both the email and its correct password.
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException("Confirm your email before logging in — check your inbox for the verification link.");
    }

    const token = `dash_${generateSecretPart()}`;
    const hashedToken = await argon2.hash(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.merchantSession.create({
      data: { merchantUserId: user.id, merchantId: user.merchantId, hashedToken, expiresAt },
    });

    return { token, expiresAt, merchant: { id: user.merchantId } };
  }

  async verify(presentedToken: string): Promise<VerifiedSession | null> {
    if (!presentedToken.startsWith("dash_")) return null;

    const candidates = await this.prisma.merchantSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      include: { merchantUser: true },
    });

    for (const candidate of candidates) {
      if (await argon2.verify(candidate.hashedToken, presentedToken)) {
        return { merchantId: candidate.merchantId, merchantUserId: candidate.merchantUserId, email: candidate.merchantUser.email };
      }
    }
    return null;
  }

  async revoke(presentedToken: string): Promise<void> {
    const candidates = await this.prisma.merchantSession.findMany({ where: { revokedAt: null } });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.hashedToken, presentedToken)) {
        await this.prisma.merchantSession.update({ where: { id: candidate.id }, data: { revokedAt: new Date() } });
        return;
      }
    }
  }
}
