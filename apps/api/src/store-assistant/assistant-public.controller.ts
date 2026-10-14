import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { StoreAssistantService } from './store-assistant.service';

@ApiTags('stores')
@Controller('v1/stores/public')
export class AssistantPublicController {
  constructor(private readonly assistant: StoreAssistantService) {}

  @Post(':slug/assistant/chat')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  chat(@Param('slug') slug: string, @Body() dto: AssistantChatDto, @Req() req: Request) {
    return this.assistant.chat(slug, dto, req.ip ?? '');
  }
}
