import { Body, Controller, Get, Header, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { BrandProfileService } from './brand-profile.service';
import type { BrandFact } from './brand-profile';

class SaveBrandDto {
  @IsInt() @Min(0) revision!: number;
  @IsArray() @ArrayMaxSize(18) confirmed!: BrandFact[];
  @IsArray() @ArrayMaxSize(18) suggested!: BrandFact[];
}
class RestoreBrandDto {
  @IsInt() @Min(0) revision!: number;
  @IsInt() @Min(1) targetRevision!: number;
}
class AnalyzeBrandDto {
  @IsInt() @Min(0) revision!: number;
  @IsOptional() @IsString() @MaxLength(18000) text?: string;
  @IsOptional() @IsString() @MaxLength(2000) websiteUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(300, { each: true }) assetUrls?: string[];
}
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/brand')
export class BrandProfileController {
  constructor(private readonly brands: BrandProfileService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  get(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string) { return this.brands.get(merchant.id, id); }
  @Put()
  save(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string, @Body() dto: SaveBrandDto) { return this.brands.save(merchant.id, id, dto.revision, dto); }
  @Get('history') @Header('Cache-Control', 'private, no-store')
  history(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string) { return this.brands.history(merchant.id, id); }
  @Post('restore')
  restore(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string, @Body() dto: RestoreBrandDto) { return this.brands.restore(merchant.id, id, dto.revision, dto.targetRevision); }
  @Post('analyze') @Throttle({ default: { limit: 3, ttl: 60_000 } })
  analyze(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string, @Body() dto: AnalyzeBrandDto) { return this.brands.analyze(merchant.id, id, dto); }
}
