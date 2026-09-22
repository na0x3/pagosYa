import { Body, Controller, Get, Header, Param, Post, UseGuards } from "@nestjs/common";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { InboxService } from "./inbox.service";
import { InboxReplyDto } from "./inbox-reply.dto";

/**
 * Merchant-facing inbox: list a store's conversations, read one, reply.
 * Guarded exactly like EmailWorkspaceController — a dashboard session or a
 * secret key, never the public webhook credential used by InboxWebhookController.
 */
@Controller("v1/stores/:storeId/inbox")
@UseGuards(MerchantAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentMerchant() m: { id: string }, @Param("storeId") storeId: string) {
    return this.inbox.listThreads(m.id, storeId);
  }

  @Get(":threadId")
  @Header("Cache-Control", "private, no-store")
  read(@CurrentMerchant() m: { id: string }, @Param("threadId") threadId: string) {
    return this.inbox.readThread(m.id, threadId);
  }

  @Post(":threadId/reply")
  reply(
    @CurrentMerchant() m: { id: string },
    @Param("threadId") threadId: string,
    @Body() dto: InboxReplyDto,
  ) {
    return this.inbox.reply(m.id, threadId, dto.body);
  }
}
