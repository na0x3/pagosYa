import { currentSourceRuntime } from './source-runtime';
import { withSeededDna } from './source-dna';
import { withLiveCatalog } from './source-store-config';
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
import { SourceVisualEditDto } from './dto/source-visual-edit.dto';
import { CompileBudget, MerchantThrottlerGuard } from './source-compile-budget';

class ContactFormDto extends SourceProjectRevisionDto { @IsBoolean() enabled!: boolean; }

@ApiTags("storefront-source-projects")
@ApiBearerAuth()
// The throttler runs after the auth guard so it can charge the merchant, not the address.
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller("v1/stores/:storeId/source-project")
export class SourceProjectsController {
  constructor(private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService, private readonly chat: SourceChatService) {}

  // Recompiles the whole project with eleven new pages, so it has a tight limit like the other compile-heavy routes.
  @Post('standard-pages')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @CompileBudget()
  addStandardPages(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: SourceProjectRevisionDto) {
    return this.projects.addStandardPages(merchant.id, storeId, input.revision);
  }

  @Patch('contact-form')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @CompileBudget()
  contactForm(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: ContactFormDto) {
    return this.projects.setContactForm(merchant.id, storeId, input.revision, input.enabled);
  }

  // A four-value toggle that recompiles the whole project; it had no route limit.
  @Patch("motion")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @CompileBudget()
  setMotion(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: SourceMotionDto) {
    return this.projects.setMotion(merchant.id, storeId, input.revision, input.motion, input.scrollFeel);
  }

  @Get("catalog")
  @Header("Cache-Control", "private, no-store")
  catalog(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.generation.catalog(merchant.id, storeId, { assistant: true });
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

  @Get('draft-preview')
  @Header('Cache-Control', 'private, no-store')
  draftPreview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('since') since?: string) {
    const after = since !== undefined && /^\d{1,15}$/.test(since) ? Number(since) : undefined;
    return this.chat.draftPreview(merchant.id, storeId, after);
  }

  @Get('progress')
  @Header('Cache-Control', 'private, no-store')
  progress(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.chat.progress(merchant.id, storeId, requestId);
  }

  @Get('style-proposal')
  @Header('Cache-Control', 'private, no-store')
  styleProposal(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    return this.chat.styleProposal(merchant.id, storeId);
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
  @CompileBudget()
  async generate(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: GenerateSourceProjectDto) {
    const current = await this.projects.current(merchant.id, storeId);
    if (!current.revision) throw new BadRequestException('Antes de crear tu primer sitio, responde las preguntas de YAPI en el chat.');
    return this.generation.generate(merchant.id, storeId, input);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  async state(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Query("before", new ParseIntPipe({ optional: true })) before?: number) {
    const state = await this.projects.state(merchant.id, storeId, before);
    // Spec 2026-10-12: Studio shows «YAPI está puliendo tu tienda…» and polls this every 4 s while it is true.
    return { ...state, reviewPending: await this.generation.reviewPending(storeId, state.revision) };
  }

  // Studio stops YAPI's background polish when the merchant starts editing, so the polish never lands over their work.
  @Post('review/cancel')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async cancelReview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    await this.projects.current(merchant.id, storeId);
    return { cancelled: await this.generation.cancelReview(storeId) };
  }

  @Patch("file")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @CompileBudget()
  editFile(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: EditSourceFileDto) {
    return this.projects.editFile(merchant.id, storeId, input);
  }

  @Get('visual-fields')
  @Header('Cache-Control', 'private, no-store')
  visualFields(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('revision', ParseIntPipe) revision: number) {
    return this.projects.visualFields(merchant.id, storeId, revision);
  }

  @Patch('visual-edit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @CompileBudget()
  visualEdit(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: SourceVisualEditDto) {
    return this.projects.visualEdit(merchant.id, storeId, input);
  }

  @Put()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @CompileBudget()
  save(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: SaveSourceProjectDto) {
    return this.projects.save(merchant.id, storeId, input);
  }

  @Get("versions/:revision")
  @Header("Cache-Control", "private, no-store")
  async version(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("revision", ParseIntPipe) revision: number) {
    const saved = await this.projects.version(merchant.id, storeId, revision);
    const snapshot = await currentSourceRuntime(saved.snapshot as unknown as SourceProjectSnapshot);
    const catalog = await this.generation.catalog(merchant.id, storeId, { assistant: true });
    return { ...saved, snapshot: { ...snapshot, files: withLiveCatalog(withSeededDna(snapshot.files, storeId), catalog) } };

  }

  @Post("versions/:revision/restore")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @CompileBudget()
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
