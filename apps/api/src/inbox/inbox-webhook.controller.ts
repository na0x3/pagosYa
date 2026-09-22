import { Body, Controller, Headers, HttpCode, Logger, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { InboxService } from "./inbox.service";
import { InboxStoreResolver } from "./inbox-store-resolver";
import { InboundSignatureVerifier } from "./inbound-signature.verifier";
import { InboundMailFetcher } from "./inbound-mail.fetcher";
import { parseReferences } from "./inbox-correlation";

/**
 * Public on purpose: Resend calls it, not a merchant session. The signature is
 * the only credential, and it is checked before anything is read, the same
 * order the dLocal and Baneco webhooks use.
 *
 * The payload is metadata only. Resend's `email.received` event carries the
 * sender, the recipient, the subject, the message's id and its attachment
 * filenames — and nothing else. The body and every header, In-Reply-To
 * included, are fetched afterwards through InboundMailFetcher. Reading
 * `payload.data.text` or `payload.data.in_reply_to` would read fields that do
 * not exist in a real delivery.
 */
@ApiTags("internal")
@Controller("v1/email")
export class InboxWebhookController {
  private readonly logger = new Logger(InboxWebhookController.name);

  constructor(
    private readonly inbox: InboxService,
    private readonly stores: InboxStoreResolver,
    private readonly verifier: InboundSignatureVerifier,
    private readonly mail: InboundMailFetcher,
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
        email_id?: string; id?: string;
        attachments?: unknown[];
      };
    },
  ) {
    this.verifier.verify(headers, req.rawBody);
    if (payload.type !== "email.received") return { received: true };

    const recipient = payload.data.to[0] ?? "";
    const store = await this.stores.findByInboundAddress(recipient);
    if (!store) return { received: true };

    // `email_id` is the documented field; `id` is accepted as a fallback only
    // so a payload-shape change does not silently drop every inbound mail.
    const emailId = payload.data.email_id ?? payload.data.id ?? "";
    const mail = await this.mail.fetch(emailId);
    // A failed fetch must not become a half-record: a row with an empty body
    // and no Message-ID would show the merchant a blank message and break
    // correlation for every later reply in that thread. We answer 200 anyway,
    // because the retry would fetch the same unavailable message again and
    // Svix would keep hammering this endpoint for its whole retry schedule.
    if (!mail) {
      this.logger.error(`Dropping inbound mail ${emailId || "(no id)"} for store ${store.id}: body could not be fetched`);
      return { received: true };
    }

    const inReplyTo = mail.headers["in-reply-to"] ?? null;
    const thread = await this.inbox.resolveInboundThread(
      store.id,
      { inReplyTo, references: mail.headers["references"] ?? null },
      payload.data.from,
    );
    // No thread means nobody at this store was talking to them. The address is
    // public, so this is the line that keeps the inbox from becoming a spam bin.
    if (!thread) return { received: true };

    await this.inbox.recordInbound({
      threadId: thread.id, fromEmail: payload.data.from, toEmail: recipient,
      html: mail.html, text: mail.text,
      // Stored bare, the same way parseReferences hands ids back, so a redelivery
      // of this exact message collides on the unique index and is skipped.
      messageId: parseReferences(mail.headers["message-id"])[0] ?? null,
      inReplyTo: parseReferences(inReplyTo)[0] ?? null,
      hadAttachments: (payload.data.attachments ?? []).length > 0,
    });
    return { received: true };
  }
}
