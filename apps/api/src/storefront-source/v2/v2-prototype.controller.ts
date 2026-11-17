import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { CurrentMerchant } from '../../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../../dashboard/guards/merchant-auth.guard';
import { SourceV2PrototypeService } from './v2-prototype.service';

class V2PrototypeDto {
  @IsOptional() @IsInt() @Min(0) revision?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true }) references?: string[];
  /** The merchant asked for product cards of their own design: the AI styles the cards too (otherwise they are the platform's). */
  @IsOptional() @IsBoolean() restyleCards?: boolean;
  /** Owner 2026-11-14 («lets try creating an animated store»): a store with motion as its signature (also from the merchant's words). */
  @IsOptional() @IsBoolean() animated?: boolean;
  /** Owner 2026-11-16: one run on a Claude model (paid from the Anthropic key), with a spending cap in dollars. */
  @IsOptional() @IsIn(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']) model?: string;
  @IsOptional() @IsNumber() @Min(0.5) @Max(50) maxUsd?: number;
  /** false: library-first sections; true: free mode (each section written from scratch). Unset: YAPI_V2_FREE. */
  @IsOptional() @IsBoolean() free?: boolean;
  /** Owner 2026-11-16: remix the store to feel like this site (its structure, palette and type; never its content). */
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) remix?: string;
  /** Owner 2026-11-16: drop the taste rules for this run — only what keeps the store working is checked. */
  @IsOptional() @IsBoolean() loose?: boolean;
  /** «nov14»: the rules Gramiyaa r3 was built with (free mode, basic breakage checks only). */
  @IsOptional() @IsIn(['nov14', 'strict']) rules?: string;
}

class V2StudyDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) hosts?: string[];
  @IsOptional() @IsBoolean() force?: boolean;
}

/** Spec 2026-11-14 V2 prototype: dev-only (404 unless YAPI_V2_PROTO=1, never in production). Starts one AI-written design for the
 *  store in the background and reports its stages (GET); the result is a draft revision, never published. */
@ApiTags('storefront-source-v2-prototype')
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/source-project/v2-prototype')
export class SourceV2PrototypeController {
  constructor(private readonly v2: SourceV2PrototypeService) {}

  @Post()
  start(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: V2PrototypeDto) {
    return this.v2.start(merchant.id, storeId, body);
  }

  @Get()
  status(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    return this.v2.status(merchant.id, storeId);
  }

  /** The latest V2 design put together again with the platform's current parts, built and saved — no model call. */
  @Post('reassemble')
  reassemble(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: { cart?: { look?: string; photo?: string }; css?: string } = {}) {
    return this.v2.reassemble(merchant.id, storeId, body?.cart, typeof body?.css === 'string' ? body.css : undefined);
  }

  /** Owner 2026-11-15: YAPI looks at screenshots of the latest V2 design and fixes what it sees (background; GET reports it). */
  @Post('look')
  look(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: { notes?: unknown } = {}) {
    // Notes from whoever reviewed the store (owner 2026-11-15: the leftovers a look missed) are fixed first, then looked at.
    const notes = Array.isArray(body?.notes) ? body.notes.filter((line): line is string => typeof line === 'string' && Boolean(line.trim())).slice(0, 8).map(line => line.slice(0, 600)) : [];
    return this.v2.startLook(merchant.id, storeId, notes);
  }

  /** The study library (owner 2026-11-14): writes the recipe card of every captured reference store that has none yet. */
  @Post('references/study')
  study(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: V2StudyDto) {
    return this.v2.startStudy(merchant.id, storeId, body);
  }

  @Get('references/study')
  studyStatus(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    return this.v2.studyStatus(merchant.id, storeId);
  }
}
