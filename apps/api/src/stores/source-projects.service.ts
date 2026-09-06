import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EditSourceFileDto, SaveSourceProjectDto } from "./dto/save-source-project.dto";
import { sourceProjectArchive, sourceProjectDigest, sourceProjectSnapshot, SourceProjectSnapshot } from "./source-project";

const summarySelect = { revision: true, label: true, digest: true, restoredFrom: true, createdAt: true } as const;

@Injectable()
export class SourceProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  async state(merchantId: string, storeId: string, before?: number) {
    await this.ownedStore(merchantId, storeId);
    const [project, versions] = await this.prisma.$transaction([
      this.prisma.storeSourceProject.findUnique({ where: { storeId }, select: { revision: true, updatedAt: true } }),
      this.prisma.storeSourceVersion.findMany({
        where: { storeId, ...(before ? { revision: { lt: before } } : {}) },
        orderBy: { revision: "desc" }, take: 31, select: summarySelect,
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { revision: project?.revision ?? 0, updatedAt: project?.updatedAt ?? null, versions: versions.slice(0, 30), nextBefore: versions.length > 30 ? versions[29].revision : null };
  }

  async version(merchantId: string, storeId: string, revision: number) {
    await this.ownedStore(merchantId, storeId);
    const version = await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { ...summarySelect, snapshot: true } });
    if (!version) throw new NotFoundException("Source project revision not found");
    return version;
  }

  async save(merchantId: string, storeId: string, input: SaveSourceProjectDto) {
    await this.ownedStore(merchantId, storeId);
    const snapshot = sourceProjectSnapshot(input);
    return this.append(storeId, input.revision, input.label, snapshot);
  }

  async editFile(merchantId: string, storeId: string, input: EditSourceFileDto) {
    const version = await this.version(merchantId, storeId, input.revision);
    const snapshot = version.snapshot as unknown as SourceProjectSnapshot;
    const file = snapshot.files.find((entry) => entry.path === input.path);
    if (!file || file.encoding === "base64") throw new BadRequestException("Selecciona un archivo de texto existente.");
    return this.save(merchantId, storeId, { revision: input.revision, label: `Edición de ${input.path}`.slice(0, 120), brief: snapshot.brief,
      files: snapshot.files.map((entry) => entry.path === input.path ? { ...entry, content: input.content } : entry) });
  }

  private async append(storeId: string, revision: number, label: string, snapshot: SourceProjectSnapshot, restoredFrom: number | null = null) {
    if (!Number.isInteger(revision) || revision < 0 || revision >= 2_147_483_647) throw new BadRequestException("Invalid project revision");
    if (typeof label !== "string" || !label.trim() || label.trim().length > 120) throw new BadRequestException("Invalid revision label");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.storeSourceProject.upsert({ where: { storeId }, create: { storeId }, update: {} });
        const updated = await tx.storeSourceProject.updateMany({ where: { storeId, revision }, data: { revision: { increment: 1 } } });
        if (updated.count !== 1) throw new ConflictException("El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.");
        return tx.storeSourceVersion.create({ data: {
          storeId, revision: revision + 1, label: label.trim(), digest: sourceProjectDigest(snapshot),
          snapshot: snapshot as unknown as Prisma.InputJsonValue, restoredFrom,
        }, select: summarySelect });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new ConflictException("El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.");
      }
      throw error;
    }
  }

  async restore(merchantId: string, storeId: string, targetRevision: number, currentRevision: number) {
    const version = await this.version(merchantId, storeId, targetRevision);
    const stored = version.snapshot as unknown as SourceProjectSnapshot;
    // Revalidate old snapshots before creating a new revision under today's contract.
    const snapshot = sourceProjectSnapshot({ ...stored, revision: currentRevision, label: `Restaurada desde revisión ${targetRevision}` });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException("Source project integrity check failed");
    return this.append(storeId, currentRevision, `Restaurada desde revisión ${targetRevision}`, snapshot, targetRevision);
  }

  async archive(merchantId: string, storeId: string, revision: number) {
    const version = await this.version(merchantId, storeId, revision);
    const stored = version.snapshot as unknown as SourceProjectSnapshot;
    const snapshot = sourceProjectSnapshot({ ...stored, revision, label: version.label });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException("Source project integrity check failed");
    return { filename: `storefront-r${revision}-${version.digest.slice(0, 12)}.zip`, buffer: sourceProjectArchive(snapshot, revision, version.restoredFrom) };
  }
}
