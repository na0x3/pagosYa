import { Module } from "@nestjs/common";
import { FinancesService } from "./finances.service";
import { FinancesController } from "./finances.controller";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [DashboardModule, AuthModule],
  controllers: [FinancesController],
  providers: [FinancesService],
  exports: [FinancesService],
})
export class FinancesModule {}
