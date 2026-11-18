import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { SanctionsService } from "./sanctions.service";

/** 05:00 La Paz: fresh UN and OFAC lists, and approved merchants checked against what changed. One runner at a time. */
@Injectable()
export class SanctionsJob {
  private readonly logger = new Logger(SanctionsJob.name);

  constructor(private readonly prisma: PrismaService, private readonly sanctions: SanctionsService, private readonly config: ConfigService) {}

  @Cron("0 5 * * *", { name: "sanctions-lists", timeZone: "America/La_Paz" })
  async run(): Promise<void> {
    if (!this.config.get<boolean>("app.sanctionsAutoImport")) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('sanctions-lists')) AS locked`;
        if (!lock?.locked) return;
        const result = await this.sanctions.importLists();
        this.logger.log(`Sanctions lists: ${result.imported.map((l) => `${l.source} ${l.entries}${l.changed ? " (new)" : ""}`).join(", ")}; ${result.rescreened} new possible match(es)`);
      }, { timeout: 15 * 60_000 });
    } catch (error) {
      this.logger.error(`Sanctions list import failed: ${(error as Error).message}`);
    }
  }
}
