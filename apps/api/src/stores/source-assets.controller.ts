import { BadRequestException, Body, ConflictException, Controller, Get, Header, Param, Patch, Post, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { IsArray, ArrayMaxSize, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Throttle } from '@nestjs/throttler';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { SourceProjectsService } from './source-projects.service';
import { SourceVisualReviewService } from './source-visual-review.service';
import { SOURCE_ASSET_MANIFEST, SOURCE_ASSET_ROLES, SOURCE_ICON_NAMES, sourceAssetInventory, type SourceAssetRole } from './source-asset-library';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from './source-generation-policy';
import type { SourceProjectSnapshot } from './source-project';
import { SourceProjectRevisionDto } from './dto/save-source-project.dto';

class AssetRoleDto {
  @IsString() @MaxLength(200) path!: string;
  @IsIn(SOURCE_ASSET_ROLES) role!: SourceAssetRole;
  @IsString() @MaxLength(500) description!: string;
}
class AssetRolesDto extends SourceProjectRevisionDto {
  @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => AssetRoleDto) assets!: AssetRoleDto[];
}
class VisualReviewDto extends SourceProjectRevisionDto {
  @IsOptional() @IsString() @MaxLength(120) productId?: string;
  @IsString() @MaxLength(200) page!: string;
  @IsOptional() @IsIn(SOURCE_MODEL_CHOICES) model?: SourceModelChoice;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxCredits?: number;
}

@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/source-project')
export class SourceAssetsController {
  constructor(private readonly projects: SourceProjectsService, private readonly review: SourceVisualReviewService) {}
  @Get('assets')
  @Header('Cache-Control', 'private, no-store')
  async assets(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('revision', ParseIntPipe) revision: number) {
    const saved = await this.projects.version(merchant.id, storeId, revision);
    const icons = await Promise.all(SOURCE_ICON_NAMES.map(async name => ({ name, path: `assets/icons/${name}.svg`, svg: await readFile(join(__dirname, 'source-kit/icons', `${name}.svg`), 'utf8') })));
    return { revision, assets: sourceAssetInventory((saved.snapshot as unknown as SourceProjectSnapshot).files), icons, iconLibrary: 'Lucide 1.31.0' };
  }
  @Patch('assets')
  async roles(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: AssetRolesDto) {
    const current = await this.projects.current(merchant.id, storeId);
    if (current.revision !== input.revision) throw new ConflictException('El sitio cambió. Actualiza antes de guardar los usos.');
    const saved = await this.projects.version(merchant.id, storeId, input.revision);
    const snapshot = saved.snapshot as unknown as SourceProjectSnapshot;
    const inventory = sourceAssetInventory(snapshot.files).filter(a => a.kind !== 'icon');
    if (new Set(input.assets.map(a => a.path)).size !== input.assets.length || input.assets.some(a => !inventory.some(f => f.path === a.path))) throw new BadRequestException('Selecciona recursos incluidos en esta revisión.');
    const assets = inventory.map(asset => { const role = input.assets.find(a => a.path === asset.path) || asset; return { path: asset.path, role: role.role, description: role.description }; });
    return this.projects.save(merchant.id, storeId, { revision: input.revision, label: 'Usos de los recursos visuales', brief: snapshot.brief, files: [...snapshot.files.filter(f => f.path !== SOURCE_ASSET_MANIFEST), { path: SOURCE_ASSET_MANIFEST, content: JSON.stringify({ version: 1, assets }, null, 2) + '\n' }] });
  }
  @Post('visual-review')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  visualReview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: VisualReviewDto) {
    return this.review.review(merchant.id, storeId, input);
  }
  @Get('visual-review')
  @Header('Cache-Control', 'private, no-store')
  latestReview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('revision', ParseIntPipe) revision: number, @Query('page') page: string, @Query('productId') productId?: string) {
    return this.review.latest(merchant.id, storeId, revision, page, productId);
  }
}
