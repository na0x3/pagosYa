import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_DIGEST_PREFIX = "sha256:";

function digestSessionToken(token: string): string {
  return SESSION_DIGEST_PREFIX + createHash("sha256").update(token).digest("hex");
}

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
    // Session tokens carry ~190 bits of randomness, so a deterministic SHA-256
    // digest is safe for lookup and avoids running password hashing on every
    // dashboard request. Argon2 remains mandatory for human passwords.
    const hashedToken = digestSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.merchantSession.create({
      data: { merchantUserId: user.id, merchantId: user.merchantId, hashedToken, expiresAt },
    });

    return { token, expiresAt, merchant: { id: user.merchantId } };
  }

  async verify(presentedToken: string): Promise<VerifiedSession | null> {
    if (!presentedToken.startsWith("dash_")) return null;

    const digest = digestSessionToken(presentedToken);
    const session = await this.prisma.merchantSession.findFirst({
      where: { hashedToken: digest, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { merchantUser: true },
    });
    if (session) {
      return { merchantId: session.merchantId, merchantUserId: session.merchantUserId, email: session.merchantUser.email };
    }

    // Compatibility path for sessions issued before deterministic digests were
    // introduced. A successful legacy verification upgrades that row, so each
    // old session pays the Argon2 cost at most once.
    const legacyCandidates = await this.prisma.merchantSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      include: { merchantUser: true },
    });

    for (const candidate of legacyCandidates) {
      if (candidate.hashedToken.startsWith(SESSION_DIGEST_PREFIX)) continue;
      if (await argon2.verify(candidate.hashedToken, presentedToken)) {
        await this.prisma.merchantSession.update({ where: { id: candidate.id }, data: { hashedToken: digest } });
        return { merchantId: candidate.merchantId, merchantUserId: candidate.merchantUserId, email: candidate.merchantUser.email };
      }
    }
    return null;
  }

  async revoke(presentedToken: string): Promise<void> {
    const digest = digestSessionToken(presentedToken);
    const session = await this.prisma.merchantSession.findFirst({ where: { hashedToken: digest, revokedAt: null } });
    if (session) {
      await this.prisma.merchantSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return;
    }

    const legacyCandidates = await this.prisma.merchantSession.findMany({ where: { revokedAt: null } });
    for (const candidate of legacyCandidates) {
      if (candidate.hashedToken.startsWith(SESSION_DIGEST_PREFIX)) continue;
      if (await argon2.verify(candidate.hashedToken, presentedToken)) {
        await this.prisma.merchantSession.update({ where: { id: candidate.id }, data: { revokedAt: new Date() } });
        return;
      }
    }
  }
}
