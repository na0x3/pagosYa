import { Body, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { InboxService } from "./inbox.service";
import { InboxStoreResolver } from "./inbox-store-resolver";
import { InboundSignatureVerifier } from "./inbound-signature.verifier";

/**
 * Public on purpose: Resend calls it, not a merchant session. The signature is
 * the only credential, and it is checked before anything is read, the same
 * order the dLocal and Baneco webhooks use.
 */
@ApiTags("internal")
@Controller("v1/email")
export class InboxWebhookController {
  constructor(
    private readonly inbox: InboxService,
    private readonly stores: InboxStoreResolver,
    private readonly verifier: InboundSignatureVerifier,
  ) {}

  @Post("inbound")
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async receive(
    @Req() req: { rawBody?: Buffer },
    @Headers() headers: Record<string, string>,
    @Body() payload: {
      type: string;
      data: {
        to: string[]; from: string; subject: string;
        message_id: string | null; in_reply_to: string | null; references: string | null;
        text: string | null; html: string | null; attachments?: unknown[];
      };
    },
  ) {
    this.verifier.verify(headers, req.rawBody);
    if (payload.type !== "email.received") return { received: true };

    const recipient = payload.data.to[0] ?? "";
    const store = await this.stores.findByInboundAddress(recipient);
    if (!store) return { received: true };

    const thread = await this.inbox.resolveInboundThread(
      store.id,
      { inReplyTo: payload.data.in_reply_to, references: payload.data.references },
      payload.data.from,
    );
    // No thread means nobody at this store was talking to them. The address is
    // public, so this is the line that keeps the inbox from becoming a spam bin.
    if (!thread) return { received: true };

    await this.inbox.recordInbound({
      threadId: thread.id, fromEmail: payload.data.from, toEmail: recipient,
      html: payload.data.html, text: payload.data.text,
      messageId: payload.data.message_id, inReplyTo: payload.data.in_reply_to,
      hadAttachments: (payload.data.attachments ?? []).length > 0,
    });
    return { received: true };
  }
}
