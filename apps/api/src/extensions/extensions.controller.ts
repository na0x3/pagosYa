import { Body, Controller, Delete, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { SaveExtensionDto, ToggleExtensionDto } from './dto';
import { ExtensionsService } from './extensions.service';

@Controller('v1/stores/:storeId/extensions') @UseGuards(MerchantAuthGuard)
export class ExtensionsController {
  constructor(private readonly extensions: ExtensionsService) {}
  @Get() list(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string) { return this.extensions.list(m.id, storeId); }
  @Put(':extensionId') save(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('extensionId') id: string, @Body() dto: SaveExtensionDto) { return this.extensions.save(m.id, storeId, id, dto); }
  @Patch(':extensionId') toggle(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('extensionId') id: string, @Body() dto: ToggleExtensionDto) { return this.extensions.setEnabled(m.id, storeId, id, dto.enabled); }
  @Delete(':extensionId') remove(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('extensionId') id: string) { return this.extensions.remove(m.id, storeId, id); }
}
