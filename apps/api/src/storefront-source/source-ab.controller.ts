import { Body, Controller, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SourceAbService, type AbAction } from './source-ab.service';

const ACTIONS: AbAction[] = ['launch', 'launched', 'another', 'cancel', 'keepA', 'keepB', 'extend'];
export class AbAnswerDto {
  @IsString() @MaxLength(64) proposalId!: string;
  @IsIn(ACTIONS) action!: AbAction;
}

/** YAPI A/B tests (spec 2026-11-09): the card buttons, and the Studio's once-a-day note on load. */
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/source-project/ab')
export class SourceAbController {
  constructor(private readonly ab: SourceAbService, private readonly prisma: PrismaService) {}
  private async owned(merchantId: string, storeId: string) {
    if (!await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } })) throw new NotFoundException('Store not found');
  }
  @Post('answer') @Throttle({ default: { limit: 30, ttl: 60000 } })
  async answer(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: AbAnswerDto) {
    await this.owned(merchant.id, storeId);
    return this.ab.answer(merchant.id, storeId, input.proposalId, input.action);
  }
  @Post('note') @Throttle({ default: { limit: 20, ttl: 60000 } })
  async note(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    await this.owned(merchant.id, storeId);
    return { message: await this.ab.note(storeId) };
  }
}
