import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { OpsModule } from '../ops/ops.module';
import { AssistantAdminController } from './assistant-admin.controller';
import { ASSISTANT_MODEL_FACTORY, defaultAssistantModelFactory } from './assistant-model';
import { AssistantOpsController } from './assistant-ops.controller';
import { AssistantPublicController } from './assistant-public.controller';
import { AssistantRetentionJob } from './assistant-retention.job';
import { AssistantUsage } from './assistant-usage';
import { StoreAssistantAdminService } from './store-assistant-admin.service';
import { StoreAssistantService } from './store-assistant.service';

/** Storefront chat assistant (spec 2026-10-13-store-assistant-design). */
@Module({
  imports: [AiUsageModule, AiModule, DashboardModule, AuthModule, OpsModule],
  controllers: [AssistantPublicController, AssistantAdminController, AssistantOpsController],
  providers: [
    StoreAssistantService, StoreAssistantAdminService, AssistantUsage, AssistantRetentionJob,
    { provide: ASSISTANT_MODEL_FACTORY, useFactory: defaultAssistantModelFactory, inject: [ConfigService] },
  ],
  exports: [StoreAssistantService, AssistantUsage],
})
export class StoreAssistantModule {}
