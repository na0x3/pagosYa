import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { LegalDocument, LegalDocumentKind, OpsRole, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../ops/audit-log.service";

const KIND_BY_SLUG: Record<string, LegalDocumentKind> = {
  "merchant-terms": LegalDocumentKind.MERCHANT_TERMS,
  "buyer-terms": LegalDocumentKind.BUYER_TERMS,
  "privacy-policy": LegalDocumentKind.PRIVACY_POLICY,
};

/** A publish may not claim to have been in force before it existed. */
const BACKDATE_TOLERANCE_MS = 60_000;

export function kindFromSlug(slug: string): LegalDocumentKind {
  const kind = KIND_BY_SLUG[slug];
  if (!kind) throw new NotFoundException("Documento legal no encontrado");
  return kind;
}

export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export interface PublishLegalDocumentInput {
  kind: LegalDocumentKind;
  version: string;
  title: string;
  body: string;
  effectiveAt: Date;
}

export interface PublishingOpsUser {
  id: string;
  name: string;
  email: string;
  role: OpsRole;
}

/**
 * pagosYa's own terms and privacy texts. Rows are immutable: acceptances
 * point at an exact row and its hash, which is the evidence ASFI asks for,
 * so a wording change is always a new version and never an edit.
 */
@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async publish(input: PublishLegalDocumentInput, actor: PublishingOpsUser, now = new Date()): Promise<LegalDocument> {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) {
      throw new ForbiddenException("Solo un administrador puede publicar documentos legales");
    }
    if (input.effectiveAt.getTime() < now.getTime() - BACKDATE_TOLERANCE_MS) {
      throw new BadRequestException("La fecha de vigencia no puede estar en el pasado");
    }
    const sha256 = sha256Hex(input.body);
    const actorLabel = `${actor.name} <${actor.email}>`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const document = await tx.legalDocument.create({
          data: { ...input, sha256, publishedByOpsUserId: actor.id, publishedByLabel: actorLabel },
        });
        await this.auditLog.record(tx, {
          actorType: "OpsUser",
          actorId: actor.id,
          actorLabel,
          action: "legal_document.publish",
          targetType: "LegalDocument",
          targetId: document.id,
          metadata: { kind: input.kind, version: input.version, sha256, effectiveAt: input.effectiveAt.toISOString() },
        });
        return document;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe esa versión para este documento");
      }
      throw error;
    }
  }

  current(kind: LegalDocumentKind, now = new Date()): Promise<LegalDocument | null> {
    return this.prisma.legalDocument.findFirst({
      where: { kind, effectiveAt: { lte: now } },
      orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
    });
  }

  upcoming(kind: LegalDocumentKind, now = new Date()): Promise<LegalDocument | null> {
    return this.prisma.legalDocument.findFirst({
      where: { kind, effectiveAt: { gt: now } },
      orderBy: [{ effectiveAt: "asc" }, { publishedAt: "desc" }],
    });
  }

  async getVersion(kind: LegalDocumentKind, version: string): Promise<LegalDocument> {
    const document = await this.prisma.legalDocument.findUnique({ where: { kind_version: { kind, version } } });
    if (!document) throw new NotFoundException("Versión no encontrada");
    return document;
  }

  /** Only the version in force or the announced next one may be accepted — never a stale text. */
  async resolveAcceptable(kind: LegalDocumentKind, version: string, now = new Date()): Promise<LegalDocument> {
    const [current, upcoming] = await Promise.all([this.current(kind, now), this.upcoming(kind, now)]);
    const match = [current, upcoming].find((document) => document?.version === version);
    if (!match) throw new BadRequestException("La versión de los términos no es válida o ya no está vigente");
    return match;
  }

  list() {
    return this.prisma.legalDocument.findMany({
      select: { id: true, kind: true, version: true, title: true, sha256: true, effectiveAt: true, publishedAt: true, publishedByLabel: true },
      orderBy: [{ kind: "asc" }, { effectiveAt: "desc" }],
    });
  }
}
