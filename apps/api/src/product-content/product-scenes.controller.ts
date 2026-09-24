import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { IsSafeText } from '../common/validation/safe-text.decorator';
import { PRODUCT_SCENE_ASPECTS, PRODUCT_SCENE_SETTINGS, ProductScenesService, type ProductSceneAspect, type ProductSceneSetting } from './product-scenes.service';

export class CreateProductSceneDto {
  @IsString() @MaxLength(500) imageUrl!: string;
  @IsString() @IsSafeText() @Length(1, 120) productName!: string;
  @IsOptional() @IsString() @IsSafeText() @MaxLength(500) description?: string | null;
  @IsIn(PRODUCT_SCENE_SETTINGS) setting!: ProductSceneSetting;
  @IsOptional() @IsString() @IsSafeText() @MaxLength(200) note?: string | null;
  @IsOptional() @IsIn(PRODUCT_SCENE_ASPECTS) aspect?: ProductSceneAspect;
}

@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/product-scenes')
export class ProductScenesController {
  constructor(private readonly scenes: ProductScenesService) {}
  /** Styled scene from the merchant's own product photo; the merchant decides whether to add it. */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  create(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: CreateProductSceneDto) {
    return this.scenes.create(merchant.id, storeId, input);
  }
}
