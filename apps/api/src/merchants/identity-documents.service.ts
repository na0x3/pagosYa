import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KycDocumentSlot } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { AuditLogService } from "../ops/audit-log.service";
import { assertSafeImageDimensions, detectedMediaMime, MAX_IMAGE_UPLOAD_BYTES } from "../uploads/uploads.service";
import type { OpsActor } from "./kyc.service";

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SLOT_FIELD = { CI_FRONT: "ciFrontDocId", CI_BACK: "ciBackDocId", SELFIE: "selfieDocId" } as const;
type DocIds = Partial<Record<(typeof SLOT_FIELD)[KycDocumentSlot], string>>;

/** CI photos and selfies: private storage only, never the public /v1/uploads path. */
@Injectable()
export class IdentityDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PrivateFilesService,
    private readonly auditLog: AuditLogService,
  ) {}

  async upload(merchantId: string, slot: KycDocumentSlot, file: { buffer: Buffer; mimetype: string }) {
    if (!IMAGE_MIMES.has(file.mimetype)) throw new BadRequestException("Sube una foto en JPG, PNG o WEBP.");
    if (file.buffer.length > MAX_IMAGE_UPLOAD_BYTES) throw new BadRequestException("La foto supera los 8 MB.");
    if (detectedMediaMime(file.buffer) !== file.mimetype) throw new BadRequestException("El archivo no es una imagen válida.");
    assertSafeImageDimensions(file.buffer, file.mimetype);
    const storageKey = await this.files.put(file.buffer, file.mimetype);
    return this.prisma.merchantKycDocument.create({
      data: { merchantId, slot, storageKey, mimeType: file.mimetype, byteSize: file.buffer.length },
      select: { id: true, slot: true },
    });
  }

  async assertOwned(merchantId: string, ids: DocIds) {
    const wanted = (Object.keys(SLOT_FIELD) as KycDocumentSlot[]).flatMap((slot) => {
      const id = ids[SLOT_FIELD[slot]];
      return id ? [{ slot, id }] : [];
    });
    if (!wanted.length) return;
    const docs = await this.prisma.merchantKycDocument.findMany({ where: { id: { in: wanted.map((w) => w.id) } }, select: { id: true, merchantId: true, slot: true } });
    for (const w of wanted) {
      const doc = docs.find((d) => d.id === w.id);
      if (!doc || doc.merchantId !== merchantId || doc.slot !== w.slot) throw new BadRequestException("Vuelve a subir las fotos de tu CI.");
    }
  }

  async readForOps(submissionId: string, slot: KycDocumentSlot, actor: OpsActor) {
    const submission = await this.prisma.merchantKycSubmission.findUnique({ where: { id: submissionId } });
    const documentId = submission?.[SLOT_FIELD[slot]];
    if (!submission || !documentId) throw new NotFoundException("Documento no encontrado");
    const doc = await this.prisma.merchantKycDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.merchantId !== submission.merchantId) throw new NotFoundException("Documento no encontrado");
    const bytes = await this.files.get(doc.storageKey);
    await this.prisma.$transaction((tx) => this.auditLog.record(tx, {
      actorType: "OPS_USER",
      actorId: actor.id,
      actorLabel: `${actor.name} <${actor.email}>`,
      action: "kyc.document_viewed",
      targetType: "MerchantKycSubmission",
      targetId: submissionId,
      metadata: { slot, documentId },
    }));
    return { bytes, mimeType: doc.mimeType };
  }
}
