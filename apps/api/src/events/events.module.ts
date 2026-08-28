import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockAccessControlProvider } from "@pagosya/access-control";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { ConsumerModule } from "../consumer/consumer.module";
import { EventsConsumerController, EventsController, EventsPublicController } from "./events.controller";
import { EventRosterService } from "./event-roster.service";
import { EventsService } from "./events.service";
import { FaceEntryService } from "./face-entry.service";
import { ACCESS_CONTROL_PROVIDER, createAccessControlProvider } from "./access-control.provider";

@Module({
  imports: [AuthModule, ConsumerModule, DashboardModule, PaymentIntentsModule],
  controllers: [EventsController, EventsPublicController, EventsConsumerController],
  providers: [
    EventsService,
    EventRosterService,
    FaceEntryService,
    MockAccessControlProvider,
    { provide: ACCESS_CONTROL_PROVIDER, inject: [ConfigService, MockAccessControlProvider], useFactory: createAccessControlProvider },
  ],
  exports: [EventsService],
})
export class EventsModule {}
