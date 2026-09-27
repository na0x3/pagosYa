/** Spec 2026-09-26 (templates/settings/MCP) §1.3: a store is untouched while its current revision is the one a
 * template produced; later edits carry the brief forward, so their revision no longer matches. */
import type { PrismaService } from '../prisma/prisma.service';

export const FREE_TEMPLATE_ADAPTATIONS = 4;

export function templateUntouched(brief: { templateId?: string; templateRevision?: number } | null | undefined, currentRevision: number) {
  return Boolean(brief?.templateId && brief.templateRevision && brief.templateRevision === currentRevision);
}

export function countTemplateVersions(prisma: Pick<PrismaService, 'storeSourceVersion'>, storeId: string) {
  return prisma.storeSourceVersion.count({ where: { storeId, label: { startsWith: 'Plantilla:' } } });
}
