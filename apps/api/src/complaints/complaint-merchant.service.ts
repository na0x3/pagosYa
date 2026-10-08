import { Injectable, NotFoundException } from "@nestjs/common";
import { ComplaintActor, ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { UploadedComplaintFile, checkComplaintFiles, safeFileName } from "./complaint-files";
import { recordComplaintEvent } from "./complaint-events";
import { assertCan, nextStatus } from "./complaint-state";
import { storeComplaintFiles } from "./complaint-intake.service";

const attachmentView = (a: { id: string; fileName: string; contentType: string; sizeBytes: number }) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes });

@Injectable()
export class ComplaintMerchantService {
  constructor(private readonly prisma: PrismaService, private readonly files: PrivateFilesService) {}

  /** A merchant sees a complaint only once ops has asked them about it, and only their own. */
  private scope(merchantId: string, id?: string) {
    return { ...(id ? { id } : {}), merchantId, merchantDueAt: { not: null } };
  }

  async list(merchantId: string, now = new Date()) {
    const rows = await this.prisma.complaint.findMany({
      where: this.scope(merchantId),
      orderBy: { receivedAt: "desc" },
      take: 100,
      select: { id: true, number: true, status: true, category: true, receivedAt: true, merchantDueAt: true },
    });
    return rows.map((row) => {
      const waitingOnYou = row.status === ComplaintStatus.WAITING_MERCHANT;
      return { ...row, waitingOnYou, late: waitingOnYou && !!row.merchantDueAt && row.merchantDueAt.getTime() < now.getTime() };
    });
  }

  private async load(merchantId: string, id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: this.scope(merchantId, id),
      include: {
        paymentIntent: { select: { id: true, amount: true, currency: true, createdAt: true } },
        events: { orderBy: { createdAt: "asc" }, include: { attachments: true } },
      },
    });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    return complaint;
  }

  async get(merchantId: string, id: string) {
    const c = await this.load(merchantId, id);
    return {
      id: c.id,
      number: c.number,
      status: c.status,
      category: c.category,
      request: c.request,
      description: c.description,
      buyerName: c.buyerName,
      receivedAt: c.receivedAt,
      merchantDueAt: c.merchantDueAt,
      payment: c.paymentIntent,
      questions: c.events.filter((e) => e.type === ComplaintEventType.MERCHANT_ASKED).map((e) => ({ at: e.createdAt, body: e.body ?? "" })),
      replies: c.events
        .filter((e) => e.type === ComplaintEventType.MERCHANT_REPLIED)
        .map((e) => ({ at: e.createdAt, body: e.body ?? "", late: Boolean((e.meta as { late?: boolean } | null)?.late), attachments: e.attachments.map(attachmentView) })),
      buyerAttachments: c.events.flatMap((e) => e.attachments.filter((a) => a.uploadedBy === ComplaintActor.BUYER)).map(attachmentView),
    };
  }

  async reply(merchantId: string, merchantUserId: string, id: string, body: string, uploads?: UploadedComplaintFile[], now = new Date()) {
    const complaint = await this.load(merchantId, id);
    assertCan("merchantReply", complaint.status);
    const stored = await storeComplaintFiles(this.files, checkComplaintFiles(uploads));
    const late = !!complaint.merchantDueAt && now.getTime() > complaint.merchantDueAt.getTime();
    await this.prisma.$transaction(async (tx) => {
      await tx.complaint.update({ where: { id }, data: { status: nextStatus("merchantReply", complaint.status) } });
      const event = await recordComplaintEvent(tx, id, { type: ComplaintEventType.MERCHANT_REPLIED, actor: ComplaintActor.MERCHANT, actorId: merchantUserId, body: body.trim(), meta: { late } });
      for (const { storageKey, file } of stored) {
        await tx.complaintAttachment.create({
          data: { complaintId: id, eventId: event.id, uploadedBy: ComplaintActor.MERCHANT, storageKey, fileName: safeFileName(file.originalname), contentType: file.contentType, sizeBytes: file.size },
        });
      }
    });
    return this.get(merchantId, id);
  }

  async attachment(merchantId: string, id: string, attachmentId: string) {
    await this.load(merchantId, id);
    const attachment = await this.prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId: id, uploadedBy: { in: [ComplaintActor.BUYER, ComplaintActor.MERCHANT] } } });
    if (!attachment) throw new NotFoundException("Archivo no encontrado");
    return { bytes: await this.files.get(attachment.storageKey), fileName: attachment.fileName, contentType: attachment.contentType };
  }
}
