import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SupportCaseCategory, SupportCasePriority } from "@prisma/client";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { PrismaService } from "../prisma/prisma.service";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import { LimitsService } from "./limits.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/limits")
export class DashboardLimitsController {
  constructor(private readonly limits: LimitsService, private readonly prisma: PrismaService) {}

  @Get()
  usage(@Req() req: { merchant: { id: string } }) {
    return this.limits.usage(req.merchant.id);
  }

  @Post("level3_request")
  async requestLevel3(@Req() req: { merchant: { id: string } }) {
    const merchantId = req.merchant.id;
    await openOpsCaseOnce(this.prisma, {
      merchantId,
      dedupeKey: `level3-request:${merchantId}`,
      summary: `El comercio pide pasar al nivel Empresa (level3-request:${merchantId}). Pedir documentos de la empresa y fijar límites.`,
      category: SupportCaseCategory.KYC,
      priority: SupportCasePriority.NORMAL,
    });
    return { requested: true };
  }
}
