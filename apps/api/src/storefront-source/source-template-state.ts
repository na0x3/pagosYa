/** Spec 2026-09-26 (templates/settings/MCP) §1.3: a store is untouched while its current revision is the one a
 * template produced; later edits carry the brief forward, so their revision no longer matches. */
import type { PrismaService } from '../prisma/prisma.service';

export const FREE_TEMPLATE_ADAPTATIONS = 4;

export function templateUntouched(brief: { templateId?: string; templateRevision?: number } | null | undefined, currentRevision: number) {
  return Boolean(brief?.templateId && brief.templateRevision && brief.templateRevision === currentRevision);
}

/** The merchant wants the store's template kept as the base ("usa la plantilla como referencia", "mantén el estilo de
 * la plantilla"), not swapped for another one or made to look less like it. Only read for stores that started from one. */
export function templateReferenceRequested(instruction: string) {
  const task = instruction.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  if (!/\b(?:plantilla|template)\b/.test(task)) return false;
  if (/\b(?:otra|nueva|cambia\w*|switch|another|different)\s+(?:\w+\s+)?(?:plantilla|template)|\b(?:no|menos|sin|less)\s+(?:\w+\s+){0,3}(?:plantilla|template)|mas unic|unique|diferente|distint/.test(task)) return false;
  return /referencia|reference|\bbase\b|basad|based on|inspir|manten|mantener|conserv|respet|\bkeep\b|adapta|\badapt|mismo estilo|same style|estilo de (?:la|esta|mi) plantilla/.test(task);
}

export function countTemplateVersions(prisma: Pick<PrismaService, 'storeSourceVersion'>, storeId: string) {
  return prisma.storeSourceVersion.count({ where: { storeId, label: { startsWith: 'Plantilla:' } } });
}
