import { Body, Controller, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SourceTourService, type TourAction } from './source-tour.service';

const ACTIONS: TourAction[] = ['start', 'later', 'like', 'change', 'skip', 'ok', 'again'];
export class TourAnswerDto {
  @IsString() @MaxLength(64) tourId!: string;
  @IsIn(ACTIONS) action!: TourAction;
}

/** YAPI store tour (spec 2026-11-09): the Studio's «Recorrer mi tienda» button and the step buttons. */
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/source-project/tour')
export class SourceTourController {
  constructor(private readonly tour: SourceTourService, private readonly prisma: PrismaService) {}
  private async owned(merchantId: string, storeId: string) {
    if (!await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } })) throw new NotFoundException('Store not found');
  }
  @Post('start') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async start(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    await this.owned(merchant.id, storeId);
    return { message: await this.tour.start(storeId) };
  }
  @Post('answer') @Throttle({ default: { limit: 60, ttl: 60000 } })
  async answer(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: TourAnswerDto) {
    await this.owned(merchant.id, storeId);
    return { message: await this.tour.answer(storeId, input.tourId, input.action) };
  }
}
