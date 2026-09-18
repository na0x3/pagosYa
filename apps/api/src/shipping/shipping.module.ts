import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { PrivateFilesService } from '../commerce-platform/private-files.service';
import { ManualCarrier } from './carriers/manual.carrier';
import { CarrierRegistry } from './carriers/carrier-registry';
import { ShipmentsService } from './shipments.service';
import { ShipmentBookingWorker } from './shipment-booking.worker';
import { MerchantShipmentsController } from './merchant-shipments.controller';

@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [MerchantShipmentsController],
  providers: [ManualCarrier, CarrierRegistry, PrivateFilesService, ShipmentsService, ShipmentBookingWorker],
  exports: [ShipmentsService],
})
export class ShippingModule {}
