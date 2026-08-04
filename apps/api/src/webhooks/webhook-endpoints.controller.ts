import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { WebhookEndpointsService } from "./webhook-endpoints.service";
import { CreateWebhookEndpointDto } from "./dto/create-webhook-endpoint.dto";

@ApiTags("webhook_endpoints")
@ApiBearerAuth()
@UseGuards(SecretApiKeyGuard)
@Controller("v1/webhook_endpoints")
export class WebhookEndpointsController {
  constructor(private readonly webhookEndpoints: WebhookEndpointsService) {}

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreateWebhookEndpointDto) {
    return this.webhookEndpoints.create(merchant.id, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }) {
    return this.webhookEndpoints.list(merchant.id);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    await this.webhookEndpoints.remove(merchant.id, id);
  }
}
