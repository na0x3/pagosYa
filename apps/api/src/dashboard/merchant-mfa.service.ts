import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { generateTotpSecret, totpEnrollment, verifyTotp } from "../auth/totp";

/** What a client sees when a code is missing: it shows the code field and sends the same request again with it. */
export const MFA_REQUIRED = { code: "mfa_required", message: "Escribe el código de 6 dígitos de tu app de verificación" } as const;

/**
 * The merchant's optional second factor (ISO M-09): authenticator-app codes, asked at sign-in once turned on, and asked
 * again to change the payout account. Where MERCHANT_MFA_FOR_SENSITIVE is on (production), changing the payout account
 * needs codes turned on first. The secret is stored encrypted; each code is accepted once.
 */
@Injectable()
export class MerchantMfaService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private async user(userId: string) {
    const user = await this.prisma.merchantUser.findUnique({ where: { id: userId }, select: { id: true, email: true, totpSecret: true, totpEnabledAt: true, totpLastStep: true } });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return user;
  }

  async status(userId: string) {
    const user = await this.user(userId);
    return { enabled: Boolean(user.totpEnabledAt), requiredForPayoutChange: this.config?.get<boolean>("app.merchantMfaForSensitive") ?? false };
  }

  /** Accepts a code once: the matched step is recorded under a condition, so two requests cannot both spend it. */
  async spendCode(user: { id: string; totpSecret: string | null; totpLastStep: number | null }, code: string | undefined) {
    if (!code) throw new UnauthorizedException(MFA_REQUIRED);
    const step = user.totpSecret ? verifyTotp(user.totpSecret, code, user.totpLastStep) : null;
    const claimed = step === null ? { count: 0 } : await this.prisma.merchantUser.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (claimed.count !== 1) throw new UnauthorizedException({ code: "mfa_invalid", message: "Código incorrecto o ya usado" });
  }

  async beginSetup(userId: string) {
    const user = await this.user(userId);
    if (user.totpEnabledAt) throw new ConflictException("La verificación en dos pasos ya está activa");
    const secret = generateTotpSecret();
    await this.prisma.merchantUser.update({ where: { id: user.id }, data: { totpSecret: secret, totpLastStep: null } });
    return totpEnrollment(secret, user.email);
  }

  async confirmSetup(userId: string, code: string) {
    const user = await this.user(userId);
    if (user.totpEnabledAt) throw new ConflictException("La verificación en dos pasos ya está activa");
    if (!user.totpSecret) throw new ForbiddenException("Empieza la configuración primero");
    await this.spendCode(user, code);
    await this.prisma.merchantUser.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
    return { enabled: true };
  }

  /** Turning it off takes a current code, so a stolen session alone cannot remove the second factor. */
  async disable(userId: string, code: string) {
    const user = await this.user(userId);
    if (!user.totpEnabledAt) return { enabled: false };
    await this.spendCode(user, code);
    await this.prisma.merchantUser.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } });
    return { enabled: false };
  }

  /** Before changing where payouts go: a code from whoever has codes on; without codes, refused where they are required. */
  async assertForPayoutChange(userId: string, code: string | undefined) {
    const user = await this.user(userId);
    if (user.totpEnabledAt) return this.spendCode(user, code);
    if (this.config?.get<boolean>("app.merchantMfaForSensitive")) {
      throw new ForbiddenException({ code: "mfa_setup_required", message: "Activa la verificación en dos pasos (Perfil → Seguridad) para cambiar tu cuenta de desembolsos" });
    }
  }
}
