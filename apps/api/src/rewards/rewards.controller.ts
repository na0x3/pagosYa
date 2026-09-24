import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { StoreRewardsDto } from "./dto/rewards.dto";
import { RewardsService } from "./rewards.service";

type SessionRequest = { merchant: { id: string }; merchantUser: { id: string } };

@Controller("v1/dashboard/rewards")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  state(@Req() req: SessionRequest, @Query() dto: StoreRewardsDto) {
    return this.rewards.state(req.merchant.id, req.merchantUser.id, dto.storeId);
  }

  @Post("wheel/spin")
  spinWheel(@Req() req: SessionRequest, @Body() dto: StoreRewardsDto) {
    return this.rewards.spinWheel(req.merchant.id, req.merchantUser.id, dto.storeId);
  }

  @Post("board/roll")
  rollBoard(@Req() req: SessionRequest, @Body() dto: StoreRewardsDto) {
    return this.rewards.rollBoard(req.merchant.id, req.merchantUser.id, dto.storeId);
  }
}
