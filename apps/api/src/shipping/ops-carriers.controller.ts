import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../ops/guards/ops-auth.guard';
import { CurrentOpsUser } from '../ops/decorators/current-ops-user.decorator';
import { AuditLogService } from '../ops/audit-log.service';
import { SupportActor, actorLabel } from '../ops/support.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCarrierDto } from './dto';

@UseGuards(OpsAuthGuard)
@Controller('internal/shipping')
export class OpsCarriersController {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  @Get('carriers')
  list() {
    return this.prisma.shippingCarrier.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('shipments/failed')
  failed() {
    return this.prisma.shipment.findMany({ where: { status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, take: 100, include: { carrier: { select: { name: true } } } });
  }

  @Patch('carriers/:id')
  async update(@CurrentOpsUser() actor: SupportActor, @Param('id') id: string, @Body() dto: UpdateCarrierDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.trackingUrlTemplate !== undefined) {
      const trimmed = dto.trackingUrlTemplate.trim();
      if (trimmed === '') {
        data.trackingUrlTemplate = null;
      } else {
        if (!trimmed.startsWith('https://')) throw new BadRequestException('La plantilla debe usar https.');
        if (!trimmed.includes('{tracking}')) throw new BadRequestException('La plantilla debe incluir {tracking}.');
        data.trackingUrlTemplate = trimmed;
      }
    }
    return this.prisma.$transaction(async tx => {
      const carrier = await tx.shippingCarrier.update({ where: { id }, data });
      await this.auditLog.record(tx, {
        actorType: 'OPS_USER',
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: 'shipping.carrier.update',
        targetType: 'ShippingCarrier',
        targetId: id,
        metadata: { ...data },
      });
      return carrier;
    });
  }
}
