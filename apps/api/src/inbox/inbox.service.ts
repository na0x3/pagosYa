import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { htmlToText, parseReferences } from "./inbox-correlation";
import { workspaceMail } from "../email-workspace/email-workspace.config";

export interface InboundHeaders { inReplyTo: string | null; references: string | null }

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A reply is matched by the id of the message it answers. Clients that drop
   * those headers still reach the right place through the sender's newest open
   * thread, which is why a store only ever has one open thread per address.
   */
  async resolveInboundThread(storeId: string, headers: InboundHeaders, fromEmail: string) {
    const ids = [...parseReferences(headers.inReplyTo), ...parseReferences(headers.references)];
    if (ids.length) {
      const message = await this.prisma.storeInboxMessage.findFirst({
        where: { messageId: { in: ids } },
        orderBy: { createdAt: "desc" },
      });
      if (message) {
        const thread = await this.prisma.storeInboxThread.findUnique({ where: { id: message.threadId } });
        if (thread && thread.storeId === storeId) return thread;
      }
    }
    return this.prisma.storeInboxThread.findFirst({
      where: { storeId, customerEmail: fromEmail.trim().toLowerCase(), status: "OPEN" },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  async recordInbound(args: {
    threadId: string; fromEmail: string; toEmail: string;
    html: string | null; text: string | null;
    messageId: string | null; inReplyTo: string | null; hadAttachments: boolean;
  }) {
    const body = args.text?.trim() || (args.html ? htmlToText(args.html) : "");
    await this.prisma.storeInboxMessage.create({
      data: {
        threadId: args.threadId, direction: "INBOUND",
        fromEmail: args.fromEmail.trim().toLowerCase(), toEmail: args.toEmail.trim().toLowerCase(),
        body, messageId: args.messageId, inReplyTo: args.inReplyTo,
        hadAttachments: args.hadAttachments,
      },
    });
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
    if (existing) return existing;
    try {
      return await this.prisma.storeInboxThread.create({ data });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === "P2002") {
        const afterRace = await this.prisma.storeInboxThread.findFirst({ where });
        if (afterRace) return afterRace;
      }
      throw error;
    }
  }

  /**
   * The form inquiry is the first message of its own thread: the shopper already
   * wrote something, so the thread starts unread and with their text in it.
   */
  async threadForLead(lead: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null; message: string | null }) {
    const customerEmail = lead.customerEmail.trim().toLowerCase();
    const thread = await this.findOrCreateThread(
      { storeId: lead.storeId, customerEmail, leadId: lead.id },
      {
        storeId: lead.storeId, merchantId: lead.merchantId, subject: "Consulta desde la tienda",
        customerEmail, customerName: lead.customerName, leadId: lead.id, unreadForMerchant: true,
      },
    );
    if (lead.message?.trim()) {
      await this.prisma.storeInboxMessage.create({
        data: {
          threadId: thread.id, direction: "INBOUND", fromEmail: customerEmail,
          toEmail: "", body: lead.message.trim(), messageId: `lead.${lead.id}@pagosya`,
          inReplyTo: null, hadAttachments: false,
        },
      });
    }
    return thread;
  }

  /**
   * An order opens a thread so the buyer's reply to their receipt has somewhere
   * to land. Nobody has written yet, so it does not start unread.
   */
  async threadForOrder(order: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null }) {
    const customerEmail = order.customerEmail.trim().toLowerCase();
    return this.findOrCreateThread(
      { storeId: order.storeId, customerEmail, orderId: order.id },
      {
        storeId: order.storeId, merchantId: order.merchantId, subject: `Pedido ${order.id}`,
        customerEmail, customerName: order.customerName, orderId: order.id, unreadForMerchant: false,
      },
    );
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
    await this.prisma.storeEmailDelivery.upsert({
      where: { dedupeKey: `inbox:${messageId}` },
      create: {
        storeId: thread.storeId, email: thread.customerEmail, kind: "INBOX_REPLY",
        sourceId: threadId, subject: `Re: ${thread.subject}`, body,
        replyTo: null, dedupeKey: `inbox:${messageId}`,
      },
      update: {},
    });
    await this.prisma.storeInboxMessage.create({
      data: {
        threadId, direction: "OUTBOUND",
        fromEmail: `hola@inbound.${domain.name}`, toEmail: thread.customerEmail,
        body, messageId, inReplyTo: null, hadAttachments: false,
      },
    });
    await this.prisma.storeInboxThread.update({
      where: { id: threadId },
      data: { unreadForMerchant: false, lastMessageAt: new Date() },
    });
  }
}
