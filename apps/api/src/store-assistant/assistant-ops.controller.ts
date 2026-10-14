import { Body, Controller, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OpsAuthGuard } from '../ops/guards/ops-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AssistantCapDto } from './dto/assistant-settings.dto';

@ApiTags('ops')
@Controller('internal/stores/:storeId/assistant')
export class AssistantOpsController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch()
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  async cap(@Param('storeId') storeId: string, @Body() dto: AssistantCapDto) {
    if (!await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } })) throw new NotFoundException('Tienda no encontrada');
    const row = await this.prisma.storeAssistant.upsert({ where: { storeId }, create: { storeId, monthlyCap: dto.monthlyCap }, update: { monthlyCap: dto.monthlyCap } });
    return { storeId: row.storeId, monthlyCap: row.monthlyCap };
  }
}
