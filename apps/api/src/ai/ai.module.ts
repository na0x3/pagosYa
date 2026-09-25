import { Module } from "@nestjs/common";
import { AiUsageModule } from "../ai-usage/ai-usage.module";
import { StructuredCompletionService } from "./structured-completion";

/** Shared, metered AI calls for new features. Import it where a structured draft is needed. */
@Module({
  imports: [AiUsageModule],
  providers: [StructuredCompletionService],
  exports: [StructuredCompletionService],
})
export class AiModule {}
