import { Module } from "@nestjs/common";
import { OpsModule } from "../ops/ops.module";
import { SanctionsController } from "./sanctions.controller";
import { SanctionsJob } from "./sanctions.job";
import { SanctionsService } from "./sanctions.service";

@Module({
  imports: [OpsModule],
  controllers: [SanctionsController],
  providers: [SanctionsService, SanctionsJob],
  exports: [SanctionsService],
})
export class SanctionsModule {}
