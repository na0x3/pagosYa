import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentMerchant } from "./decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { SecretApiKeyGuard } from "./guards/secret-api-key.guard";
import { ApiKeyService } from "./api-key.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";

@ApiTags("api_keys")
@ApiBearerAuth()
@Controller("v1/api_keys")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get()
  @UseGuards(MerchantAuthGuard)
  @ApiOperation({ summary: "List masked API-key metadata; secret values are never returned" })
  list(@CurrentMerchant() merchant: { id: string }) {
    return this.apiKeys.list(merchant.id);
  }

  @Post()
  @UseGuards(SecretApiKeyGuard)
  @ApiOperation({ summary: "Issue an API key; fullKey is returned once" })
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.issueManaged(merchant.id, dto.type, dto.mode, dto.label);
  }

  @Post(":id/rotate")
  @UseGuards(SecretApiKeyGuard)
  @ApiOperation({ summary: "Issue a replacement and revoke the selected API key" })
  rotate(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.apiKeys.rotate(merchant.id, id);
  }

  @Delete(":id")
  @UseGuards(SecretApiKeyGuard)
  @HttpCode(204)
  async revoke(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    await this.apiKeys.revoke(merchant.id, id);
  }
}
