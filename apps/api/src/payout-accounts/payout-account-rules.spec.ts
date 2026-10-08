import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OpsRole, PayoutAccountOwner } from "@prisma/client";
import { accountSnapshot, bankName, normaliseAccountNumber, payableFromFor, validateApproval } from "./payout-account-rules";

const ticks = { nameMatches: true, numberMatches: true, bankMatches: true };
const base = { isChange: false, actorRole: OpsRole.SUPPORT_AGENT, level: 1, checks: ticks, ownerType: PayoutAccountOwner.PERSON };

describe("payout account rules", () => {
  it("normalises account numbers and refuses anything else", () => {
    expect(normaliseAccountNumber(" 401-234 5678 ")).toBe("4012345678");
    for (const bad of ["12345", "1".repeat(21), "40123A5678", ""]) expect(() => normaliseAccountNumber(bad)).toThrow("El número de cuenta debe tener entre 6 y 20 dígitos.");
  });

  it("names banks and formats the payout snapshot", () => {
    expect(bankName("BNB")).toBe("Banco Nacional de Bolivia");
    expect(bankName("XYZ")).toBeNull();
    expect(accountSnapshot({ bankCode: "BNB", accountNumber: "4012345678", holderName: "Ana Pérez" })).toBe("Banco Nacional de Bolivia 4012345678 — Ana Pérez");
  });

  it("approves only with the three ticks", () => {
    expect(() => validateApproval(base)).not.toThrow();
    for (const key of ["nameMatches", "numberMatches", "bankMatches"] as const) {
      expect(() => validateApproval({ ...base, checks: { ...ticks, [key]: false } })).toThrow("Marca las tres comprobaciones antes de aprobar.");
    }
  });

  it("matches the owner type to the level", () => {
    expect(() => validateApproval({ ...base, ownerType: PayoutAccountOwner.COMPANY })).toThrow("Una cuenta de nivel 1 debe estar a nombre de la persona verificada.");
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.PERSON })).toThrow("Una cuenta de empresa debe estar a nombre de la empresa o, si es unipersonal, de su dueño.");
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.COMPANY })).not.toThrow();
  });

  it("asks a reason for a sole proprietorship", () => {
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.SOLE_PROPRIETOR, reason: "corta" })).toThrow("Explica por qué la cuenta unipersonal está a nombre del dueño.");
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.SOLE_PROPRIETOR, reason: "Empresa unipersonal, dueño es el representante legal" })).not.toThrow();
  });

  it("lets only an admin approve a change", () => {
    expect(() => validateApproval({ ...base, isChange: true })).toThrow(ForbiddenException);
    expect(() => validateApproval({ ...base, isChange: true, actorRole: OpsRole.SUPPORT_ADMIN })).not.toThrow();
  });

  it("makes a first account payable at once and a change 72 hours later", () => {
    const at = new Date("2026-10-08T19:00:00Z");
    expect(payableFromFor(false, at).toISOString()).toBe("2026-10-08T19:00:00.000Z");
    expect(payableFromFor(true, at).toISOString()).toBe("2026-10-11T19:00:00.000Z");
  });

  it("refuses with 400s", () => {
    expect(() => validateApproval({ ...base, checks: { ...ticks, bankMatches: false } })).toThrow(BadRequestException);
  });
});
