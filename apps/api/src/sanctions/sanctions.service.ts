import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KycScreeningStatus, KycStatus, Prisma, SanctionsSource } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../ops/audit-log.service";
import {
  nameTokens, OFAC_ALT_URL, OFAC_SDN_URL, ParsedSanctionsEntry, parseOfacCsv, parseUnXml, prepareEntries, SanctionsMatch, screenNames, UN_LIST_URL,
} from "./sanctions-lists";

type Fetcher = (url: string) => Promise<string>;
type Actor = { id: string; name: string; email: string; role?: string };
const OPEN = [KycScreeningStatus.POSSIBLE_MATCH, KycScreeningStatus.CONFIRMED] as const;

const download: Fetcher = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
};

/**
 * Sanctions screening at KYC (UIF / BCB R.D. 079/2022 due diligence): loads the UN and OFAC lists, checks every
 * identity submission's legal name and legal representative against them, re-checks approved merchants whenever a list
 * changes, and keeps approval closed while a possible match is open.
 */
@Injectable()
export class SanctionsService {
  private readonly logger = new Logger(SanctionsService.name);
  private cache: { key: string; prepared: ReturnType<typeof prepareEntries> } | null = null;
  /** How the lists are downloaded (tests hand in files instead). */
  fetcher: Fetcher = download;
  /** Below this a download is treated as truncated and nothing is replaced (real lists: UN ~1,000, OFAC ~17,000). */
  minimumEntries = { UN: 200, OFAC: 5000 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private get required() { return this.config?.get<boolean>("app.sanctionsScreeningRequired") ?? false; }

  /** The latest import of each list (what screenings cite), newest first. */
  async status() {
    const latest = await Promise.all(Object.values(SanctionsSource).map((source) => this.prisma.sanctionsListImport.findFirst({ where: { source }, orderBy: { importedAt: "desc" } })));
    return { required: this.required, lists: latest.filter(Boolean) };
  }

  /** Downloads both lists and replaces each one whole (only when it changed), then re-screens approved merchants. */
  async importLists(actor?: Actor): Promise<{ imported: Array<{ source: SanctionsSource; entries: number; changed: boolean }>; rescreened: number }> {
    const [unXml, sdnCsv, altCsv] = await Promise.all([this.fetcher(UN_LIST_URL), this.fetcher(OFAC_SDN_URL), this.fetcher(OFAC_ALT_URL)]);
    const un = parseUnXml(unXml);
    const ofac = parseOfacCsv(sdnCsv, altCsv);
    // A truncated download must never empty a list: refuse anything far smaller than a real one.
    if (un.entries.length < this.minimumEntries.UN || ofac.entries.length < this.minimumEntries.OFAC) throw new Error(`Lists look incomplete (UN ${un.entries.length}, OFAC ${ofac.entries.length}); nothing replaced`);
    // Lists grow slowly; losing more than a fifth of a list at once is a broken download, not a mass delisting.
    for (const [source, count] of [[SanctionsSource.UN, un.entries.length], [SanctionsSource.OFAC, ofac.entries.length]] as const) {
      const previous = await this.prisma.sanctionsListImport.findFirst({ where: { source }, orderBy: { importedAt: "desc" } });
      if (previous && count < previous.entries * 0.8) throw new Error(`${source} shrank from ${previous.entries} to ${count} entries; nothing replaced`);
    }
    const imported = [
      await this.replace(SanctionsSource.UN, un.entries, unXml, un.publishedAt),
      await this.replace(SanctionsSource.OFAC, ofac.entries, sdnCsv + altCsv, null),
    ];
    const rescreened = imported.some((list) => list.changed) ? await this.rescreenApproved() : 0;
    await this.prisma.$transaction((tx) => this.auditLog.record(tx, {
      actorType: actor ? "OPS_USER" : "SYSTEM", actorId: actor?.id ?? "sanctions-job", actorLabel: actor ? `${actor.name} <${actor.email}>` : "Daily sanctions job",
      action: "sanctions.lists_imported", targetType: "SanctionsListImport", targetId: imported.map((list) => list.source).join("+"), metadata: { imported, rescreened },
    }));
    return { imported, rescreened };
  }

  private async replace(source: SanctionsSource, entries: ParsedSanctionsEntry[], raw: string, publishedAt: string | null) {
    const sha256 = createHash("sha256").update(raw).digest("hex");
    const previous = await this.prisma.sanctionsListImport.findFirst({ where: { source }, orderBy: { importedAt: "desc" } });
    if (previous?.sha256 === sha256) return { source, entries: previous.entries, changed: false };
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.sanctionsListImport.create({ data: { source, entries: entries.length, sha256, publishedAt } });
      await tx.sanctionsEntry.deleteMany({ where: { source } });
      for (let i = 0; i < entries.length; i += 1000) {
        await tx.sanctionsEntry.createMany({
          data: entries.slice(i, i + 1000).map((entry) => ({ ...entry, source, importId: run.id })),
          skipDuplicates: true,
        });
      }
    }, { timeout: 5 * 60_000 });
    this.cache = null;
    return { source, entries: entries.length, changed: true };
  }

  private async prepared() {
    const imports = (await this.status()).lists;
    const key = imports.map((list) => list!.id).join(",");
    if (!imports.length) return { imports, prepared: null };
    if (this.cache?.key !== key) {
      const rows = await this.prisma.sanctionsEntry.findMany({ select: { id: true, source: true, externalId: true, kind: true, primaryName: true, names: true, birthDates: true, nationalities: true, programs: true } });
      this.cache = { key, prepared: prepareEntries(rows) };
    }
    return { imports, prepared: this.cache.prepared };
  }

  /** Screens one submission's names now and records the result (with the list versions it used). */
  async screenSubmission(submissionId: string, trigger: "submission" | "list_update" = "submission") {
    const submission = await this.prisma.merchantKycSubmission.findUnique({ where: { id: submissionId }, select: { id: true, legalName: true, legalRepName: true } });
    if (!submission) throw new NotFoundException("KYC submission not found");
    const names = [...new Set([submission.legalName, submission.legalRepName].filter((name): name is string => Boolean(name?.trim())))];
    const { imports, prepared } = await this.prepared();
    const matches: SanctionsMatch[] = prepared ? screenNames(names, prepared) : [];
    // A name with letters but none the matcher reads (Cyrillic, Arabic…) is never cleared automatically.
    for (const name of names.filter((n) => !nameTokens(n).length && /\p{L}/u.test(n))) {
      matches.push({ entryId: "", listKey: `MANUAL:${name}`, source: "MANUAL", screenedName: name, listedName: name, primaryName: "Revisión manual: el nombre no usa letras latinas", score: 0, birthDates: [], nationalities: [], programs: [] });
    }
    const status = !prepared ? KycScreeningStatus.NOT_SCREENED : matches.length ? KycScreeningStatus.POSSIBLE_MATCH : KycScreeningStatus.CLEAR;
    return this.prisma.kycScreening.create({
      data: {
        submissionId,
        screenedNames: names,
        status,
        matches: matches as unknown as Prisma.InputJsonValue,
        listImports: imports.map((list) => ({ id: list!.id, source: list!.source, importedAt: list!.importedAt, publishedAt: list!.publishedAt })) as Prisma.InputJsonValue,
        trigger,
      },
    });
  }

  /**
   * After a list changes: every approved merchant's names again. Only a new possible match is recorded (a name already
   * dismissed against the same listed entry stays dismissed), so ops see what is new.
   */
  async rescreenApproved(): Promise<number> {
    const { prepared } = await this.prepared();
    if (!prepared) return 0;
    const approved = await this.prisma.merchantKycSubmission.findMany({ where: { status: KycStatus.APPROVED }, select: { id: true, legalName: true, legalRepName: true } });
    let flagged = 0;
    for (const submission of approved) {
      await new Promise((resolve) => setImmediate(resolve)); // ~20k names per merchant: let requests through between them
      const matches = screenNames([submission.legalName, submission.legalRepName ?? ""], prepared);
      if (!matches.length) continue;
      const seen = await this.prisma.kycScreening.findMany({ where: { submissionId: submission.id, status: { in: [KycScreeningStatus.DISMISSED, ...OPEN] } }, select: { matches: true } });
      const known = new Set(seen.flatMap((s) => (s.matches as Array<{ listKey?: string }>).map((m) => m.listKey)));
      if (matches.every((m) => known.has(m.listKey))) continue;
      await this.screenSubmission(submission.id, "list_update");
      flagged++;
    }
    if (flagged) this.logger.warn(`Sanctions lists changed: ${flagged} approved merchant(s) have a new possible match`);
    return flagged;
  }

  /** What the ops queue shows: open possible matches first. */
  listOpen() {
    return this.prisma.kycScreening.findMany({
      where: { status: { in: [KycScreeningStatus.POSSIBLE_MATCH, KycScreeningStatus.NOT_SCREENED] } },
      include: { submission: { select: { id: true, status: true, legalName: true, legalRepName: true, legalRepDocumentId: true, isPep: true, pepRole: true, merchant: { select: { id: true, name: true, email: true } } } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Ops decide a possible match: DISMISSED (a different person — say how you know) or CONFIRMED (the listed person). */
  async resolve(screeningId: string, decision: "DISMISSED" | "CONFIRMED", note: string, actor: Actor) {
    if (!note?.trim() || note.trim().length < 10) throw new BadRequestException("Explica la decisión (por ejemplo: fecha de nacimiento y nacionalidad distintas)");
    const screening = await this.prisma.kycScreening.findUnique({ where: { id: screeningId } });
    if (!screening) throw new NotFoundException("Screening not found");
    if (screening.status !== KycScreeningStatus.POSSIBLE_MATCH) throw new BadRequestException("Only a possible match can be decided");
    // Four eyes: clearing a possible sanctions match is an administrator's decision, not the reviewer's alone.
    if (decision === "DISMISSED" && actor.role !== "SUPPORT_ADMIN") throw new ForbiddenException("Solo un administrador puede descartar una coincidencia con una lista de sanciones");
    const actorLabel = `${actor.name} <${actor.email}>`;
    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.kycScreening.update({
        where: { id: screeningId },
        data: { status: decision, resolutionNote: note.trim(), resolvedAt: new Date(), resolvedByOpsUserId: actor.id, resolvedByLabel: actorLabel },
      });
      await this.auditLog.record(tx, {
        actorType: "OPS_USER", actorId: actor.id, actorLabel, action: `sanctions.match_${decision.toLowerCase()}`,
        targetType: "MerchantKycSubmission", targetId: screening.submissionId, metadata: { screeningId, note: note.trim() },
      });
      return resolved;
    });
  }

  /** Why an approval must wait, or null: an open possible match always; no real screening only where screening is required. */
  async approvalBlocker(submissionId: string): Promise<string | null> {
    let latest = await this.prisma.kycScreening.findFirst({ where: { submissionId }, orderBy: { createdAt: "desc" } });
    // Never screened, or screened before the lists were loaded: screen now, so the decision rests on a real check.
    if (!latest || latest.status === KycScreeningStatus.NOT_SCREENED) latest = await this.screenSubmission(submissionId);
    const open = await this.prisma.kycScreening.findFirst({ where: { submissionId, status: { in: [...OPEN] } } });
    if (open?.status === KycScreeningStatus.CONFIRMED) return "Coincidencia confirmada con una lista de sanciones: no se puede aprobar";
    if (open) return "Hay una posible coincidencia con una lista de sanciones sin decidir (UN/OFAC)";
    if (this.required && (!latest || latest.status === KycScreeningStatus.NOT_SCREENED)) return "Falta revisar los nombres contra las listas de sanciones; carga las listas e inténtalo de nuevo";
    return null;
  }
}
