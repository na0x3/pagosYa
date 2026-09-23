import { BadRequestException, Injectable } from "@nestjs/common";
import { LegalDocument, LegalDocumentKind, TermsAcceptanceSource } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LegalDocumentsService } from "./legal-documents.service";

export interface AcceptanceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type LegalDocumentSummary = { version: string; title: string; effectiveAt: Date; sha256: string };

export interface MerchantTermsStatus {
  current: LegalDocumentSummary | null;
  upcoming: LegalDocumentSummary | null;
  acceptedVersion: string | null;
  needsAcceptance: boolean;
}

const USER_AGENT_MAX = 512;

export function truncateUserAgent(value?: string | null): string | null {
  return value ? value.slice(0, USER_AGENT_MAX) : null;
}

function summary(document: LegalDocument | null): LegalDocumentSummary | null {
  return document
    ? { version: document.version, title: document.title, effectiveAt: document.effectiveAt, sha256: document.sha256 }
    : null;
}

/**
 * Who accepted which exact text of pagosYa's terms. Merchant acceptance gates
 * KYC and payouts; buyer acceptance is recorded per PaymentIntent. While no
 * merchant terms are in force nothing is gated, so this ships before the
 * lawyer's text does.
 */
@Injectable()
export class TermsAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalDocumentsService,
  ) {}

  async merchantStatus(merchantId: string, now = new Date()): Promise<MerchantTermsStatus> {
    const [current, upcoming, accepted] = await Promise.all([
      this.legal.current(LegalDocumentKind.MERCHANT_TERMS, now),
      this.legal.upcoming(LegalDocumentKind.MERCHANT_TERMS, now),
      this.prisma.merchantTermsAcceptance.findMany({
        where: { merchantId, document: { kind: LegalDocumentKind.MERCHANT_TERMS } },
        include: { document: true },
      }),
    ]);
    const latestAccepted = accepted
      .map((row) => row.document)
      .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0] ?? null;
    // Accepting the announced next version early also covers the one in force today.
    const coversCurrent = latestAccepted !== null && current !== null
      && (latestAccepted.id === current.id || latestAccepted.effectiveAt > current.effectiveAt);

    return {
      current: summary(current),
      upcoming: summary(upcoming),
      acceptedVersion: latestAccepted?.version ?? null,
      needsAcceptance: current !== null && !coversCurrent,
    };
  }

  async needsMerchantAcceptance(merchantId: string, now = new Date()): Promise<boolean> {
    return (await this.merchantStatus(merchantId, now)).needsAcceptance;
  }

  async acceptMerchantTerms(params: {
    merchantId: string;
    merchantUserId?: string | null;
    version: string;
    source: TermsAcceptanceSource;
    context: AcceptanceContext;
    now?: Date;
  }): Promise<MerchantTermsStatus> {
    const now = params.now ?? new Date();
    const document = await this.legal.resolveAcceptable(LegalDocumentKind.MERCHANT_TERMS, params.version, now);
    await this.recordMerchantAcceptance({ ...params, document });
    return this.merchantStatus(params.merchantId, now);
  }

  /** Idempotent: re-accepting the same text keeps the first record as the evidence. */
  async recordMerchantAcceptance(params: {
    merchantId: string;
    merchantUserId?: string | null;
    document: LegalDocument;
    source: TermsAcceptanceSource;
    context: AcceptanceContext;
  }): Promise<void> {
    await this.prisma.merchantTermsAcceptance.upsert({
      where: { merchantId_documentId: { merchantId: params.merchantId, documentId: params.document.id } },
      create: {
        merchantId: params.merchantId,
        merchantUserId: params.merchantUserId ?? null,
        documentId: params.document.id,
        source: params.source,
        ipAddress: params.context.ipAddress ?? null,
        userAgent: truncateUserAgent(params.context.userAgent),
      },
      update: {},
    });
  }

  /** Null when the checkout sent no version (custom merchant integrations). */
  async resolveBuyerDocuments(
    versions: { terms?: string; privacy?: string },
    now = new Date(),
  ): Promise<{ termsDocumentId: string; privacyDocumentId: string | null } | null> {
    if (!versions.terms) {
      if (versions.privacy) throw new BadRequestException("Falta la versión de los términos para compradores");
      return null;
    }
    const terms = await this.legal.resolveAcceptable(LegalDocumentKind.BUYER_TERMS, versions.terms, now);
    const privacy = versions.privacy
      ? await this.legal.resolveAcceptable(LegalDocumentKind.PRIVACY_POLICY, versions.privacy, now)
      : null;
    return { termsDocumentId: terms.id, privacyDocumentId: privacy?.id ?? null };
  }
}
