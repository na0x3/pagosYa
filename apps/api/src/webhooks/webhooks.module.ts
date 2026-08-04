import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { WebhookDispatcherService } from "./webhook-dispatcher.service";
import { WebhookEndpointsService } from "./webhook-endpoints.service";
import { WebhookEndpointsController } from "./webhook-endpoints.controller";
import { WebhookDeliveryWorker } from "./webhook-delivery.worker";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule],
  controllers: [WebhookEndpointsController],
  providers: [WebhookDispatcherService, WebhookEndpointsService, WebhookDeliveryWorker],
  exports: [WebhookDispatcherService],
})
export class WebhooksModule {}
