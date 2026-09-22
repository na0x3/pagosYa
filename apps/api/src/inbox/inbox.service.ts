import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { htmlToText, parseReferences } from "./inbox-correlation";

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
   * The form inquiry is the first message of its own thread: the shopper already
   * wrote something, so the thread starts unread and with their text in it.
   */
  async threadForLead(lead: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null; message: string | null }) {
    const customerEmail = lead.customerEmail.trim().toLowerCase();
    const thread = await this.prisma.storeInboxThread.upsert({
      // leadId/orderId are nullable columns; Prisma's generated compound-key type does not
      // model that, so the null half of the key needs a cast even though it is a valid value.
      where: { storeId_customerEmail_leadId_orderId: { storeId: lead.storeId, customerEmail, leadId: lead.id, orderId: null } } as unknown as Prisma.StoreInboxThreadWhereUniqueInput,
      create: {
        storeId: lead.storeId, merchantId: lead.merchantId, subject: "Consulta desde la tienda",
        customerEmail, customerName: lead.customerName, leadId: lead.id, unreadForMerchant: true,
      },
      update: {},
    });
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
    return this.prisma.storeInboxThread.upsert({
      where: { storeId_customerEmail_leadId_orderId: { storeId: order.storeId, customerEmail, leadId: null, orderId: order.id } } as unknown as Prisma.StoreInboxThreadWhereUniqueInput,
      create: {
        storeId: order.storeId, merchantId: order.merchantId, subject: `Pedido ${order.id}`,
        customerEmail, customerName: order.customerName, orderId: order.id, unreadForMerchant: false,
      },
      update: {},
    });
  }
}
