import { Body, Controller, Get, Header, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { PopupDesignService } from './popup-design.service';

export class PopupDesignSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) percent?: number;
  @IsOptional() @IsIn(['whatsapp', 'email']) capture?: 'whatsapp' | 'email';
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) products?: string[];
  @IsOptional() @IsBoolean() on?: boolean;
}

/** Popups 2.0 (spec 2026-11-18 §9): the merchant's Popups page. A redesign is a chat request («Rediseña mi popup…»), so it
 *  shows in the chat, spends a credit and can be stopped like any other. */
@Controller('v1/stores/:storeId/popup-designs')
@UseGuards(MerchantAuthGuard)
export class PopupDesignController {
  constructor(private readonly popups: PopupDesignService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  overview(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string) { return this.popups.overview(m.id, storeId); }
  @Post(':id/restore')
  async restore(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string) { await this.popups.restore(m.id, storeId, id); return { ok: true }; }
  @Put('settings')
  async settings(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Body() dto: PopupDesignSettingsDto) { await this.popups.updateSettings(m.id, storeId, dto); return { ok: true }; }
}
