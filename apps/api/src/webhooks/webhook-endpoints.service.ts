import { Injectable, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWebhookEndpointDto } from "./dto/create-webhook-endpoint.dto";

const secretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 32);

@Injectable()
export class WebhookEndpointsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(merchantId: string, dto: CreateWebhookEndpointDto) {
    return this.prisma.webhookEndpoint.create({
      data: {
        merchantId,
        url: dto.url,
        enabledEvents: dto.enabledEvents ?? [],
        secret: `whsec_${secretPart()}`,
      },
    });
  }

  async list(merchantId: string) {
    return this.prisma.webhookEndpoint.findMany({ where: { merchantId, status: "ACTIVE" } });
  }

  /**
   * Soft-delete: a hard delete would either violate the FK from historical
   * WebhookEvent rows (RESTRICT) or, if cascaded, destroy delivery audit
   * history — neither is acceptable for a payments system. Setting
   * status != "ACTIVE" removes it from future dispatch (see
   * WebhookDispatcherService) while keeping history intact.
   */
  async remove(merchantId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, merchantId } });
    if (!endpoint) throw new NotFoundException("Webhook endpoint not found");
    await this.prisma.webhookEndpoint.update({ where: { id }, data: { status: "DELETED" } });
  }
}
