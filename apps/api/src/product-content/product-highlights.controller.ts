import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Throttle } from '@nestjs/throttler';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { IsSafeText } from '../common/validation/safe-text.decorator';
import { ProductHighlightsService } from './product-highlights.service';

export class HighlightFactDto {
  @IsString() @IsSafeText() @Length(1, 40) label!: string;
  @IsString() @IsSafeText() @Length(1, 120) value!: string;
}

export class SuggestProductHighlightsDto {
  @IsString() @IsSafeText() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @IsSafeText() @MaxLength(500) description?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => HighlightFactDto) specifications?: HighlightFactDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @IsSafeText({ each: true }) @MaxLength(24, { each: true }) tags?: string[];
}

@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/product-highlights')
export class ProductHighlightsController {
  constructor(private readonly highlights: ProductHighlightsService) {}

  /** Proposals only. They reach the storefront after the merchant approves and saves them with the product. */
  @Post('suggestions')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  suggest(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: SuggestProductHighlightsDto) {
    return this.highlights.suggest(merchant.id, storeId, input);
  }
}
