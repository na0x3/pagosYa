import { Body, Controller, Get, Header, Param, Patch, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CommercePlatformService } from './commerce-platform.service';
class CreditDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) recipientName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) recipientEmail?: string;
  @IsUUID() reference!: string;
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsIn(['GIFT_CARD', 'STORE_CREDIT']) kind!: string;
  @IsInt() @Min(1) @Max(100000000) amount!: number;
  @IsIn(['BOB', 'USD']) currency!: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
class StatusDto { @IsBoolean() active!: boolean; }
class CreditRefundDto { @IsUUID() reference!: string; @IsInt() @Min(1) @Max(100000000) amount!: number; }
@Controller('v1/stores/:storeId/commerce')
@UseGuards(MerchantAuthGuard)
export class CommercePlatformController {
  constructor(private readonly commerce: CommercePlatformService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  list(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string) { return this.commerce.list(m.id, s); }
  @Post('credits') @Header('Cache-Control', 'private, no-store') issue(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string, @Body() dto: CreditDto) { return this.commerce.issueCredit(m.id, s, dto); }
  @Patch('credits/:id') status(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string, @Param('id') id: string, @Body() dto: StatusDto) { return this.commerce.creditStatus(m.id, s, id, dto.active); }
  @Post('orders/:id/credit-refund') refund(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string, @Param('id') id: string, @Body() dto: CreditRefundDto) { return this.commerce.creditRefund(m.id, s, id, dto.amount, dto.reference); }
  @Post('products/:id/files') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50_000_000 } }))
  upload(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) { return this.commerce.upload(m.id, s, id, file); }
  @Patch('files/:id') fileStatus(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string, @Param('id') id: string, @Body() dto: StatusDto) { return this.commerce.fileStatus(m.id, s, id, dto.active); }
}
@Controller('v1/commerce')
export class CommerceDownloadsController {
  constructor(private readonly commerce: CommercePlatformService) {}
  @Get('orders/:token/downloads') @Header('Cache-Control', 'private, no-store') @Throttle({ default: { limit: 20, ttl: 60000 } })
  list(@Param('token') token: string) { return this.commerce.downloads(token); }
  @Get('downloads/:token') @Throttle({ default: { limit: 30, ttl: 60000 } })
  async download(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const { asset, bytes } = await this.commerce.download(token);
    res.set({ 'Content-Type': asset.mimeType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(bytes);
  }
}
