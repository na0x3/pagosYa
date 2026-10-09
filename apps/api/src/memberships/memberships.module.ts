import { Module } from "@nestjs/common";
import { StoreCustomersModule } from "../store-customers/store-customers.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";

@Module({ imports: [StoreCustomersModule, PaymentIntentsModule], controllers: [MembershipsController], providers: [MembershipsService], exports: [MembershipsService] })
export class MembershipsModule {}
