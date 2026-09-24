import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { LimitsService } from "./limits.service";

const bob = (centavos: number) => `Bs ${(centavos / 100).toLocaleString("es-BO", { maximumFractionDigits: 0 })}`;

@Injectable()
export class LimitsWarningService {
  private readonly logger = new Logger(LimitsWarningService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly limits: LimitsService,
  ) {}

  /** Best effort, after the confirm commits: a mail outage must never affect a payment. */
  async notify(merchantId: string): Promise<void> {
    try {
      const usage = await this.limits.usage(merchantId);
      const users = await this.prisma.merchantUser.findMany({ where: { merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
      const resets = new Date(usage.resetsAt).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" });
      for (const user of users) {
        await this.email.send({
          to: user.email,
          subject: "Llegaste al 80% de tu límite mensual en pagosYa",
          body: `Este mes ya cobraste ${bob(usage.used)} de ${bob(usage.monthlyLimit ?? 0)} permitidos para tu nivel ${usage.levelName}.\n\nAl llegar al 100% pausaremos los cobros en vivo hasta el ${resets} o hasta que subas de nivel desde tu panel (Verificación).`,
        }).catch((error) => this.logger.warn(`80% limit email to ${user.email} failed: ${(error as Error).message}`));
      }
    } catch (error) {
      this.logger.warn(`80% limit warning for ${merchantId} failed: ${(error as Error).message}`);
    }
  }
}
