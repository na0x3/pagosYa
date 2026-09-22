import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { htmlToText, parseReferences } from "./inbox-correlation";
import { workspaceMail, workspaceSender } from "../email-workspace/email-workspace.config";

export interface InboundHeaders { inReplyTo: string | null; references: string | null }

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A reply is matched by the id of the message it answers. Clients that drop
   * those headers still reach the right place through the sender's newest open
   * thread, which is why a store only ever has one open thread per address.
   *
   * The header alone is NOT enough to accept a thread. Message-IDs travel in
   * every forward and every quoted reply, so anyone the shopper forwards our
   * mail to can answer carrying our In-Reply-To. Trusting that would file a
   * stranger's message into the shopper's conversation, and — worse — the
   * merchant's next reply goes to `thread.customerEmail`, i.e. to the shopper,
   * quoting a third party. So the sender must be the thread's own customer on
   * both paths; a forward from anyone else falls through and is dropped by the
   * caller as a sender with no conversation.
   */
  async resolveInboundThread(storeId: string, headers: InboundHeaders, fromEmail: string) {
    const from = fromEmail.trim().toLowerCase();
    const ids = [...parseReferences(headers.inReplyTo), ...parseReferences(headers.references)];
    if (ids.length) {
      const message = await this.prisma.storeInboxMessage.findFirst({
        where: { messageId: { in: ids } },
        orderBy: { createdAt: "desc" },
      });
      if (message) {
        const thread = await this.prisma.storeInboxThread.findUnique({ where: { id: message.threadId } });
        if (thread && thread.storeId === storeId && thread.customerEmail === from) return thread;
      }
    }
    return this.prisma.storeInboxThread.findFirst({
      where: { storeId, customerEmail: from, status: "OPEN" },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  /**
   * Idempotent by Message-ID. Svix redelivers whenever our 200 is slow or lost,
   * so the same mail arrives more than once as a matter of routine, not as an
   * edge case. StoreInboxMessage.messageId is @unique, so the second delivery
   * raises P2002; left unhandled that escapes the controller as a 500, Svix
   * reads the 500 as "try again" and the same payload loops for its whole
   * retry schedule. Swallowing just P2002 turns the repeat into the no-op it
   * is: the message is already filed, and the thread was already marked unread
   * by the delivery that won, so there is nothing left to do.
   */
  async recordInbound(args: {
    threadId: string; fromEmail: string; toEmail: string;
    html: string | null; text: string | null;
    messageId: string | null; inReplyTo: string | null; hadAttachments: boolean;
  }) {
    const body = args.text?.trim() || (args.html ? htmlToText(args.html) : "");
    try {
      await this.prisma.storeInboxMessage.create({
        data: {
          threadId: args.threadId, direction: "INBOUND",
          fromEmail: args.fromEmail.trim().toLowerCase(), toEmail: args.toEmail.trim().toLowerCase(),
          body, messageId: args.messageId, inReplyTo: args.inReplyTo,
          hadAttachments: args.hadAttachments,
        },
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === "P2002") return;
      throw error;
    }
    await this.prisma.storeInboxThread.update({
      where: { id: args.threadId },
      data: { unreadForMerchant: true, lastMessageAt: new Date() },
    });
  }

  /**
   * The database has no single-column key to upsert on for either origin: the
   * real uniqueness lives in two partial indexes (see migration 20260922040000),
   * one scoped to leadId where orderId is null and one scoped to orderId where
   * leadId is null, because Prisma's compound-unique-key input rejects null
   * outright at runtime ("PrismaClientValidationError") even though the column
   * is nullable. So thread lookup is a plain findFirst on the natural key, and
   * creation is a create guarded against the race where two requests for the
   * same lead/order both miss the findFirst: the loser's create hits the
   * partial unique index and fails with P2002, at which point it re-reads
   * instead of throwing, so both callers end up with the one thread that won.
   */
  private async findOrCreateThread(where: Prisma.StoreInboxThreadWhereInput, data: Prisma.StoreInboxThreadUncheckedCreateInput) {
    const existing = await this.prisma.storeInboxThread.findFirst({ where });
    if (existing) return { thread: existing, created: false };
    try {
      return { thread: await this.prisma.storeInboxThread.create({ data }), created: true };
    } catch (error) {
      if ((error as { code?: string } | null)?.code === "P2002") {
        const afterRace = await this.prisma.storeInboxThread.findFirst({ where });
        // Not `created`: somebody else created it, so whatever a caller would
        // only do for a brand-new thread has already been done by them.
        if (afterRace) return { thread: afterRace, created: false };
      }
      throw error;
    }
  }

  /**
   * The form inquiry is the first message of its own thread: the shopper already
   * wrote something, so the thread starts unread and with their text in it.
   *
   * The opening message is written ONLY when this call created the thread. Its
   * messageId is derived from the lead id and StoreInboxMessage.messageId is
   * @unique, so writing it on a repeat call raises P2002 — and this method is
   * called again for the same lead on every retry of the checkout enquiry path.
   * Guarding on `created` also keeps the shopper's text from being posted into
   * the conversation twice, which is the visible half of the same bug.
   */
  async threadForLead(lead: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null; message: string | null }) {
    const customerEmail = lead.customerEmail.trim().toLowerCase();
    const { thread, created } = await this.findOrCreateThread(
      { storeId: lead.storeId, customerEmail, leadId: lead.id },
      {
        storeId: lead.storeId, merchantId: lead.merchantId, subject: "Consulta desde la tienda",
        customerEmail, customerName: lead.customerName, leadId: lead.id, unreadForMerchant: true,
      },
    );
    if (created && lead.message?.trim()) {
      try {
        await this.prisma.storeInboxMessage.create({
          data: {
            threadId: thread.id, direction: "INBOUND", fromEmail: customerEmail,
            toEmail: "", body: lead.message.trim(), messageId: `lead.${lead.id}@pagosya`,
            inReplyTo: null, hadAttachments: false,
          },
        });
      } catch (error) {
        // Belt and braces against the same duplicate: the thread row and its
        // opening message are two statements, so a crash between them leaves a
        // thread whose message still needs writing on the next attempt.
        if ((error as { code?: string } | null)?.code !== "P2002") throw error;
      }
    }
    return thread;
  }

  /**
   * An order opens a thread so the buyer's reply to their receipt has somewhere
   * to land. Nobody has written yet, so it does not start unread.
   */
  async threadForOrder(order: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null }) {
    const customerEmail = order.customerEmail.trim().toLowerCase();
    const { thread } = await this.findOrCreateThread(
      { storeId: order.storeId, customerEmail, orderId: order.id },
      {
        storeId: order.storeId, merchantId: order.merchantId, subject: `Pedido ${order.id}`,
        customerEmail, customerName: order.customerName, orderId: order.id, unreadForMerchant: false,
      },
    );
    return thread;
  }

  /**
   * The store-ownership check happens here rather than in the controller so
   * the same guarantee holds for any future caller, not just the HTTP route.
   */
  async listThreads(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Tienda no encontrada");
    return this.prisma.storeInboxThread.findMany({
      where: { storeId },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true, subject: true, customerName: true, customerEmail: true,
        unreadForMerchant: true, lastMessageAt: true, leadId: true, orderId: true,
      },
    });
  }

  /**
   * Opening a thread is what marks it read: a merchant who never opens it
   * keeps seeing it as unread, which is the whole point of the flag.
   *
   * merchantId is the real security gate (checked first, on its own).
   * storeId is checked second, only so the URL's store scope is not
   * decorative — a mismatch reuses the same "not found" message as the
   * wrong-merchant case so it never reveals the thread exists elsewhere.
   */
  async readThread(merchantId: string, threadId: string, storeId: string) {
    const thread = await this.prisma.storeInboxThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.merchantId !== merchantId) throw new NotFoundException("Conversación no encontrada");
    if (thread.storeId !== storeId) throw new NotFoundException("Conversación no encontrada");
    const messages = await this.prisma.storeInboxMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });
    await this.prisma.storeInboxThread.update({ where: { id: threadId }, data: { unreadForMerchant: false } });
    return { thread: { ...thread, unreadForMerchant: false }, messages };
  }

  /**
   * The outbound half rides the existing delivery queue, so retries, dedupe and
   * the verified sending domain are already solved. The inbox only records that
   * the message belongs to this conversation.
   *
   * merchantId is checked first (the real gate); storeId is checked second so
   * the URL's store scope is enforced, not decorative — same "not found"
   * message either way, so a mismatch never reveals the thread exists
   * elsewhere.
   */
  async reply(merchantId: string, threadId: string, storeId: string, body: string) {
    const thread = await this.prisma.storeInboxThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.merchantId !== merchantId) throw new NotFoundException("Conversación no encontrada");
    if (thread.storeId !== storeId) throw new NotFoundException("Conversación no encontrada");

    const messageId = `${threadId}.${Date.now()}@pagosya`;
    const retention = await this.prisma.storeRetention.findUnique({ where: { storeId: thread.storeId } });
    const domain = workspaceMail(retention?.settings).domain;
    if (domain?.status !== "verified") throw new BadRequestException("Verifica el dominio de correo de la tienda para responder desde aquí.");

    // The whole inbound half of this feature hangs on these two fields.
    //
    // From stays whatever workspaceSender builds — the store's own branded
    // sending address — because that is what the shopper sees and the brand
    // requirement of the spec. But Reply-To must be the address whose MX we
    // control, i.e. the same hola@inbound.<domain> that InboxStoreResolver
    // parses on the way in. Without it the delivery worker falls back to
    // `row.store.contactEmail`, the shopper's Reply lands in the merchant's
    // personal mailbox, and our webhook is never called at all.
    //
    // Message-ID is the other half: it is the id the shopper's client quotes
    // back in In-Reply-To, which resolveInboundThread matches against the
    // StoreInboxMessage row written just below with that same id.
    const inboundAddress = `hola@inbound.${domain.name}`;
    // Derived from the very function that builds the From header, so the row
    // recorded here cannot drift from the address actually put on the wire.
    const sender = workspaceSender(retention?.settings);
    const fromEmail = sender?.match(/<([^<>]+)>/)?.[1]?.trim() || sender || `notificaciones@${domain.name}`;
    await this.prisma.storeEmailDelivery.upsert({
      where: { dedupeKey: `inbox:${messageId}` },
      create: {
        storeId: thread.storeId, email: thread.customerEmail, kind: "INBOX_REPLY",
        sourceId: threadId, subject: `Re: ${thread.subject}`, body,
        replyTo: inboundAddress, messageIdHeader: messageId, dedupeKey: `inbox:${messageId}`,
      },
      update: {},
    });
    await this.prisma.storeInboxMessage.create({
      data: {
        threadId, direction: "OUTBOUND",
        // What was really sent, not the address we asked them to answer to.
        fromEmail, toEmail: thread.customerEmail,
        body, messageId, inReplyTo: null, hadAttachments: false,
      },
    });
    await this.prisma.storeInboxThread.update({
      where: { id: threadId },
      data: { unreadForMerchant: false, lastMessageAt: new Date() },
    });
  }
}
