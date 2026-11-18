import { ConflictException, ForbiddenException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import { OpsRole } from "@prisma/client";
import { generateTotpSecret, totpEnrollment, verifyTotp } from "../auth/totp";
import { AuditLogService } from "./audit-log.service";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);
/** A working day: the ISO report asks for 8 to 12 h. */
export const OPS_SESSION_TTL_MS = 10 * 60 * 60 * 1000;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

type OpsIdentity = { id: string; name: string; email: string; role: OpsRole };
const identity = (user: OpsIdentity): OpsIdentity => ({ id: user.id, name: user.name, email: user.email, role: user.role });

/**
 * Per-person credentials for pagosYa staff doing ops review (KYC today).
 * Mirrors ApiKeyService's issue/verify shape, but there's no meaningful
 * prefix to narrow lookup by (a handful of staff, not thousands of keys),
 * so the ops_ token check just scans active users and argon2-verifies each.
 *
 * Second factor (ISO A-01): the ops_ token plus an authenticator code starts a
 * 10 h opss_ session, and the session is what reaches the API. Once a person has
 * turned codes on, or wherever OPS_MFA_REQUIRED is on (production), the ops_
 * token alone is refused.
 */
@Injectable()
export class OpsUserService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly auditLog?: AuditLogService,
  ) {}

  private get mfaRequired() { return this.config?.get<boolean>("app.opsMfaRequired") ?? false; }

  async create(
    name: string,
    email: string,
    role: OpsRole = OpsRole.SUPPORT_AGENT,
  ): Promise<{ user: OpsIdentity; fullToken: string }> {
    const fullToken = `ops_${generateSecretPart()}`;
    const hashedToken = await argon2.hash(fullToken);
    const user = await this.prisma.opsUser.create({ data: { name, email, hashedToken, role } });
    return { user: identity(user), fullToken };
  }

  async revoke(id: string) {
    const [user] = await this.prisma.$transaction([
      this.prisma.opsUser.update({ where: { id }, data: { revokedAt: new Date() } }),
      this.prisma.opsSession.updateMany({ where: { opsUserId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return user;
  }

  /** Who a bearer value belongs to: an opss_ session, or (only without the second factor) the bare ops_ token. */
  async verify(presentedToken: string): Promise<OpsIdentity | null> {
    if (presentedToken.startsWith("opss_")) {
      const session = await this.prisma.opsSession.findUnique({ where: { hashedToken: digest(presentedToken) }, include: { opsUser: true } });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || session.opsUser.revokedAt) return null;
      return identity(session.opsUser);
    }
    const user = await this.byToken(presentedToken);
    if (!user || this.mfaRequired || user.totpEnabledAt) return null;
    return identity(user);
  }

  private async byToken(presentedToken: string) {
    if (!presentedToken.startsWith("ops_")) return null;
    const candidates = await this.prisma.opsUser.findMany({ where: { revokedAt: null } });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.hashedToken, presentedToken)) return candidate;
    }
    return null;
  }

  private async requireToken(token: string) {
    const user = await this.byToken(token ?? "");
    if (!user) throw new UnauthorizedException("Token de operaciones inválido");
    return user;
  }

  /** Spends a code: matched against the secret and recorded, so the same code cannot start a second session. */
  private async spendCode(user: { id: string; totpSecret: string | null; totpLastStep: number | null }, code: string | undefined) {
    const step = user.totpSecret ? verifyTotp(user.totpSecret, code ?? "", user.totpLastStep) : null;
    if (step === null) throw new UnauthorizedException("Código incorrecto o ya usado");
    const claimed = await this.prisma.opsUser.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (claimed.count !== 1) throw new UnauthorizedException("Código incorrecto o ya usado");
  }

  /** ops_ token + code → a session token. Without codes set up: refused where they are required, else a session anyway. */
  async startSession(token: string, code: string | undefined, ip?: string) {
    const user = await this.requireToken(token);
    if (user.totpEnabledAt) await this.spendCode(user, code);
    else if (this.mfaRequired) throw new ForbiddenException({ message: "Configura tu código de verificación antes de entrar", code: "mfa_setup_required" });
    const sessionToken = `opss_${generateSecretPart()}`;
    const expiresAt = new Date(Date.now() + OPS_SESSION_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      await tx.opsSession.create({ data: { opsUserId: user.id, hashedToken: digest(sessionToken), expiresAt, ip: ip ?? null } });
      await this.auditLog?.record(tx, {
        actorType: "OPS_USER", actorId: user.id, actorLabel: `${user.name} <${user.email}>`, action: "ops.session_started",
        targetType: "OpsUser", targetId: user.id, metadata: { ip: ip ?? null, withCode: Boolean(user.totpEnabledAt) },
      });
    });
    return { sessionToken, expiresAt, user: identity(user) };
  }

  async endSession(sessionToken: string) {
    if (!sessionToken?.startsWith("opss_")) return;
    await this.prisma.opsSession.updateMany({ where: { hashedToken: digest(sessionToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** First step of setting up codes: a new secret (kept unconfirmed) and what the authenticator app scans. */
  async beginMfaSetup(token: string) {
    const user = await this.requireToken(token);
    if (user.totpEnabledAt) throw new ConflictException("Tu código ya está configurado. Pide a un administrador que lo restablezca si perdiste el teléfono.");
    const secret = generateTotpSecret();
    await this.prisma.opsUser.update({ where: { id: user.id }, data: { totpSecret: secret, totpLastStep: null } });
    return totpEnrollment(secret, user.email, "pagosYa ops");
  }

  /** Second step: the first code from the app proves it was saved; from now on the ops_ token alone is refused. */
  async confirmMfaSetup(token: string, code: string) {
    const user = await this.requireToken(token);
    if (user.totpEnabledAt) throw new ConflictException("Tu código ya está configurado");
    if (!user.totpSecret) throw new ForbiddenException("Empieza la configuración primero");
    await this.spendCode(user, code);
    await this.prisma.$transaction(async (tx) => {
      await tx.opsUser.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
      await this.auditLog?.record(tx, {
        actorType: "OPS_USER", actorId: user.id, actorLabel: `${user.name} <${user.email}>`, action: "ops.mfa_enabled",
        targetType: "OpsUser", targetId: user.id,
      });
    });
    return { enabled: true };
  }

  /** A lost phone: an administrator (INTERNAL_OPS_SECRET) clears the codes and ends every session of that person. */
  async resetMfa(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.opsUser.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } });
      await tx.opsSession.updateMany({ where: { opsUserId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.auditLog?.record(tx, {
        actorType: "INTERNAL", actorId: "internal-ops-secret", actorLabel: "INTERNAL_OPS_SECRET", action: "ops.mfa_reset",
        targetType: "OpsUser", targetId: user.id,
      });
    });
    return { reset: true };
  }
}
