import { Body, Controller, Get, Header, Post, Put, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsDefined, IsInt, IsString, IsOptional, Matches, MaxLength, Min } from 'class-validator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { CompileBudget, MerchantThrottlerGuard } from './source-compile-budget';
import { SketchStudioService } from './sketch-studio.service';
import { searchSourceIcons } from './source-asset-library';

class UpdateSketchDto {
  @IsInt() @Min(1) revision!: number;
  /** Intentionally untyped: repairSketch is the validator and never rejects. */
  @IsDefined() sketch!: unknown;
}

class AddSketchPhotoDto {
  @IsInt() @Min(1) revision!: number;
  @IsString() @MaxLength(200) url!: string;
}

class RegenerateSketchDto {
  @IsInt() @Min(1) revision!: number;
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]{1,160}$/) designSeed?: string;
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{0,47}$/) sectionId?: string;
}

class BuildSketchDto {
  @IsInt() @Min(1) revision!: number;
}

@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project')
export class SketchStudioController {
  constructor(private readonly sketches: SketchStudioService) {}

  @Get('sketch')
  @Header('Cache-Control', 'private, no-store')
  get(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    return this.sketches.get(merchant.id, storeId);
  }

  /** Icon picker: the full Lucide catalog, searched by name; read-only and public-domain-licensed (ISC). */
  @Get('sketch/icons')
  @Header('Cache-Control', 'private, max-age=3600')
  icons(@Query('q') q?: string) {
    return searchSourceIcons(typeof q === 'string' ? q.slice(0, 60) : '');
  }

  @Post('sketch/photos')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  addPhoto(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: AddSketchPhotoDto) {
    return this.sketches.addPhoto(merchant.id, storeId, body);
  }

  @Put('sketch')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @CompileBudget()
  update(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: UpdateSketchDto) {
    return this.sketches.update(merchant.id, storeId, body);
  }

  @Post('sketch/regenerate')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @CompileBudget()
  regenerate(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: RegenerateSketchDto) {
    return this.sketches.regenerate(merchant.id, storeId, body);
  }

  /** "Generar sitio": the boceto becomes the site (final; see SketchStudioService.build). */
  @Post('sketch/build')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @CompileBudget()
  build(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: BuildSketchDto) {
    return this.sketches.build(merchant.id, storeId, body);
  }
}
