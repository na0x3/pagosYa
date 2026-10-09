import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { ApplyTemplateDto } from './dto/apply-template.dto';
import { CompileBudget, MerchantThrottlerGuard } from './source-compile-budget';
import { SourceTemplatesService } from './source-templates.service';
import { SourceChatService } from './source-chat.service';

@ApiTags('storefront-templates')
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/store-templates')
export class SourceTemplatesListController {
  constructor(private readonly templates: SourceTemplatesService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=300')
  list() {
    return this.templates.list();
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
  constructor(private readonly templates: SourceTemplatesService, private readonly chat: SourceChatService) {}

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
}
