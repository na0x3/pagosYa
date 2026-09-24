import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { OpsModule } from "../ops/ops.module";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { ManualCarrier } from "./carriers/manual.carrier";
import { CarrierRegistry } from "./carriers/carrier-registry";
import { ShipmentsService } from "./shipments.service";
import { ShipmentBookingWorker } from "./shipment-booking.worker";
import { MerchantShipmentsController } from "./merchant-shipments.controller";
import { OpsCarriersController } from "./ops-carriers.controller";
import { ShippingController } from "./shipping.controller";

/**
 * Delivery zones and rates (checkout pricing uses the plain helpers in
 * shipping-rates.ts) plus courier shipments: carrier catalog, booking worker
 * and merchant/ops shipment routes.
 */
@Module({
  imports: [AuthModule, DashboardModule, OpsModule],
  controllers: [ShippingController, MerchantShipmentsController, OpsCarriersController],
  providers: [ManualCarrier, CarrierRegistry, PrivateFilesService, ShipmentsService, ShipmentBookingWorker],
  exports: [ShipmentsService],
})
export class ShippingModule {}
