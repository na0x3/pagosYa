import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { MerchantStatus, PaymentIntentStatus, StoreStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { GoogleIdentityService } from "../auth/google-identity.service";
import { PrismaService } from "../prisma/prisma.service";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_DIGEST_PREFIX = "sha256:";
const MAX_ACTIVE_SESSIONS = 3;
const BOLIVIA_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;
const PROGRESS_XP_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900] as const;
const PROGRESS_XP_PER_SALE = 50;
const PROGRESS_XP_PER_VIEW = 2;
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$iNitUreVTOKDmListKakeA$2UL/nhkgJAcR8sy79xX2X7AoVYa3vNozG+qCzJfh5Fg";

function digestSessionToken(token: string): string {
  return SESSION_DIGEST_PREFIX + createHash("sha256").update(token).digest("hex");
}

function boliviaDayStart(now: Date): Date {
  const local = new Date(now.getTime() - BOLIVIA_UTC_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4));
}

export interface VerifiedSession {
  merchantId: string;
  merchantUserId: string;
  email: string;
}

/** Issues/verifies/revokes dash_... dashboard session tokens — what lets apps/merchant-dashboard authenticate without ever holding a secret key. */
@Injectable()
export class MerchantSessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly google?: GoogleIdentityService,
  ) {}

  async login(emailInput: string, password: string): Promise<{ token: string; expiresAt: Date; merchant: { id: string }; user: { email: string } }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.merchantUser.findUnique({ where: { email } });
    const passwordMatches = await argon2.verify(user?.hashedPassword ?? DUMMY_PASSWORD_HASH, password);
    if (!user || user.deletedAt || !passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }
    // Checked after the password match, so this never adds a new
    // enumeration signal — reaching this point already requires knowing
    // both the email and its correct password.
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException("Confirm your email before logging in — check your inbox for the verification link.");
    }

    return this.issueSession(user);
  }

  async loginWithGoogle(credential: string): Promise<{ token: string; expiresAt: Date; merchant: { id: string }; user: { email: string } }> {
    if (!this.google) throw new ServiceUnavailableException("El acceso con Google todavía no está disponible");
    const identity = await this.google.verifyCredential(credential);
    let user = await this.prisma.merchantUser.findUnique({ where: { googleSubject: identity.subject } });
    if (!user) {
      user = await this.prisma.merchantUser.findUnique({ where: { email: identity.email } });
      if (!user || user.deletedAt) {
        throw new ForbiddenException("Esta cuenta Google no tiene acceso a un comercio. Solicita una invitación primero.");
      }
      if (!identity.emailAuthoritative) {
        throw new ForbiddenException("Ingresa con tu contraseña antes de vincular este correo de Google");
      }
      user = await this.prisma.merchantUser.update({
        where: { id: user.id },
        data: { googleSubject: identity.subject, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    }
    if (user.deletedAt) throw new ForbiddenException("Esta cuenta comercial fue eliminada");
    return this.issueSession(user);
  }

  private async issueSession(user: { id: string; merchantId: string; email: string }) {
    const token = `dash_${generateSecretPart()}`;
    // Session tokens carry ~190 bits of randomness, so a deterministic SHA-256
    // digest is safe for lookup and avoids running password hashing on every
    // dashboard request. Argon2 remains mandatory for human passwords.
    const hashedToken = digestSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const issuedSession = await this.prisma.$transaction(async (tx) => {
      // Serialize session issuance per user across API replicas. Without this,
      // simultaneous logins can both decide they are the primary session or
      // briefly exceed the three-session cap.
      if (typeof tx.$executeRawUnsafe === "function") {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", user.id);
      }
      await tx.merchantSession.updateMany({
        where: { merchantUserId: user.id, isPrimary: true, expiresAt: { lte: new Date() } },
        data: { isPrimary: false },
      });
      const activePrimary = await tx.merchantSession.findFirst({
        where: { merchantUserId: user.id, isPrimary: true, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      const isPrimary = !activePrimary;
      const createdSession = await tx.merchantSession.create({
        data: {
          merchantUserId: user.id,
          merchantId: user.merchantId,
          hashedToken,
          profileName: isPrimary ? "Propietario" : "Seleccionar perfil",
          profileAvatarId: 1,
          isPrimary,
          expiresAt,
        },
      });

      const excessSessions = await tx.merchantSession.findMany({
        where: { merchantUserId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: MAX_ACTIVE_SESSIONS,
        select: { id: true },
      });
      if (excessSessions.length) {
        await tx.merchantSession.updateMany({
          where: { id: { in: excessSessions.map((session) => session.id) } },
          data: { revokedAt: new Date() },
        });
      }
      return createdSession;
    });

    return {
      token,
      expiresAt,
      merchant: { id: user.merchantId },
      user: { email: user.email },
      session: issuedSession ? {
        id: issuedSession.id,
        profileName: issuedSession.profileName,
        profileAvatarId: issuedSession.profileAvatarId,
        isPrimary: issuedSession.isPrimary,
      } : undefined,
    };
  }

  async claimDailyLoginStar(merchantUserId: string, now = new Date()) {
    const dayStart = boliviaDayStart(now);
    const nextRewardAt = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const update = await tx.merchantUser.updateMany({
        where: {
          id: merchantUserId,
          OR: [
            { lastDailyStarAt: null },
            { lastDailyStarAt: { lt: dayStart } },
          ],
        },
        data: {
          dailyLoginStars: { increment: 1 },
          lastDailyStarAt: now,
        },
      });
      const user = await tx.merchantUser.findUniqueOrThrow({
        where: { id: merchantUserId },
        select: { dailyLoginStars: true, lastDailyStarAt: true },
      });

      return {
        awarded: update.count === 1,
        totalStars: user.dailyLoginStars,
        awardedAt: user.lastDailyStarAt,
        nextRewardAt,
      };
    });
  }

  private async authoritativeProgressLevel(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, viewCount: true } });
    if (!store) throw new NotFoundException("Tienda no encontrada");
    const paymentCount = await this.prisma.paymentIntent.count({
      where: {
        merchantId,
        status: PaymentIntentStatus.SUCCEEDED,
        metadata: { path: ["storeId"], equals: storeId },
      },
    });
    const xp = paymentCount * PROGRESS_XP_PER_SALE + store.viewCount * PROGRESS_XP_PER_VIEW;
    return PROGRESS_XP_THRESHOLDS.reduce<number>((level, threshold, index) => xp >= threshold ? index : level, 0);
  }

  async pendingProgressCelebrations(merchantId: string, merchantUserId: string, storeId: string) {
    const currentLevel = await this.authoritativeProgressLevel(merchantId, storeId);
    const previous = await this.prisma.merchantProgressCelebration.findUnique({
      where: { merchantUserId_storeId: { merchantUserId, storeId } },
    });
    const lastCelebratedLevel = previous?.lastCelebratedLevel ?? -1;
    const newlyUnlockedLevels = !previous
      ? [currentLevel]
      : currentLevel > lastCelebratedLevel
        ? Array.from({ length: currentLevel - lastCelebratedLevel }, (_, index) => lastCelebratedLevel + index + 1)
        : [];
    return { newlyUnlockedLevels, lastCelebratedLevel, currentLevel };
  }

  async acknowledgeProgressCelebration(merchantId: string, merchantUserId: string, storeId: string, level: number) {
    const currentLevel = await this.authoritativeProgressLevel(merchantId, storeId);
    if (level > currentLevel) throw new BadRequestException("Ese nivel todavía no fue alcanzado");

    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.merchantProgressCelebration.findUnique({
        where: { merchantUserId_storeId: { merchantUserId, storeId } },
      });
      if (!previous) {
        if (level !== currentLevel) throw new BadRequestException("Confirma primero el compañero pendiente");
        await tx.merchantProgressCelebration.create({
          data: { merchantUserId, storeId, lastCelebratedLevel: level },
        });
        return { acknowledgedLevel: level };
      }

      if (level <= previous.lastCelebratedLevel) return { acknowledgedLevel: previous.lastCelebratedLevel };
      if (level !== previous.lastCelebratedLevel + 1) throw new BadRequestException("Confirma los compañeros en orden");
      await tx.merchantProgressCelebration.update({
        where: { merchantUserId_storeId: { merchantUserId, storeId } },
        data: { lastCelebratedLevel: level },
      });
      return { acknowledgedLevel: level };
    });
  }

  async verify(presentedToken: string): Promise<VerifiedSession | null> {
    if (!presentedToken.startsWith("dash_")) return null;

    const digest = digestSessionToken(presentedToken);
    const session = await this.prisma.merchantSession.findFirst({
      where: { hashedToken: digest, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { merchantUser: true },
    });
    if (session && !session.merchantUser.deletedAt) {
      return { merchantId: session.merchantId, merchantUserId: session.merchantUserId, email: session.merchantUser.email };
    }

    return null;
  }

  async revoke(presentedToken: string): Promise<void> {
    const digest = digestSessionToken(presentedToken);
    const session = await this.prisma.merchantSession.findFirst({ where: { hashedToken: digest, revokedAt: null } });
    if (session) {
      await this.revokeStoredSession(session);
      return;
    }

  }

  private async revokeStoredSession(session: { id: string; merchantUserId?: string; isPrimary?: boolean }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.merchantSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), isPrimary: false } });
      if (!session.isPrimary || !session.merchantUserId) return;
      const nextPrimary = await tx.merchantSession.findFirst({
        where: { merchantUserId: session.merchantUserId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (nextPrimary) {
        await tx.merchantSession.update({ where: { id: nextPrimary.id }, data: { isPrimary: true } });
      }
    });
  }

  async listActiveSessions(merchantUserId: string, presentedToken: string) {
    const [sessions, recentProfileSessions] = await Promise.all([
      this.prisma.merchantSession.findMany({
        where: { merchantUserId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          hashedToken: true,
          profileName: true,
          profileAvatarId: true,
          isPrimary: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
      this.prisma.merchantSession.findMany({
        where: { merchantUserId, profileName: { not: "Seleccionar perfil" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
        select: { profileName: true, profileAvatarId: true },
      }),
    ]);
    const currentDigest = digestSessionToken(presentedToken);
    const currentSession = sessions.find((session) => session.hashedToken === currentDigest);
    const profileKeys = new Set<string>();
    const profiles = recentProfileSessions.reduce<Array<{ profileName: string; profileAvatarId: number }>>((result, session) => {
      const key = `${session.profileName.trim().toLocaleLowerCase("es")}:${session.profileAvatarId}`;
      if (!session.profileName.trim() || profileKeys.has(key) || result.length >= MAX_ACTIVE_SESSIONS) return result;
      profileKeys.add(key);
      result.push({ profileName: session.profileName, profileAvatarId: session.profileAvatarId });
      return result;
    }, []);

    return {
      limit: MAX_ACTIVE_SESSIONS,
      active: sessions.length,
      profiles,
      currentSessionId: currentSession?.id ?? null,
      canManageSessions: currentSession?.isPrimary ?? false,
      sessions: sessions.map((session) => ({
        id: session.id,
        profileName: session.profileName,
        profileAvatarId: session.profileAvatarId,
        isPrimary: session.isPrimary,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        current: session.hashedToken === currentDigest,
      })),
    };
  }

  async revokeSessionById(merchantUserId: string, sessionId: string, presentedToken: string) {
    const now = new Date();
    const requester = await this.prisma.merchantSession.findFirst({
      where: {
        merchantUserId,
        hashedToken: digestSessionToken(presentedToken),
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!requester) throw new UnauthorizedException("Invalid or expired session");

    const session = await this.prisma.merchantSession.findFirst({
      where: { id: sessionId, merchantUserId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!session) return { revoked: false, current: false };

    const current = session.id === requester.id;
    if (!current && !requester.isPrimary) {
      throw new ForbiddenException("Solo la sesión principal puede cerrar otros perfiles");
    }
    await this.revokeStoredSession(session);
    return { revoked: true, current };
  }

  async updateSessionIdentity(
    merchantUserId: string,
    sessionId: string,
    presentedToken: string,
    profileName: string,
    profileAvatarId: number,
  ) {
    const normalizedName = profileName.trim().replace(/\s+/g, " ");
    if (!normalizedName) throw new BadRequestException("El nombre del perfil es obligatorio");
    if (normalizedName.length > 32) throw new BadRequestException("El nombre del perfil no puede superar 32 caracteres");
    if (!Number.isInteger(profileAvatarId) || profileAvatarId < 1 || profileAvatarId > 4) {
      throw new BadRequestException("El avatar del perfil no es válido");
    }

    const now = new Date();
    const requester = await this.prisma.merchantSession.findFirst({
      where: {
        merchantUserId,
        hashedToken: digestSessionToken(presentedToken),
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!requester) throw new UnauthorizedException("Invalid or expired session");

    const target = await this.prisma.merchantSession.findFirst({
      where: { id: sessionId, merchantUserId, revokedAt: null, expiresAt: { gt: now } },
    });
    if (!target) throw new NotFoundException("La sesión ya no está activa");
    if (requester.id !== target.id && !requester.isPrimary) {
      throw new ForbiddenException("Solo la sesión principal puede renombrar otros perfiles");
    }

    const updated = await this.prisma.merchantSession.update({
      where: { id: target.id },
      data: { profileName: normalizedName, profileAvatarId },
      select: { id: true, profileName: true, profileAvatarId: true, isPrimary: true },
    });
    return { session: updated };
  }

  async deactivateAccount(merchantId: string, merchantUserId: string) {
    const user = await this.prisma.merchantUser.findFirst({ where: { id: merchantUserId, merchantId } });
    if (!user || user.deletedAt) return { deactivated: true, merchantSuspended: false };

    const activeUsers = await this.prisma.merchantUser.count({ where: { merchantId, deletedAt: null } });
    const lastActiveUser = activeUsers <= 1;
    const now = new Date();
    const replacementPassword = await argon2.hash(generateSecretPart() + generateSecretPart());
    const emailHash = createHash("sha256").update(user.email.trim().toLowerCase()).digest("hex");
    const googleSubjectHash = user.googleSubject
      ? createHash("sha256").update(user.googleSubject).digest("hex")
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.merchantUser.update({
        where: { id: user.id },
        data: {
          email: `deleted.${user.id}@privacy.invalid`,
          hashedPassword: replacementPassword,
          googleSubject: null,
          deletedAt: now,
        },
      });
      await tx.emailVerificationToken.deleteMany({ where: { merchantUserId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { merchantUserId: user.id } });
      await tx.merchantSession.updateMany({
        where: lastActiveUser ? { merchantId, revokedAt: null } : { merchantUserId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });

      if (lastActiveUser) {
        await tx.merchant.update({ where: { id: merchantId }, data: { status: MerchantStatus.SUSPENDED } });
        await tx.store.updateMany({ where: { merchantId, status: StoreStatus.ACTIVE }, data: { status: StoreStatus.ARCHIVED } });
        await tx.apiKey.updateMany({ where: { merchantId, revokedAt: null }, data: { revokedAt: now } });
        await tx.webhookEndpoint.updateMany({ where: { merchantId, status: "ACTIVE" }, data: { status: "DELETED" } });
      }

      await tx.auditLogEntry.create({
        data: {
          actorType: "MERCHANT_USER",
          actorId: user.id,
          actorLabel: `merchant-user:${user.id}`,
          action: "ACCOUNT_DEACTIVATED",
          targetType: "Merchant",
          targetId: merchantId,
          metadata: {
            emailHash,
            googleSubjectHash,
            merchantSuspended: lastActiveUser,
            retainedEvidence: [
              "NIT_KYC",
              "INVOICES",
              "PAYMENTS_TRANSACTIONS_LEDGER",
              "PAYOUTS",
              "ORDERS_FULFILLMENT_EVENTS",
              "SUPPORT_AUDIT_WEBHOOKS",
            ],
          },
        },
      });
    });

    return { deactivated: true, merchantSuspended: lastActiveUser };
  }
}
