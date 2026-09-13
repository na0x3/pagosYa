import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';
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
  @Post('publish')
  publish(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: PublishDto) {
    return this.publishing.publish(m.id, id, body.revision, body.publicationVersion);
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
}
