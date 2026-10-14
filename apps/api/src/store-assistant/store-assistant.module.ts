import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { AssistantPublicController } from './assistant-public.controller';
import { ASSISTANT_MODEL_FACTORY, defaultAssistantModelFactory } from './assistant-model';
import { AssistantUsage } from './assistant-usage';
import { StoreAssistantService } from './store-assistant.service';

/** Storefront chat assistant (spec 2026-10-13-store-assistant-design). */
@Module({
  imports: [AiUsageModule],
  controllers: [AssistantPublicController],
  providers: [
    StoreAssistantService, AssistantUsage,
    { provide: ASSISTANT_MODEL_FACTORY, useFactory: defaultAssistantModelFactory, inject: [ConfigService] },
  ],
  exports: [StoreAssistantService, AssistantUsage],
})
export class StoreAssistantModule {}
