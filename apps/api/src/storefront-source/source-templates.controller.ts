import { Body, Controller, Get, Header, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { ApplyFilledTemplateDto, ApplyTemplateDto } from './dto/apply-template.dto';
import { CompileBudget, MerchantThrottlerGuard } from './source-compile-budget';
import { SourceTemplatesService } from './source-templates.service';
import { SourceChatService } from './source-chat.service';

@ApiTags('storefront-templates')
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/store-templates')
export class SourceTemplatesListController {
  constructor(private readonly templates: SourceTemplatesService, private readonly config: ConfigService) {}

  private plantillas() { return this.config.get<boolean>('app.yapiPlantillasFill') === true; }

  /** With Plantillas fill on (spec 2026-10-20), only the curated, converted templates. */
  @Get()
  @Header('Cache-Control', 'private, max-age=300')
  list() {
    return this.templates.list(this.plantillas());
  }

  /** What the dashboard and the Studio show: the Plantillas menu, «Elegir una plantilla» and double-click editing. */
  @Get('settings')
  @Header('Cache-Control', 'no-store')
  settings() {
    return { plantillas: this.plantillas() };
  }

  /** The template as designed, with its demo shop: Plantillas › Ver. Same for every merchant, so the browser may keep it. */
  @Get(':templateId/demo')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'private, max-age=300')
  demo(@Param('templateId') templateId: string) {
    return this.templates.demo(templateId);
  }
}

@ApiTags('storefront-templates')
@ApiBearerAuth()
// The throttler runs after the auth guard so it can charge the merchant, not the address.
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project/templates')
export class SourceTemplatesApplyController {
  constructor(private readonly templates: SourceTemplatesService, private readonly chat: SourceChatService, private readonly config: ConfigService) {}

  @Get(':templateId/preview')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @CompileBudget()
  preview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('templateId') templateId: string) {
    return this.templates.preview(merchant.id, storeId, templateId);
  }

  @Post(':templateId')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @CompileBudget()
  apply(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('templateId') templateId: string, @Body() input: ApplyTemplateDto) {
    return this.chat.applyTemplate(merchant.id, storeId, templateId, input.revision);
  }

  /** Spec 2026-10-20 §4: a curated Plantilla filled with this business in one YAPI call. */
  @Post(':templateId/apply-filled')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @CompileBudget()
  applyFilled(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('templateId') templateId: string, @Body() input: ApplyFilledTemplateDto) {
    if (this.config.get<boolean>('app.yapiPlantillasFill') !== true) throw new NotFoundException();
    return this.chat.applyPlantilla(merchant.id, storeId, templateId, input.revision, { about: input.about, assetUrls: input.assetUrls });
  }
}
