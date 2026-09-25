import { SourceCheckResultDto } from './source-check-results';
import { Body, Controller, Get, Header, Param, Post, Query, UseGuards, Headers, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, Max, Matches } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { SourcePublishingService } from './source-publishing.service';
import { SourceGenerationService } from './source-generation.service';
import { SourceProjectsService } from './source-projects.service';
import { SendSourceMessageDto } from './dto/send-source-message.dto';
class PublishDto {
  @IsInt() @Min(1) revision!: number;
  @IsInt() @Min(0) publicationVersion!: number;
}
class RuntimeRollbackDto {
  // null returns the store to the latest trusted runtime.
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/, { message: 'El digest debe ser un SHA-256 válido.' })
  digest!: string | null;
  @IsInt({ message: 'La versión esperada debe ser un entero.' })
  @Min(0, { message: 'La versión esperada no puede ser negativa.' })
  @Max(2147483647, { message: 'La versión esperada supera el límite permitido.' })
  expectedVersion!: number;
}
class VisibilityDto {
  @IsInt() @Min(0) publicationVersion!: number;
  @IsBoolean() published!: boolean;
}
class FinishDto {
  @IsInt() @Min(0) publicationVersion!: number;
  @IsString() @MaxLength(100) experimentId!: string;
  @IsBoolean() apply!: boolean;
}
class VisitDto { @IsOptional() @IsUUID('4') visitorId?: string; }

@Controller('v1/stores/:storeId/source-project')
@UseGuards(MerchantAuthGuard)
export class SourcePublishingController {
  constructor(private readonly publishing: SourcePublishingService, private readonly generation: SourceGenerationService, private readonly projects: SourceProjectsService) {}
  @Post('versions/:revision/checks')
  checks(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('revision') revision: string, @Body() body: SourceCheckResultDto) {
    return this.publishing.recordChecks(m.id, id, /^\d+$/.test(revision) ? Number(revision) : NaN, body);
  }
  @Post('publish')
  publish(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: PublishDto) {
    return this.publishing.publish(m.id, id, body.revision, body.publicationVersion);
  }
  @Post('runtime/rollback')
  rollbackRuntime(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: RuntimeRollbackDto) {
    return this.publishing.rollbackRuntime(m.id, id, body.digest ?? null, body.expectedVersion);
  }
  @Post('visibility')
  visibility(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: VisibilityDto) {
    return this.publishing.visibility(m.id, id, body.published, body.publicationVersion);
  }
  @Post('experiments')
  start(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: PublishDto) {
    return this.publishing.start(m.id, id, body.revision, body.publicationVersion);
  }
  @Post('experiments/finish')
  finish(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: FinishDto) {
    return this.publishing.finish(m.id, id, body.publicationVersion, body.experimentId, body.apply);
  }
  @Post('alternative')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async alternative(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: SendSourceMessageDto) {
    const store = await this.publishing.owner(m.id, id);
    const current = await this.projects.current(m.id, id);
    const baseRevision = store.publishedSourceRevision || current.revision;
    const snapshot = await this.publishing.snapshot(id, baseRevision);
    return this.generation.generate(m.id, id, { revision: body.revision, baseRevision, brief: snapshot.brief, model: body.model, maxCredits: body.maxCredits, motion: body.motion,
      instruction: 'Crea una alternativa B para una prueba A/B contra este diseño. Cambia una hipótesis concreta de conversión: jerarquía del hero, claridad de beneficios o ubicación del CTA. Conserva productos, precios, marca, navegación, formularios y checkout. No inventes reseñas, descuentos ni afirmaciones. Usa un título de revisión que describa el cambio. ' + body.instruction });
  }
}
@Controller('v1/stores/public/:slug/source-site')
export class SourceSiteController {
  constructor(private readonly publishing: SourcePublishingService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  get(@Param('slug') slug: string, @Query() query: VisitDto) { return this.publishing.publicSite(slug, query.visitorId); }

  /** Public media of a visible revision. Content-addressed by revision and digest, so it may be cached forever. */
  @Get('assets/:version/*path')
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  async asset(@Param('slug') slug: string, @Param('version') version: string, @Param('path') path: string[] | string, @Res({ passthrough: true }) res: Response, @Headers('if-none-match') ifNoneMatch?: string) {
    const file = await this.publishing.publicAsset(slug, version, Array.isArray(path) ? path.join('/') : path);
    res.set({
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // The storefront sandbox has an opaque origin; fonts are fetched in CORS mode and need this.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: file.etag,
    });
    if (ifNoneMatch?.split(',').some(value => value.trim().replace(/^W\//, '') === file.etag)) { res.status(304); return undefined; }
    res.set({ 'Content-Length': String(file.bytes.length) });
    return new StreamableFile(file.bytes);
  }
}
