import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { AssistantSettingsDto, AssistantTestDto, AssistantUnansweredDto } from './dto/assistant-settings.dto';
import { StoreAssistantAdminService } from './store-assistant-admin.service';

@ApiTags('stores')
@Controller('v1/stores/:storeId/assistant')
@UseGuards(MerchantAuthGuard)
export class AssistantAdminController {
  constructor(private readonly admin: StoreAssistantAdminService) {}
  @Get() view(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string) { return this.admin.view(m.id, storeId); }
  @Put() save(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Body() dto: AssistantSettingsDto) { return this.admin.save(m.id, storeId, dto); }
  @Post('test') @HttpCode(200) test(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Body() dto: AssistantTestDto) { return this.admin.test(m.id, storeId, dto); }
  @Post('notes-draft') @HttpCode(200) draft(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string) { return this.admin.notesDraft(m.id, storeId); }
  @Get('conversations') conversations(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string) { return this.admin.conversations(m.id, storeId); }
  @Get('conversations/:id') conversation(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string) { return this.admin.conversation(m.id, storeId, id); }
  @Get('unanswered') unansweredList(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string) { return this.admin.unansweredList(m.id, storeId); }
  @Patch('unanswered/:id') unanswered(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string, @Body() dto: AssistantUnansweredDto) { return this.admin.unanswered(m.id, storeId, id, dto); }
}
