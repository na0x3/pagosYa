import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OpsRole, PayoutAccountOwner } from "@prisma/client";
import { bankName } from "./bolivian-banks";

export { bankName } from "./bolivian-banks";

/** After ops approve a change, the real owner gets this long to object before money moves to the new account. */
export const CHANGE_WAIT_MS = 72 * 60 * 60_000;

export function normaliseAccountNumber(raw: string): string {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{6,20}$/.test(digits)) throw new BadRequestException("El número de cuenta debe tener entre 6 y 20 dígitos.");
  return digits;
}

export function accountSnapshot(a: { bankCode: string; accountNumber: string; holderName: string }): string {
  return `${bankName(a.bankCode) ?? a.bankCode} ${a.accountNumber} — ${a.holderName}`;
}

export type ApprovalChecks = { nameMatches: boolean; numberMatches: boolean; bankMatches: boolean };

export function validateApproval(input: { isChange: boolean; actorRole: OpsRole; level: number; checks: ApprovalChecks; ownerType: PayoutAccountOwner; reason?: string | null }): void {
  if (input.isChange && input.actorRole !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede aprobar un cambio de cuenta.");
  const { nameMatches, numberMatches, bankMatches } = input.checks;
  if (!(nameMatches === true && numberMatches === true && bankMatches === true)) throw new BadRequestException("Marca las tres comprobaciones antes de aprobar.");
  if (input.level <= 1 && input.ownerType !== PayoutAccountOwner.PERSON) throw new BadRequestException("Una cuenta de nivel 1 debe estar a nombre de la persona verificada.");
  if (input.level >= 2 && input.ownerType === PayoutAccountOwner.PERSON) throw new BadRequestException("Una cuenta de empresa debe estar a nombre de la empresa o, si es unipersonal, de su dueño.");
  if (input.ownerType === PayoutAccountOwner.SOLE_PROPRIETOR && (input.reason?.trim().length ?? 0) < 8) {
    throw new BadRequestException("Explica por qué la cuenta unipersonal está a nombre del dueño.");
  }
}

export function payableFromFor(isChange: boolean, approvedAt: Date): Date {
  return new Date(approvedAt.getTime() + (isChange ? CHANGE_WAIT_MS : 0));
}
