import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConsumerModule } from "../consumer/consumer.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { CalendarOauthController } from "./calendar-oauth.controller";
import { ConsumerOperationsController } from "./consumer-operations.controller";
import { GoogleCalendarService } from "./google-calendar.service";
import { IntegrationsInboundController } from "./integrations-inbound.controller";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { OperationsWorker } from "./operations.worker";
import { PublicAppointmentsController } from "./public-appointments.controller";

@Module({
  imports: [AuthModule, DashboardModule, ConsumerModule, PaymentIntentsModule],
  controllers: [OperationsController, IntegrationsInboundController, CalendarOauthController, ConsumerOperationsController, PublicAppointmentsController],
  providers: [OperationsService, GoogleCalendarService, OperationsWorker],
  exports: [OperationsService],
})
export class OperationsModule {}
