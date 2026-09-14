import { currentSourceRuntime } from './source-runtime';
import type { SourceProjectSnapshot } from './source-project';
import { IsBoolean } from 'class-validator';
import { SourceMotionDto } from './dto/source-motion.dto';
import { SourceChatService } from "./source-chat.service";
import { SendSourceMessageDto } from "./dto/send-source-message.dto";
import { BadRequestException, Body, Controller, Get, Header, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { EditSourceFileDto, SaveSourceProjectDto, SourceProjectRevisionDto } from "./dto/save-source-project.dto";
import { SourceProjectsService } from "./source-projects.service";
import { SourceGenerationService } from "./source-generation.service";
import { GenerateSourceProjectDto } from "./dto/generate-source-project.dto";

class ContactFormDto extends SourceProjectRevisionDto { @IsBoolean() enabled!: boolean; }

@ApiTags("storefront-source-projects")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId/source-project")
export class SourceProjectsController {
  constructor(private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService, private readonly chat: SourceChatService) {}

  @Patch('contact-form')
  contactForm(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: ContactFormDto) {
    return this.projects.setContactForm(merchant.id, storeId, input.revision, input.enabled);
  }

  @Patch("motion")
  setMotion(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: SourceMotionDto) {
    return this.projects.setMotion(merchant.id, storeId, input.revision, input.motion);
  }

  @Get("catalog")
  @Header("Cache-Control", "private, no-store")
  catalog(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.generation.catalog(merchant.id, storeId);
  }

  @Get("conversation")
  @Header("Cache-Control", "private, no-store")
  conversation(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.chat.conversation(merchant.id, storeId);
  }

  @Post("messages")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  message(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: SendSourceMessageDto) {
    return this.chat.send(merchant.id, storeId, input);
  }

  @Get('progress')
  @Header('Cache-Control', 'private, no-store')
  progress(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.chat.progress(merchant.id, storeId, requestId);
  }

  @Post('estimate')
  estimate(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: SendSourceMessageDto) {
    return this.generation.estimate(merchant.id, storeId, input);
  }

  @Get('usage')
  @Header('Cache-Control', 'private, no-store')
  usage(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    return this.generation.usage(merchant.id, storeId);
  }

  @Post("generate")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async generate(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: GenerateSourceProjectDto) {
    const current = await this.projects.current(merchant.id, storeId);
    if (!current.revision) throw new BadRequestException('Antes de crear tu primer sitio, responde las preguntas de YAPI en el chat.');
    return this.generation.generate(merchant.id, storeId, input);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  state(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Query("before", new ParseIntPipe({ optional: true })) before?: number) {
    return this.projects.state(merchant.id, storeId, before);
  }

  @Patch("file")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  editFile(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: EditSourceFileDto) {
    return this.projects.editFile(merchant.id, storeId, input);
  }

  @Put()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  save(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: SaveSourceProjectDto) {
    return this.projects.save(merchant.id, storeId, input);
  }

  @Get("versions/:revision")
  @Header("Cache-Control", "private, no-store")
  async version(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("revision", ParseIntPipe) revision: number) {
    const saved = await this.projects.version(merchant.id, storeId, revision);
    const snapshot = await currentSourceRuntime(saved.snapshot as unknown as SourceProjectSnapshot);
    const catalog = await this.generation.catalog(merchant.id, storeId);
    return { ...saved, snapshot: { ...snapshot, files: snapshot.files.map(file => {
      if (file.path !== 'config.js') return file;
      const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
      if (!match) return file;
      const config = JSON.parse(match[1]);
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: catalog })};` };
    }) } };

  }

  @Post("versions/:revision/restore")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  restore(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("revision", ParseIntPipe) revision: number, @Body() input: SourceProjectRevisionDto) {
    return this.projects.restore(merchant.id, storeId, revision, input.revision);
  }

  @Get("versions/:revision/export")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async archive(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("revision", ParseIntPipe) revision: number) {
    const { filename, buffer } = await this.projects.archive(merchant.id, storeId, revision);
    return new StreamableFile(buffer, { type: "application/zip", disposition: `attachment; filename="${filename}"`, length: buffer.length });
  }
}
