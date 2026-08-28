import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockAccessControlProvider } from "@pagosya/access-control";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { EventsController, EventsPublicController } from "./events.controller";
import { EventsService } from "./events.service";
import { ACCESS_CONTROL_PROVIDER, createAccessControlProvider } from "./access-control.provider";

@Module({
  imports: [AuthModule, DashboardModule, PaymentIntentsModule],
  controllers: [EventsController, EventsPublicController],
  providers: [
    EventsService,
    MockAccessControlProvider,
    { provide: ACCESS_CONTROL_PROVIDER, inject: [ConfigService, MockAccessControlProvider], useFactory: createAccessControlProvider },
  ],
  exports: [EventsService],
})
export class EventsModule {}
