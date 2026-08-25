import { BadRequestException, ForbiddenException, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConsumerAffiliationStatus, Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { GoogleIdentityService } from "../auth/google-identity.service";
import { normalizeCustomerDocument } from "../debt-collections/debt-collections.service";
import { PrismaService } from "../prisma/prisma.service";

const secretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 32);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const digest = (token: string) => `sha256:${createHash("sha256").update(token).digest("hex")}`;
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$iNitUreVTOKDmListKakeA$2UL/nhkgJAcR8sy79xX2X7AoVYa3vNozG+qCzJfh5Fg";

@Injectable()
export class ConsumerSessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly google?: GoogleIdentityService,
  ) {}

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.consumerUser.findUnique({ where: { email } });
    const passwordMatches = await argon2.verify(user?.hashedPassword ?? DUMMY_PASSWORD_HASH, password);
    if (!user || user.deletedAt || !passwordMatches) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    if (!user.emailVerifiedAt) throw new UnauthorizedException("Confirma tu correo antes de ingresar");

    return this.issueSession(user.id);
  }

  async loginWithGoogle(credential: string, carnetInput?: string) {
    if (!this.google) throw new ServiceUnavailableException("El acceso con Google todavía no está disponible");
    const identity = await this.google.verifyCredential(credential);
    let user = await this.prisma.consumerUser.findUnique({ where: { googleSubject: identity.subject } });

    if (!user) {
      user = await this.prisma.consumerUser.findUnique({ where: { email: identity.email } });
      if (user) {
        if (user.deletedAt) throw new ForbiddenException("Esta cuenta fue eliminada");
        if (!identity.emailAuthoritative) {
          throw new ForbiddenException("Ingresa con tu contraseña antes de vincular este correo de Google");
        }
        user = await this.prisma.consumerUser.update({
          where: { id: user.id },
          data: { googleSubject: identity.subject, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
        });
      } else {
        const carnet = normalizeCustomerDocument(carnetInput ?? "");
        if (carnet.length < 4) {
          throw new BadRequestException("Escribe tu carnet/CI para crear la cuenta con Google");
        }
        const claimedCarnet = await this.prisma.consumerUser.findUnique({ where: { carnet } });
        if (claimedCarnet) throw new BadRequestException("No se pudo crear la cuenta con esos datos");
        user = await this.prisma.consumerUser.create({
          data: {
            name: identity.name.slice(0, 100),
            email: identity.email,
            carnet,
            hashedPassword: await argon2.hash(secretPart() + secretPart()),
            googleSubject: identity.subject,
            emailVerifiedAt: new Date(),
          },
        });
      }
    }

    if (user.deletedAt) throw new ForbiddenException("Esta cuenta fue eliminada");
    await this.attachHistoricalPurchases(user.id, user.email);
    return this.issueSession(user.id);
  }

  private async issueSession(consumerUserId: string) {
    const token = `consumer_${secretPart()}`;
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.consumerSession.create({
      data: { consumerUserId, hashedToken: digest(token), expiresAt },
    });
    return { token, expiresAt };
  }

  async verify(token: string) {
    if (!token.startsWith("consumer_")) return null;
    const session = await this.prisma.consumerSession.findUnique({
      where: { hashedToken: digest(token) },
      include: { consumerUser: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.consumerUser.deletedAt || !session.consumerUser.emailVerifiedAt) return null;
    return session.consumerUser;
  }

  async revoke(token: string) {
    await this.prisma.consumerSession.updateMany({
      where: { hashedToken: digest(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async deactivateAccount(consumerUserId: string) {
    const user = await this.prisma.consumerUser.findUnique({ where: { id: consumerUserId } });
    if (!user || user.deletedAt) return { deactivated: true };

    const now = new Date();
    const emailHash = createHash("sha256").update(user.email.trim().toLowerCase()).digest("hex");
    const carnetHash = createHash("sha256").update(user.carnet).digest("hex");
    const googleSubjectHash = user.googleSubject
      ? createHash("sha256").update(user.googleSubject).digest("hex")
      : null;
    const replacementPassword = await argon2.hash(secretPart() + secretPart());

    await this.prisma.$transaction(async (tx) => {
      await tx.consumerUser.update({
        where: { id: user.id },
        data: {
          name: "Cuenta eliminada",
          email: `deleted.${user.id}@privacy.invalid`,
          carnet: `deleted-${user.id}`,
          hashedPassword: replacementPassword,
          googleSubject: null,
          deletedAt: now,
        },
      });
      await tx.consumerSession.updateMany({ where: { consumerUserId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.consumerVerificationToken.deleteMany({ where: { consumerUserId: user.id } });
      await tx.consumerInstitutionAffiliation.updateMany({
        where: { consumerUserId: user.id, status: ConsumerAffiliationStatus.ACTIVE },
        data: { status: ConsumerAffiliationStatus.REVOKED, revokedAt: now },
      });
      await tx.auditLogEntry.create({
        data: {
          actorType: "CONSUMER_USER",
          actorId: user.id,
          actorLabel: `consumer-user:${user.id}`,
          action: "ACCOUNT_DEACTIVATED",
          targetType: "ConsumerUser",
          targetId: user.id,
          metadata: {
            emailHash,
            carnetHash,
            googleSubjectHash,
            retainedEvidence: ["PAYMENT_INTENTS", "STORE_ORDERS", "FULFILLMENT_EVENTS", "INVOICES"],
          },
        },
      });
    });
    return { deactivated: true };
  }

  private async attachHistoricalPurchases(consumerUserId: string, email: string) {
    const intents = await this.prisma.paymentIntent.findMany({
      where: { consumerUserId: null, customerEmail: { equals: email, mode: Prisma.QueryMode.insensitive } },
      select: { id: true },
    });
    const ids = intents.map((intent) => intent.id);
    if (!ids.length) return;
    await this.prisma.$transaction([
      this.prisma.paymentIntent.updateMany({ where: { id: { in: ids } }, data: { consumerUserId } }),
      this.prisma.storeOrder.updateMany({ where: { paymentIntentId: { in: ids } }, data: { consumerUserId } }),
    ]);
  }
}
