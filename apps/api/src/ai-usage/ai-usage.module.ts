import { Module } from "@nestjs/common";
import { AiUsageService } from "./ai-usage.service";

/** Records model usage and cost for every AI call a store makes. */
@Module({
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
