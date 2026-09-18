import { Module } from '@nestjs/common';
import { PrivateFilesService } from '../commerce-platform/private-files.service';
import { ManualCarrier } from './carriers/manual.carrier';
import { CarrierRegistry } from './carriers/carrier-registry';
import { ShipmentsService } from './shipments.service';
import { ShipmentBookingWorker } from './shipment-booking.worker';

@Module({
  providers: [ManualCarrier, CarrierRegistry, PrivateFilesService, ShipmentsService, ShipmentBookingWorker],
  exports: [ShipmentsService],
})
export class ShippingModule {}
