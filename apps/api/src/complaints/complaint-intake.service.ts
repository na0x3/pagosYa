import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ComplaintActor, ComplaintCategory, ComplaintEventType, ComplaintOutcome, ComplaintRequest, ComplaintStatus } from "@prisma/client";
import { randomInt } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { ANSWER_BUSINESS_DAYS, addBusinessDays, complaintYear } from "./complaint-dates";
import { CheckedComplaintFile, UploadedComplaintFile, checkComplaintFiles, safeFileName } from "./complaint-files";
import { formatComplaintNumber, nextComplaintNumber } from "./complaint-number";
import { readComplaintToken } from "./complaint-token";
import { recordComplaintEvent } from "./complaint-events";
import { assertCan } from "./complaint-state";
import { ComplaintMailer } from "./complaint-mailer";
import { SECOND_INSTANCE_NOTICE } from "./complaint-emails";
import { CreateComplaintDto } from "./dto/create-complaint.dto";

const PAYMENT_ID = /^pi_[0-9a-z]+$/;

export type BuyerComplaintView = {
  number: string;
  status: "RECEIVED" | "IN_REVIEW" | "ANSWERED";
  category: ComplaintCategory;
  request: ComplaintRequest;
  receivedAt: Date;
  dueAt: Date;
  extendedAt: Date | null;
  extensionReason: string | null;
  answeredAt: Date | null;
  outcome: ComplaintOutcome | null;
  answer: string | null;
  secondInstanceNotice: string | null;
  messages: Array<{ id: string; at: Date; body: string; attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number }> }>;
};

/** Uploads before the transaction (object storage can't join it); a failed transaction leaves unreferenced private files only. */
export async function storeComplaintFiles(files: PrivateFilesService, checked: CheckedComplaintFile[]) {
  const stored: Array<{ storageKey: string; file: CheckedComplaintFile }> = [];
  for (const file of checked) stored.push({ storageKey: await files.put(file.buffer, file.contentType), file });
  return stored;
}

const BUYER_EVENTS: ComplaintEventType[] = [ComplaintEventType.RECEIVED, ComplaintEventType.BUYER_MESSAGE];

