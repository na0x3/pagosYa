import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessDocumentStatus, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import type { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { StructuredCompletionService } from "../ai/structured-completion";
import type { AcceptanceContext } from "../legal/terms-acceptance.service";
import { BusinessDocumentsService } from "./business-documents.service";
import { documentNumberLabel, type DocumentBlock, type DocumentSnapshot } from "./business-document-snapshot";
import { DEVELOPMENT_DOCUMENT_LINK_SECRET, readDocumentLinkToken } from "./document-link-token";
import { endOfLaPazDay, oneLine } from "./proposals.service";
import {
  cleanContractMeta,
  CONTRACT_TYPE_INFO,
  contractMetaBlock,
  contractTemplateClauses,
  prefillMerchantParty,
  splitContractContent,
  type ContractType,
} from "./contract-terms";
import {
  assembleContract,
  contractClauseSchema,
  contractDraftSchema,
  contractSystemPrompt,
  contractUserMessage,
  guardClauseText,
  type ContractClauseOutput,
  type ContractDraftInput,
  type ContractDraftOutput,
  type ContractDraftTerms,
} from "./contract-draft";
import {
  CODE_COOLDOWN_MS,
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  CODES_PER_DAY,
  codeMatches,
  generateSigningCode,
  hashSigningCode,
  maskEmail,
  signatureImage,
  VERIFIED_TTL_MS,
} from "./contract-signing";
import { expireContract, OPEN_CONTRACT, signingSummary, waitingFor, type SignatureRow } from "./contract-state";
import { renderContractPdf, type ContractPdfSignature } from "./contract-pdf";
import { buildCustomerSignedEmail, buildSignedCopyEmail, buildSigningCodeEmail } from "./contract-email";
import type {
  ContractCodeRequestDto,
  ContractCodeVerifyDto,
  DraftContractDto,
  PublicSignContractDto,
  RegenerateContractClauseDto,
  SignContractDto,
} from "./dto/business-document.dto";

const S = BusinessDocumentStatus;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a new contract can be signed unless the merchant picks another date. */
export const DEFAULT_SIGNING_DAYS = 30;

const FINAL: BusinessDocumentStatus[] = [S.ACCEPTED, S.SIGNED, S.PAID, S.DECLINED, S.EXPIRED, S.VOIDED];

export type MerchantActor = { userId: string | null; email: string | null; sessionRef: string | null };

type DraftedEventData = ContractDraftTerms & { contractType: ContractType; city: string; model: string | null };

type CodeEventData = { nonce: string; hash: string; expiresAt: string; to: string };

const stale = () => new ConflictException("El comercio actualizó el contrato. Vuelve a abrir el enlace y léelo antes de firmar.");

/**
 * D3: contracts on top of D0 documents — YAPI drafts the clauses (never the parties), the
 * merchant signs in the dashboard, the customer signs on the public link after confirming a
 * code sent to their email, and the fully signed contract is emailed to both as a PDF with an
 * evidence page. Sending, the link and voiding stay in D0.
 */
@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly documents: BusinessDocumentsService,
    private readonly ai: StructuredCompletionService,
  ) {}

  // ── merchant: drafting ────────────────────────────────────────────────

  /** "Crear borrador con IA" (or the template with `ai: false`): a DRAFT contract with the parties prefilled. */
  async draft(merchantId: string, storeId: string, dto: DraftContractDto) {
    const store = await this.ownedStore(merchantId, storeId);
    const proposal = dto.fromProposalId ? await this.acceptedProposal(storeId, dto.fromProposalId) : null;
    const objeto = dto.objeto?.trim() || (proposal ? proposalObjeto(proposal.snapshot) : "");
    if (objeto.length < 5) throw new BadRequestException("Cuéntanos de qué trata el contrato (al menos unas palabras).");
    const currency = proposal?.snapshot.currency ?? dto.currency ?? "BOB";
    const priceAmount = dto.priceAmount ?? (proposal && proposal.snapshot.totalAmount > 0 ? proposal.snapshot.totalAmount : null);
    const terms: ContractDraftTerms = {
      objeto,
      priceAmount,
      currency,
      paymentTerms: dto.paymentTerms?.trim() ?? "",
      plazo: dto.plazo?.trim() ?? "",
      extra: dto.extra?.trim() ?? "",
    };
    const input: ContractDraftInput = { contractType: dto.contractType, city: dto.city?.trim() ?? "", terms };

    let title: string;
    let clauses: DocumentBlock[];
    let model: string | null = null;
    if (dto.ai === false) {
      title = CONTRACT_TYPE_INFO[dto.contractType].title;
      clauses = contractTemplateClauses(dto.contractType, terms);
    } else {
      const result = await this.ai.structuredCompletion<ContractDraftOutput>({
        storeId,
        stage: "contract-draft",
        system: contractSystemPrompt(dto.contractType),
        user: contractUserMessage(input),
        schema: contractDraftSchema(dto.contractType),
        maxOutputTokens: 6000,
      });
      ({ title, clauses } = assembleContract(result.data, input));
      model = result.model;
    }

    const meta = cleanContractMeta({
      contractType: dto.contractType,
      city: input.city,
      signingOrder: dto.signingOrder ?? "merchant_first",
      merchantParty: prefillMerchantParty(await this.legalData(merchantId, store)),
      customerParty: { address: dto.customerAddress ?? "", representative: "", representativeDocument: "" },
    });
    const fromProposal = proposal?.snapshot.customer;
    const pick = (typed: string | undefined, fallback: string | null | undefined) => typed?.trim() || fallback?.trim() || undefined;
    const doc = await this.documents.create(
      merchantId,
      storeId,
      {
        kind: "CONTRACT",
        title,
        currency: currency as "BOB" | "USD",
        customerName: pick(dto.customerName, fromProposal?.name ?? proposal?.accepter.name),
        customerEmail: pick(dto.customerEmail, fromProposal?.email ?? proposal?.accepter.email)?.toLowerCase(),
        customerPhone: pick(dto.customerPhone, fromProposal?.phone),
        customerDocument: pick(dto.customerDocument, fromProposal?.document),
        content: [contractMetaBlock(meta), ...clauses] as never,
        validUntil: endOfLaPazDay(DEFAULT_SIGNING_DAYS).toISOString(),
      },
      proposal ? { fromProposal: proposal.id } : undefined,
    );
    const drafted: DraftedEventData = { ...terms, contractType: dto.contractType, city: input.city, model };
    await this.prisma.businessDocumentEvent.create({ data: { documentId: doc.id, type: "ai_drafted", data: drafted as unknown as Prisma.InputJsonValue } });
    if (proposal) {
      await this.prisma.businessDocumentEvent.create({ data: { documentId: proposal.id, type: "contract_created", dedupeKey: `contract:${doc.id}`, data: { contractId: doc.id } } });
    }
    return { ...doc, ai: model ? { model } : null };
  }

  /** "Regenerar con IA" on one clause: returned, not saved (the editor autosaves what the merchant keeps). */
  async regenerateClause(merchantId: string, storeId: string, id: string, dto: RegenerateContractClauseDto) {
    await this.ownedStore(merchantId, storeId);
    const doc = await this.prisma.businessDocument.findFirst({ where: { id, storeId } });
    if (!doc || doc.kind !== "CONTRACT") throw new NotFoundException("Contrato no encontrado");
    if (FINAL.includes(doc.status)) throw new ConflictException("Este contrato ya no se puede editar");
    if (await this.customerSigned(this.prisma, id, doc.currentVersion)) throw customerSignedConflict();
    const { meta, clauses } = splitContractContent(doc.content);
    const clause = clauses[dto.index];
    if (!clause || clause.type !== "clause") throw new NotFoundException("Cláusula no encontrada");
    const drafted = await this.prisma.businessDocumentEvent.findFirst({ where: { documentId: id, type: "ai_drafted" } });
    const data = (drafted?.data ?? {}) as Partial<DraftedEventData>;
    const terms: ContractDraftTerms = {
      objeto: data.objeto ?? doc.title,
      priceAmount: data.priceAmount ?? null,
      currency: doc.currency,
      paymentTerms: data.paymentTerms ?? "",
      plazo: data.plazo ?? "",
      extra: data.extra ?? "",
    };
    const input: ContractDraftInput = { contractType: meta.contractType, city: meta.city, terms };
    const result = await this.ai.structuredCompletion<ContractClauseOutput>({
      storeId,
      stage: "contract-clause",
      system: `${contractSystemPrompt(meta.contractType)}\n\nAhora escribe solo la cláusula pedida, como un párrafo (o incisos), sin título.`,
      user: contractUserMessage(input, { clausula: clause.title, textoActual: clause.text ?? "", pedido: dto.instruction?.trim() || "Mejora la redacción sin cambiar lo acordado." }),
      schema: contractClauseSchema,
      maxOutputTokens: 2000,
    });
    return { block: { type: "clause" as const, title: clause.title, text: guardClauseText(result.data.text, input) } };
  }

  /** The Contratos header: counts per tab, and how many wait for the merchant's signature. */
  async summary(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const rows = await this.prisma.businessDocument.findMany({
      where: { storeId, kind: "CONTRACT" },
      select: { id: true, status: true, validUntil: true, currentVersion: true, content: true, signatures: { select: { role: true, version: true, name: true, method: true, signedAt: true } } },
    });
    const now = Date.now();
    const counts = { all: rows.length, draft: 0, open: 0, signed: 0, closed: 0, awaitingYou: 0 };
    for (const row of rows) {
      const late = Boolean(row.validUntil && row.validUntil.getTime() < now);
      if (row.status === S.DRAFT) counts.draft += 1;
      else if (row.status === S.SIGNED) counts.signed += 1;
      else if (OPEN_CONTRACT.includes(row.status) && !late) {
        counts.open += 1;
        const signing = signingSummary(row.signatures as SignatureRow[], row.currentVersion);
        if (waitingFor(splitContractContent(row.content).meta.signingOrder, signing.merchantSigned, signing.customerSigned) === "merchant") counts.awaitingYou += 1;
      } else counts.closed += 1;
    }
    return counts;
  }

  // ── merchant: signing ─────────────────────────────────────────────────

  /** "Firmar" in the dashboard: the signed-in user's typed (or drawn) name on the current version. */
  async merchantSign(merchantId: string, storeId: string, id: string, dto: SignContractDto, actor: MerchantActor, context: AcceptanceContext) {
    await this.ownedStore(merchantId, storeId);
    const name = signerName(dto.name);
    const image = drawnImage(dto);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const doc = await tx.businessDocument.findFirst({ where: { id, storeId } });
      if (!doc || doc.kind !== "CONTRACT") throw new NotFoundException("Contrato no encontrado");
      if (doc.currentVersion < 1) throw new ConflictException("Envía el contrato antes de firmarlo.");
      if (doc.status === S.SIGNED) return { complete: false };
      const closed = await this.closedReason(tx, doc);
      if (closed) return closed;
      if (dto.version !== doc.currentVersion) throw new ConflictException(`Esta ya no es la versión vigente del contrato: vuelve a abrirlo y firma la versión ${doc.currentVersion}.`);
      const signatures = (await tx.businessDocumentSignature.findMany({ where: { documentId: id, version: doc.currentVersion } })) as SignatureRow[];
      const summary = signingSummary(signatures, doc.currentVersion);
      if (summary.merchantSigned) return { complete: false };
      const version = await this.versionRow(tx, id, doc.currentVersion);
      const snapshot = version.content as unknown as DocumentSnapshot;
      if (snapshot.contract?.signingOrder === "customer_first" && !summary.customerSigned) {
        throw new ConflictException("Este contrato pide que tu cliente firme primero. Te avisaremos por correo cuando firme.");
      }
      const merchant = await tx.merchant.findUnique({ where: { id: merchantId }, select: { email: true } });
      await tx.businessDocumentSignature.create({
        data: {
          documentId: id, role: "MERCHANT", name, method: dto.method, imageUrl: image, email: (actor.email || merchant?.email || "").toLowerCase(),
          codeVerifiedAt: null, ipAddress: context.ipAddress, userAgent: context.userAgent, version: doc.currentVersion, versionSha256: version.sha256,
        },
      });
      await tx.businessDocumentEvent.create({
        data: { documentId: id, type: "signed", version: doc.currentVersion, ipAddress: context.ipAddress, userAgent: context.userAgent, data: { role: "MERCHANT", name, method: dto.method, userId: actor.userId, sessionRef: actor.sessionRef } },
      });
      return { complete: await this.completeIfBoth(tx, id, doc.currentVersion) };
    });
    if ("kind" in outcome) throw new ConflictException(outcome.message);
    if (outcome.complete) await this.sendSignedCopies(id);
    return this.documents.get(merchantId, storeId, id);
  }

  // ── customer: code and signature ──────────────────────────────────────

  /** "Enviar código": 6 digits to the contract's customer email, kept only as an HMAC. */
  async requestCode(token: string, dto: ContractCodeRequestDto, context: AcceptanceContext) {
    const id = this.tokenId(token);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const { doc, snapshot } = await this.lockedContract(tx, id);
      const closed = await this.closedReason(tx, doc);
      if (closed) return closed;
      if (dto.version !== doc.currentVersion) throw stale();
      const summary = signingSummary((await tx.businessDocumentSignature.findMany({ where: { documentId: id, version: doc.currentVersion } })) as SignatureRow[], doc.currentVersion);
      if (summary.customerSigned) throw new ConflictException("Ya firmaste este contrato.");
      if (waitingFor(snapshot.contract?.signingOrder ?? "merchant_first", summary.merchantSigned, summary.customerSigned) === "merchant") {
        throw new ConflictException(`Esperando la firma de ${snapshot.contract?.merchantParty.legalName ?? "el comercio"}. Te avisaremos por correo cuando puedas firmar.`);
      }
      const to = snapshot.customer.email;
      if (!to) throw new ConflictException("Este contrato no tiene un correo para enviarte el código. Pídele al comercio que lo agregue.");
      const now = Date.now();
      const sentCodes = await tx.businessDocumentEvent.findMany({ where: { documentId: id, type: "sign_code_sent" } });
      const last = Math.max(0, ...sentCodes.map((event) => event.at.getTime()));
      if (now - last < CODE_COOLDOWN_MS) throw new HttpException("Espera un minuto antes de pedir otro código.", HttpStatus.TOO_MANY_REQUESTS);
      if (sentCodes.filter((event) => event.at.getTime() >= now - DAY_MS).length >= CODES_PER_DAY) {
        throw new HttpException("Ya pediste varios códigos hoy. Intenta mañana o escríbele al comercio.", HttpStatus.TOO_MANY_REQUESTS);
      }
      try {
        await this.documents.assertEmailQuota(tx, doc.storeId);
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 429) {
          throw new HttpException("Este comercio alcanzó su límite de correos de hoy. Intenta mañana o escríbele para que te ayude.", HttpStatus.TOO_MANY_REQUESTS);
        }
        throw error;
      }
      // The customer is on the page: that is a view, even if the view event was already recorded.
      await tx.businessDocument.updateMany({ where: { id, status: S.SENT }, data: { status: S.VIEWED } });
      const code = generateSigningCode();
      const nonce = randomBytes(12).toString("hex");
      const expiresAt = new Date(now + CODE_TTL_MS);
      const data: CodeEventData = { nonce, hash: hashSigningCode(this.secret(), id, nonce, code), expiresAt: expiresAt.toISOString(), to: maskEmail(to) };
      const event = await tx.businessDocumentEvent.create({
        data: { documentId: id, type: "sign_code_sent", version: doc.currentVersion, ipAddress: context.ipAddress, userAgent: context.userAgent, data },
      });
      return { kind: "sent" as const, code, to, eventId: event.id, storeId: doc.storeId, numberLabel: snapshot.numberLabel, version: doc.currentVersion, expiresAt };
    });
    if (outcome.kind === "closed") throw new ConflictException(outcome.message);
    const store = await this.prisma.store.findUnique({ where: { id: outcome.storeId }, select: { name: true, contactEmail: true } });
    const message = buildSigningCodeEmail({ storeName: store?.name ?? "", numberLabel: outcome.numberLabel, code: outcome.code, minutes: CODE_TTL_MS / 60_000 });
    try {
      await this.email.send({ to: outcome.to, subject: message.subject, body: message.text, html: message.html, replyTo: store?.contactEmail ?? undefined, idempotencyKey: `business-document/${outcome.eventId}`, failLoudly: true });
    } catch (error) {
      this.logger.warn(`Contract ${id} code email failed: ${(error as Error).message}`);
      await this.prisma.businessDocumentEvent.create({ data: { documentId: id, type: "email_failed", version: outcome.version, data: { to: maskEmail(outcome.to), notice: "sign_code", reason: (error as Error).message.slice(0, 200) } } });
      throw new BadGatewayException("No pudimos enviar el código. Intenta de nuevo en un momento.");
    }
    return { sentTo: maskEmail(outcome.to), expiresAt: outcome.expiresAt, resendAfterSeconds: CODE_COOLDOWN_MS / 1000 };
  }

  /** The 6 digits: 5 tries per code, 10 minutes; a right one lets the signer finish within 30 minutes. */
  async verifyCode(token: string, dto: ContractCodeVerifyDto, context: AcceptanceContext) {
    const id = this.tokenId(token);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const { doc } = await this.lockedContract(tx, id);
      const closed = await this.closedReason(tx, doc);
      if (closed) return closed;
      if (dto.version !== doc.currentVersion) throw stale();
      const events = await tx.businessDocumentEvent.findMany({ where: { documentId: id, type: { in: ["sign_code_sent", "sign_code_failed", "sign_code_verified"] } } });
      const chronological = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
      const latest = chronological.filter((event) => event.type === "sign_code_sent" && event.version === doc.currentVersion).at(-1);
      const fail = (status: number, message: string) => ({ kind: "failed" as const, status, message });
      if (!latest) return fail(400, "Primero pide un código: te lo enviamos a tu correo.");
      const challenge = latest.data as unknown as CodeEventData;
      const ofThis = (type: string) => chronological.filter((event) => event.type === type && (event.data as { challenge?: string } | null)?.challenge === latest.id);
      const failures = ofThis("sign_code_failed").length;
      if (failures >= CODE_MAX_ATTEMPTS) return fail(429, "Demasiados intentos con este código. Pide un código nuevo.");
      const verifiedUntil = (at: Date) => new Date(at.getTime() + VERIFIED_TTL_MS);
      const already = ofThis("sign_code_verified")[0];
      if (already) return { kind: "verified" as const, verifiedUntil: verifiedUntil(already.at) };
      if (new Date(challenge.expiresAt).getTime() < Date.now()) return fail(400, "El código venció. Pide uno nuevo.");
      if (!codeMatches(this.secret(), id, challenge.nonce, dto.code, challenge.hash)) {
        await tx.businessDocumentEvent.create({ data: { documentId: id, type: "sign_code_failed", version: doc.currentVersion, ipAddress: context.ipAddress, userAgent: context.userAgent, data: { challenge: latest.id } } });
        const left = CODE_MAX_ATTEMPTS - failures - 1;
        return fail(400, left > 0 ? `Código incorrecto. Te quedan ${left} ${left === 1 ? "intento" : "intentos"}.` : "Código incorrecto. Pide un código nuevo.");
      }
      const event = await tx.businessDocumentEvent.create({ data: { documentId: id, type: "sign_code_verified", version: doc.currentVersion, ipAddress: context.ipAddress, userAgent: context.userAgent, data: { challenge: latest.id } } });
      return { kind: "verified" as const, verifiedUntil: verifiedUntil(event.at) };
    });
    // Thrown after the transaction, so a wrong attempt is counted even though the call fails.
    if (outcome.kind === "closed") throw new ConflictException(outcome.message);
    if (outcome.kind === "failed") throw new HttpException(outcome.message, outcome.status);
    return { verified: true, verifiedUntil: outcome.verifiedUntil };
  }

  /** "Firmar contrato": name (and drawing) on the version read, after a verified code. */
  async sign(token: string, dto: PublicSignContractDto, context: AcceptanceContext) {
    if (dto.readConfirmed !== true) throw new BadRequestException("Confirma que has leído el contrato antes de firmarlo.");
    const name = signerName(dto.name);
    const image = drawnImage(dto);
    const id = this.tokenId(token);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const { doc, snapshot, version } = await this.lockedContract(tx, id);
      const signatures = (await tx.businessDocumentSignature.findMany({ where: { documentId: id, version: doc.currentVersion } })) as SignatureRow[];
      const summary = signingSummary(signatures, doc.currentVersion);
      // A double tap (or a second visit) gets the signature on record, never a second one.
      if (summary.customerSigned && dto.version === doc.currentVersion) return { kind: "done" as const, complete: false, doc };
      const closed = await this.closedReason(tx, doc);
      if (closed) return closed;
      if (dto.version !== doc.currentVersion) throw stale();
      if (waitingFor(snapshot.contract?.signingOrder ?? "merchant_first", summary.merchantSigned, summary.customerSigned) === "merchant") {
        throw new ConflictException(`Esperando la firma de ${snapshot.contract?.merchantParty.legalName ?? "el comercio"}.`);
      }
      const since = Date.now() - VERIFIED_TTL_MS;
      const verified = (await tx.businessDocumentEvent.findMany({ where: { documentId: id, type: "sign_code_verified", version: doc.currentVersion } }))
        .filter((event) => event.at.getTime() >= since)
        .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
      if (!verified) throw new ForbiddenException("Confirma el código que te enviamos por correo antes de firmar.");
      await tx.businessDocumentSignature.create({
        data: {
          documentId: id, role: "CUSTOMER", name, method: dto.method, imageUrl: image, email: snapshot.customer.email ?? "",
          codeVerifiedAt: verified.at, ipAddress: context.ipAddress, userAgent: context.userAgent, version: doc.currentVersion, versionSha256: version.sha256,
        },
      });
      await tx.businessDocumentEvent.create({
        data: { documentId: id, type: "signed", version: doc.currentVersion, ipAddress: context.ipAddress, userAgent: context.userAgent, data: { role: "CUSTOMER", name, method: dto.method } },
      });
      return { kind: "signed" as const, complete: await this.completeIfBoth(tx, id, doc.currentVersion), doc, customerName: name };
    });
    if (outcome.kind === "closed") throw new ConflictException(outcome.message);
    if (outcome.kind === "signed") {
      if (outcome.complete) await this.sendSignedCopies(id);
      else await this.notifyMerchant(outcome.doc, outcome.customerName);
    }
    const row = await this.prisma.businessDocument.findUnique({ where: { id }, select: { status: true } });
    return { status: row?.status ?? outcome.doc.status };
  }

  // ── worker ────────────────────────────────────────────────────────────

  async expireOverdue(now = new Date()) {
    const late = await this.prisma.businessDocument.findMany({
      where: { kind: "CONTRACT", status: { in: OPEN_CONTRACT }, validUntil: { lt: now } },
      select: { id: true, currentVersion: true },
      take: 500,
    });
    let expired = 0;
    for (const doc of late) if (await expireContract(this.prisma, doc.id, doc.currentVersion, now)) expired += 1;
    return expired;
  }

  // ── helpers ───────────────────────────────────────────────────────────

  /** Both roles on the same current version → SIGNED (conditional), recorded once. */
  private async completeIfBoth(tx: Prisma.TransactionClient, id: string, version: number) {
    const count = await tx.businessDocumentSignature.count({ where: { documentId: id, version } });
    if (count < 2) return false;
    const updated = await tx.businessDocument.updateMany({ where: { id, status: { in: OPEN_CONTRACT }, currentVersion: version }, data: { status: S.SIGNED } });
    if (!updated.count) return false;
    await tx.businessDocumentEvent.createMany({ data: [{ documentId: id, type: "fully_signed", version, dedupeKey: "fully_signed" }], skipDuplicates: true });
    return true;
  }

  /**
   * The signed PDF to each party, once each (dedupeKey), outside the daily cap: these are the
   * parties' own copies of a contract that can only be completed once. A failure is recorded; the
   * PDF stays downloadable from the link and the dashboard.
   */
  private async sendSignedCopies(id: string) {
    try {
      const doc = await this.prisma.businessDocument.findUnique({ where: { id } });
      if (!doc) return;
      const [store, merchant, version, signatures] = await Promise.all([
        this.prisma.store.findUnique({ where: { id: doc.storeId }, select: { name: true, logoUrl: true, contactEmail: true } }),
        this.prisma.merchant.findUnique({ where: { id: doc.merchantId }, select: { email: true } }),
        this.prisma.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version: doc.currentVersion } } }),
        this.prisma.businessDocumentSignature.findMany({ where: { documentId: id, version: doc.currentVersion } }),
      ]);
      if (!version) return;
      const snapshot = version.content as unknown as DocumentSnapshot;
      const pdf = await renderContractPdf({
        storeName: store?.name ?? "",
        logo: await this.documents.storeLogo(store?.logoUrl ?? null),
        numberLabel: snapshot.numberLabel,
        version: version.version,
        sha256: version.sha256,
        snapshot,
        signatures: signatures as unknown as ContractPdfSignature[],
      });
      const partyEmail = snapshot.contract?.merchantParty.email ?? "";
      const merchantTo = /^[^\s@{}]+@[^\s@{}]+\.[^\s@{}]+$/.test(partyEmail) ? partyEmail : store?.contactEmail || merchant?.email || null;
      const origin = (this.config.get<string>("app.merchantDashboardOrigin") ?? "http://localhost:4322").replace(/\/$/, "");
      const recipients: Array<{ role: "customer" | "merchant"; to: string | null }> = [
        { role: "customer", to: snapshot.customer.email },
        { role: "merchant", to: merchantTo },
      ];
      for (const recipient of recipients) {
        if (!recipient.to) continue;
        let eventId: string;
        try {
          eventId = (await this.prisma.businessDocumentEvent.create({ data: { documentId: id, type: "signed_copy", version: version.version, dedupeKey: `signed_copy:${recipient.role}`, data: { to: recipient.to } } })).id;
        } catch (error) {
          if ((error as { code?: string }).code === "P2002") continue;
          throw error;
        }
        const message = buildSignedCopyEmail({
          storeName: store?.name ?? "",
          numberLabel: snapshot.numberLabel,
          title: snapshot.title,
          recipient: recipient.role,
          otherParty: snapshot.contract?.customerParty.name ?? snapshot.customer.name ?? "Tu cliente",
          publicUrl: this.documents.publicUrl(id),
          dashboardUrl: `${origin}/#dashboard-contracts`,
        });
        try {
          await this.email.send({
            to: recipient.to,
            subject: message.subject,
            body: message.text,
            html: message.html,
            replyTo: recipient.role === "customer" ? store?.contactEmail ?? undefined : undefined,
            attachments: [{ filename: `${snapshot.numberLabel}-firmado.pdf`, contentType: "application/pdf", content: pdf.toString("base64") }],
            idempotencyKey: `business-document/${eventId}`,
            failLoudly: true,
          });
        } catch (error) {
          this.logger.warn(`Contract ${id} signed copy (${recipient.role}) failed: ${(error as Error).message}`);
          await this.prisma.businessDocumentEvent.create({ data: { documentId: id, type: "email_failed", version: version.version, data: { to: recipient.to, notice: `signed_copy:${recipient.role}`, reason: (error as Error).message.slice(0, 200) } } });
        }
      }
    } catch (error) {
      // The signatures are committed; a delivery problem never undoes them.
      this.logger.warn(`Contract ${id} signed copies failed: ${(error as Error).message}`);
    }
  }

  /** "Tu cliente firmó": to the store contact (else the account), inside the store's daily cap. */
  private async notifyMerchant(doc: { id: string; storeId: string; merchantId: string; number: number | null; title: string; currentVersion: number }, customerName: string) {
    try {
      const [store, merchant] = await Promise.all([
        this.prisma.store.findUnique({ where: { id: doc.storeId }, select: { contactEmail: true } }),
        this.prisma.merchant.findUnique({ where: { id: doc.merchantId }, select: { email: true } }),
      ]);
      const to = store?.contactEmail || merchant?.email;
      if (!to) return;
      let eventId: string;
      try {
        eventId = await this.prisma.$transaction(async (tx) => {
          await this.documents.assertEmailQuota(tx, doc.storeId);
          return (await tx.businessDocumentEvent.create({ data: { documentId: doc.id, type: "merchant_notified", version: doc.currentVersion, data: { to, reason: "customer_signed" } } })).id;
        });
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 429) return;
        throw error;
      }
      const origin = (this.config.get<string>("app.merchantDashboardOrigin") ?? "http://localhost:4322").replace(/\/$/, "");
      const message = buildCustomerSignedEmail({ numberLabel: documentNumberLabel("CONTRACT", doc.number), title: doc.title, customerName, dashboardUrl: `${origin}/#dashboard-contracts` });
      await this.email.send({ to, subject: message.subject, body: message.text, html: message.html, idempotencyKey: `business-document/${eventId}`, failLoudly: true });
    } catch (error) {
      this.logger.warn(`Contract ${doc.id} merchant notification failed: ${(error as Error).message}`);
    }
  }

  private async customerSigned(db: Pick<Prisma.TransactionClient, "businessDocumentSignature">, id: string, version: number) {
    if (version < 1) return false;
    return (await db.businessDocumentSignature.count({ where: { documentId: id, version, role: "CUSTOMER" } })) > 0;
  }

  private async lockedContract(tx: Prisma.TransactionClient, id: string) {
    const doc = await tx.businessDocument.findUnique({ where: { id } });
    // A cobro, a proposal, a draft or a bad link answer the same way.
    if (!doc || doc.kind !== "CONTRACT" || doc.currentVersion < 1) throw new NotFoundException("No encontramos este contrato");
    const version = await this.versionRow(tx, id, doc.currentVersion);
    return { doc, version, snapshot: version.content as unknown as DocumentSnapshot };
  }

  private async versionRow(tx: Prisma.TransactionClient, id: string, version: number) {
    const row = await tx.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version } } });
    if (!row) throw new NotFoundException("No encontramos este contrato");
    return row;
  }

  /** Why nobody can sign it any more, or null. Past its deadline it expires here. */
  private async closedReason(tx: Prisma.TransactionClient, doc: { id: string; status: BusinessDocumentStatus; validUntil: Date | null; currentVersion: number }) {
    const closed = (message: string) => ({ kind: "closed" as const, message });
    if (doc.status === S.VOIDED) return closed("Este contrato fue anulado y ya no se puede firmar. Escríbele al comercio si tienes dudas.");
    if (doc.status === S.SIGNED) return closed("Este contrato ya está firmado por ambas partes.");
    const past = Boolean(doc.validUntil && doc.validUntil.getTime() < Date.now());
    if (doc.status === S.EXPIRED || (past && OPEN_CONTRACT.includes(doc.status))) {
      if (doc.status !== S.EXPIRED) await expireContract(tx, doc.id, doc.currentVersion);
      return closed("El plazo para firmar este contrato venció. Pídele al comercio uno actualizado.");
    }
    if (!OPEN_CONTRACT.includes(doc.status)) return closed("Este contrato ya no se puede firmar.");
    return null;
  }

  private async acceptedProposal(storeId: string, id: string) {
    const proposal = await this.prisma.businessDocument.findFirst({ where: { id, storeId, kind: "PROPOSAL" } });
    if (!proposal) throw new NotFoundException("Propuesta no encontrada");
    if (proposal.status !== S.ACCEPTED) throw new ConflictException("Solo una propuesta aceptada se convierte en contrato.");
    const accepted = await this.prisma.businessDocumentEvent.findFirst({ where: { documentId: id, type: "accepted" } });
    const acceptedData = (accepted?.data ?? {}) as { name?: string; email?: string; version?: number };
    const version = await this.prisma.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version: acceptedData.version ?? accepted?.version ?? proposal.currentVersion } } });
    if (!version) throw new NotFoundException("Propuesta no encontrada");
    return { id, snapshot: version.content as unknown as DocumentSnapshot, accepter: { name: acceptedData.name ?? null, email: acceptedData.email ?? null } };
  }

  private async legalData(merchantId: string, store: { name: string; contactEmail: string | null }) {
    const [invoicing, kyc, merchant] = await Promise.all([
      this.prisma.merchantInvoicingProfile.findUnique({ where: { merchantId }, select: { razonSocial: true, nit: true } }),
      this.prisma.merchantKycSubmission.findFirst({ where: { merchantId, status: "APPROVED" }, orderBy: { createdAt: "desc" }, select: { legalName: true, taxId: true, legalRepName: true, legalRepDocumentId: true } }),
      this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { email: true } }),
    ]);
    return { invoicing, kyc, store, merchantEmail: merchant?.email ?? null };
  }

  private tokenId(token: string) {
    const id = readDocumentLinkToken(token, this.secret());
    if (!id) throw new NotFoundException("No encontramos este contrato");
    return id;
  }

  private secret() {
    return this.config.get<string>("app.documentLinkSecret") ?? DEVELOPMENT_DOCUMENT_LINK_SECRET;
  }

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, name: true, contactEmail: true } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }
}

const customerSignedConflict = () => new ConflictException("Tu cliente ya firmó esta versión: fírmala o anúlala para cambiarla.");

function signerName(value: string) {
  const name = oneLine(value).slice(0, 120);
  if (name.length < 3) throw new BadRequestException("Escribe tu nombre completo para firmar.");
  return name;
}

function drawnImage(dto: { method: string; image?: string }) {
  if (dto.method !== "DRAWN") return null;
  const image = signatureImage(dto.image);
  if (!image) throw new BadRequestException("Dibuja tu firma o elige escribir tu nombre.");
  return image;
}

/** "Identidad visual: Logo; Manual de marca" — the accepted proposal's title and its first list. */
function proposalObjeto(snapshot: DocumentSnapshot): string {
  const list = snapshot.blocks.find((block) => block.type === "list" && block.items?.length);
  const items = list?.items?.join("; ") ?? snapshot.items.map((item) => item.description).join("; ");
  return `${snapshot.title}${items ? `: ${items}` : ""}`.slice(0, 2000);
}
