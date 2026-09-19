import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { ShippingController } from "./shipping.controller";

/** Delivery zones and rates. Checkout pricing uses the plain helpers in shipping-rates.ts. */
@Module({
  imports: [DashboardModule, AuthModule],
  controllers: [ShippingController],
})
export class ShippingModule {}
