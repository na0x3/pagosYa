import { Module } from "@nestjs/common";
import { StoreCustomersModule } from "../store-customers/store-customers.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { OperationsModule } from "../operations/operations.module";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";

@Module({ imports: [StoreCustomersModule, PaymentIntentsModule, OperationsModule], controllers: [MembershipsController], providers: [MembershipsService], exports: [MembershipsService] })
export class MembershipsModule {}
