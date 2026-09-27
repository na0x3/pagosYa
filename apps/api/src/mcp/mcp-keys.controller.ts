import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyMode, ApiKeyType } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiKeyService } from '../auth/api-key.service';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';

export class CreateMcpKeyDto {
  @IsOptional() @IsString() @MaxLength(60) label?: string;
}

/** Ajustes → Conecta tu IA: MCP keys are managed from the dashboard session, never with another API key. */
@ApiTags('mcp')
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller('v1/mcp/keys')
export class McpKeysController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get()
  async list(@CurrentMerchant() merchant: { id: string }) {
    return (await this.apiKeys.list(merchant.id)).filter(key => key.type === ApiKeyType.MCP);
  }

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreateMcpKeyDto) {
    return this.apiKeys.issue(merchant.id, ApiKeyType.MCP, ApiKeyMode.LIVE, dto.label?.trim() || undefined);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentMerchant() merchant: { id: string }, @Param('id') id: string) {
    const key = (await this.apiKeys.list(merchant.id)).find(entry => entry.id === id && entry.type === ApiKeyType.MCP);
    if (!key) throw new NotFoundException('No encontré esa clave.');
    await this.apiKeys.revoke(merchant.id, id);
  }
}
