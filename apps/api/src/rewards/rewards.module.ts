import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { RewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";
import { REWARD_RANDOM, cryptoRandom } from "./reward-random";

@Module({
  imports: [DashboardModule],
  controllers: [RewardsController],
  providers: [RewardsService, { provide: REWARD_RANDOM, useValue: cryptoRandom }],
  exports: [RewardsService],
})
export class RewardsModule {}
