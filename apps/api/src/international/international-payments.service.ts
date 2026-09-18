import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { dlocalChargesAllowed, type DlocalConfig } from "../config/configuration";
import { DlocalClientService } from "../rails/adapters/dlocal/dlocal-client.service";
import type { DlocalPaymentMethod } from "../rails/adapters/dlocal/dlocal.types";
import { AuditLogService } from "../ops/audit-log.service";
import { SupportActor, actorLabel } from "../ops/support.service";
import { FxRateUnavailableError, resolveChargeAmount } from "./fx";

const METHODS_TTL_MS = 60 * 60_000;

export interface InternationalMethodsResponse {
  country: string;
  quote: { amount: number; currency: "USD"; originalAmount: number; originalCurrency: string; rate: number };
  methods: { id: string; kind: "CARD" | "LOCAL_METHOD"; name: string; logo: string | null }[];
}

@Injectable()
export class InternationalPaymentsService {
  private readonly methodsCache = new Map<string, { at: number; methods: DlocalPaymentMethod[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: DlocalClientService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  private get cfg(): DlocalConfig {
    return this.config.get<DlocalConfig>("app.dlocal")!;
  }

  async statusFor(merchantId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const kyc = await this.prisma.merchantKycSubmission.findFirst({
      where: { merchantId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      select: { payoutUsdBankAccount: true },
    });
    return {
      status: merchant.internationalPaymentsStatus,
      settlementMode: merchant.settlementMode,
      feeBps: this.cfg.intlFeeBps,
      fxRateAvailable: this.cfg.bobPerUsd > 0,
      usdPayoutAccountOnFile: Boolean(kyc?.payoutUsdBankAccount),
      note: merchant.internationalPaymentsNote,
    };
  }

  async request(merchantId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    if (merchant.settlementMode !== "AGGREGATOR") {
      throw new BadRequestException("Los pagos internacionales requieren que pagosYa liquide tus cobros (modo agregador).");
    }
    if (merchant.internationalPaymentsStatus === "ENABLED" || merchant.internationalPaymentsStatus === "REQUESTED") {
      throw new ConflictException("La solicitud ya existe.");
    }
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { internationalPaymentsStatus: "REQUESTED", internationalPaymentsNote: null },
    });
    return { status: "REQUESTED" as const };
  }

  listRequests() {
    return this.prisma.merchant.findMany({
      where: { internationalPaymentsStatus: "REQUESTED" },
      select: { id: true, name: true, email: true, settlementMode: true, internationalPaymentsStatus: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 200,
    });
  }

  async decide(merchantId: string, decision: "approve" | "reject", reason: string, actor: SupportActor) {
    // 404 on an unknown merchant only; the pending->decided transition itself
    // is checked and applied atomically below so two ops users racing on the
    // same REQUESTED merchant can't both "win" (one write, one audit entry).
    await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const status = decision === "approve" ? ("ENABLED" as const) : ("REJECTED" as const);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.merchant.updateMany({
        where: { id: merchantId, internationalPaymentsStatus: "REQUESTED" },
        data: { internationalPaymentsStatus: status, internationalPaymentsNote: reason },
      });
      if (count === 0) throw new ConflictException("Solo se deciden solicitudes pendientes.");
      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: `international_payments.${decision}`,
        targetType: "Merchant",
        targetId: merchantId,
        metadata: { reason },
      });
    });
    return { status };
  }

  async availableForIntent(intent: { merchantId: string }): Promise<boolean> {
    if (!(this.cfg.bobPerUsd > 0)) return false;
    if (!dlocalChargesAllowed(this.cfg, this.config.get<string>("app.environment"))) return false;
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: intent.merchantId } });
    return merchant.internationalPaymentsStatus === "ENABLED" && merchant.settlementMode === "AGGREGATOR";
  }

  async methodsForIntent(
    intent: { merchantId: string; amount: number; currency: string; metadata: unknown },
    country: string,
  ): Promise<InternationalMethodsResponse> {
    if (!(await this.availableForIntent(intent))) throw new ForbiddenException("Pagos internacionales no disponibles para este cobro.");
    let charge: ReturnType<typeof resolveChargeAmount>;
    try {
      charge = resolveChargeAmount(intent, true, this.cfg.bobPerUsd, new Date());
    } catch (error) {
      if (error instanceof FxRateUnavailableError) throw new ConflictException("intl_fx_rate_unavailable");
      throw error;
    }
    const methods = await this.cachedMethods(country);
    return {
      country,
      quote: {
        amount: charge.amount,
        currency: "USD" as const,
        originalAmount: charge.fx?.originalAmount ?? charge.amount,
        originalCurrency: charge.fx?.originalCurrency ?? charge.currency,
        rate: this.cfg.bobPerUsd,
      },
      methods: methods.map((m) => ({
        id: m.id,
        kind: m.type === "CARD" ? ("CARD" as const) : ("LOCAL_METHOD" as const),
        name: m.name,
        logo: m.logo ?? null,
      })),
    };
  }

  private async cachedMethods(country: string): Promise<DlocalPaymentMethod[]> {
    const cached = this.methodsCache.get(country);
    if (cached && Date.now() - cached.at < METHODS_TTL_MS) return cached.methods;
    const methods = await this.client.listPaymentMethods(country);
    this.methodsCache.set(country, { at: Date.now(), methods });
    return methods;
  }
}