@Injectable()
export class ComplaintIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PrivateFilesService,
    private readonly mailer: ComplaintMailer,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateComplaintDto, uploads: UploadedComplaintFile[] | undefined, now = new Date()) {
    const dueAt = addBusinessDays(now, ANSWER_BUSINESS_DAYS);
    if (dto.website?.trim()) {
      // A bot: same answer shape, nothing stored, nothing sent. The decoy id never exists, so its link shows "no encontrado".
      return { number: formatComplaintNumber(complaintYear(now), randomInt(1, 1_000_000)), dueAt, trackingUrl: this.mailer.trackingUrl(`c${randomInt(10 ** 9, 10 ** 10)}decoyxxxxxxxxxx`) };
    }
    const reference = dto.reference?.trim() || null;
    const storeName = dto.storeName?.trim() || null;
    if (!reference && !storeName) throw new BadRequestException("Escribe la referencia de tu pago o el nombre de la tienda.");
    const stored = await storeComplaintFiles(this.files, checkComplaintFiles(uploads));

    const complaint = await this.prisma.$transaction(async (tx) => {
      const number = await nextComplaintNumber(tx, now);
      const payment = reference && PAYMENT_ID.test(reference)
        ? await tx.paymentIntent.findUnique({ where: { id: reference }, select: { id: true, merchantId: true } })
        : null;
      const created = await tx.complaint.create({
        data: {
          number,
          category: dto.category,
          request: dto.request,
          buyerName: dto.buyerName.trim(),
          buyerEmail: dto.buyerEmail.trim().toLowerCase(),
          buyerPhone: dto.buyerPhone?.trim() || null,
          referenceGiven: reference,
          storeNameGiven: storeName,
          paymentIntentId: payment?.id ?? null,
          merchantId: payment?.merchantId ?? null,
          description: dto.description.trim(),
          receivedAt: now,
          dueAt,
        },
      });
      const received = await recordComplaintEvent(tx, created.id, { type: ComplaintEventType.RECEIVED, actor: ComplaintActor.BUYER, body: created.description });
      if (payment) {
        await recordComplaintEvent(tx, created.id, { type: ComplaintEventType.LINKED, actor: ComplaintActor.SYSTEM, meta: { paymentIntentId: payment.id, merchantId: payment.merchantId } });
      }
      for (const { storageKey, file } of stored) {
        await tx.complaintAttachment.create({
          data: { complaintId: created.id, eventId: received.id, uploadedBy: ComplaintActor.BUYER, storageKey, fileName: safeFileName(file.originalname), contentType: file.contentType, sizeBytes: file.size },
        });
      }
      return created;
    });

    await this.mailer.send("RECEIVED", complaint.id);
    return { number: complaint.number, dueAt, trackingUrl: this.mailer.trackingUrl(complaint.id) };
  }

  private complaintIdFrom(token: string): string {
    const id = readComplaintToken(token, this.config.get<string>("app.orderTrackingSecret") ?? "");
    if (!id) throw new NotFoundException("Reclamo no encontrado");
    return id;
  }

  private async load(token: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: this.complaintIdFrom(token) },
      include: { events: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
    });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    return complaint;
  }

  async track(token: string, now = new Date()): Promise<BuyerComplaintView> {
    const complaint = await this.load(token);
    if (!complaint.emailConfirmedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.complaint.update({ where: { id: complaint.id }, data: { emailConfirmedAt: now } });
        await recordComplaintEvent(tx, complaint.id, { type: ComplaintEventType.EMAIL_CONFIRMED, actor: ComplaintActor.BUYER });
      });
    }
    const answered = complaint.status === ComplaintStatus.ANSWERED;
    return {
      number: complaint.number,
      status: answered ? "ANSWERED" : complaint.status === ComplaintStatus.RECEIVED ? "RECEIVED" : "IN_REVIEW",
      category: complaint.category,
      request: complaint.request,
      receivedAt: complaint.receivedAt,
      dueAt: complaint.dueAt,
      extendedAt: complaint.extendedAt,
      extensionReason: complaint.extensionReason,
      answeredAt: complaint.answeredAt,
      outcome: complaint.outcome,
      answer: complaint.answer,
      secondInstanceNotice: answered ? SECOND_INSTANCE_NOTICE(complaint.number) : null,
      messages: complaint.events
        .filter((event) => event.actor === ComplaintActor.BUYER && BUYER_EVENTS.includes(event.type))
        .map((event) => ({
          id: event.id,
          at: event.createdAt,
          body: event.body ?? "",
          attachments: event.attachments.map(({ id, fileName, contentType, sizeBytes }) => ({ id, fileName, contentType, sizeBytes })),
        })),
    };
  }

  async addMessage(token: string, body: string, uploads?: UploadedComplaintFile[]): Promise<BuyerComplaintView> {
    const complaint = await this.load(token);
    assertCan("buyerMessage", complaint.status);
    const stored = await storeComplaintFiles(this.files, checkComplaintFiles(uploads));
    await this.prisma.$transaction(async (tx) => {
      const event = await recordComplaintEvent(tx, complaint.id, { type: ComplaintEventType.BUYER_MESSAGE, actor: ComplaintActor.BUYER, body: body.trim() });
      for (const { storageKey, file } of stored) {
        await tx.complaintAttachment.create({
          data: { complaintId: complaint.id, eventId: event.id, uploadedBy: ComplaintActor.BUYER, storageKey, fileName: safeFileName(file.originalname), contentType: file.contentType, sizeBytes: file.size },
        });
      }
    });
    return this.track(token);
  }

  async attachment(token: string, attachmentId: string) {
    const complaintId = this.complaintIdFrom(token);
    const attachment = await this.prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId, uploadedBy: ComplaintActor.BUYER } });
    if (!attachment) throw new NotFoundException("Archivo no encontrado");
    return { bytes: await this.files.get(attachment.storageKey), fileName: attachment.fileName, contentType: attachment.contentType };
  }
}
