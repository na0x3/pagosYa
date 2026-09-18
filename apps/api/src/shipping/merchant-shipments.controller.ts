import { Body, Controller, Get, Header, Param, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { ShipmentsService } from './shipments.service';
import { SwitchCarrierDto, TrackingNumberDto } from './dto';

@UseGuards(MerchantAuthGuard)
@Controller('v1')
export class MerchantShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}
  @Get('orders/:orderId/shipment') view(@CurrentMerchant() m: { id: string }, @Param('orderId') orderId: string) { return this.shipments.viewForMerchant(m.id, orderId); }
  @Get('shipments/:id/label') @Header('Cache-Control', 'private, no-store')
  async label(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return new StreamableFile(await this.shipments.label(m.id, id), { type: 'application/pdf', disposition: `attachment; filename="guia-${id}.pdf"` }); }
  @Post('shipments/:id/tracking') tracking(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: TrackingNumberDto) { return this.shipments.setTrackingNumber(m.id, id, dto.trackingNumber); }
  @Post('shipments/:id/delivered') delivered(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.shipments.markDelivered(m.id, id); }
  @Post('shipments/:id/retry') retry(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.shipments.retry(m.id, id); }
  @Post('shipments/:id/carrier') carrier(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: SwitchCarrierDto) { return this.shipments.switchCarrier(m.id, id, dto.carrierId); }
}
