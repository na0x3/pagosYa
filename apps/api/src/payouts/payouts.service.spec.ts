import { KycStatus, LedgerDirection, MerchantStatus, PayoutStatus, SettlementMode } from "@prisma/client";
import { PayoutsService } from "./payouts.service";

const approvedAccount = { id: "pa_1", bankCode: "BNB", accountNumber: "4012345678", holderName: "Ana Pérez", status: "APPROVED", payableFrom: new Date("2026-01-01T00:00:00Z") };

function makeFakePrisma() {
  const prisma: any = {
    ledgerEntry: { groupBy: jest.fn() },
    // findUnique answers from whatever the test gave findMany, so one mock drives both reads.
    merchant: {
      findMany: jest.fn(),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const rows = ((await prisma.merchant.findMany.mock.results.at(-1)?.value) ?? []) as { id: string }[];
        return rows.find((m) => m.id === where.id) ?? null;
      }),
    },
    payout: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    payoutAccount: { findFirst: jest.fn(async ({ where }: any) => (where.status === "APPROVED" && where.currency === "BOB" ? approvedAccount : null)) },
    merchantKycSubmission: { findFirst: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(0),
    inTransaction: false,
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => {
      prisma.inTransaction = true;
      try {
        return await cb(prisma);
      } finally {
        prisma.inTransaction = false;
      }
    }),
  };
  return prisma;
}

function termsAccepted() {
  return { needsMerchantAcceptance: jest.fn().mockResolvedValue(false) };
}

describe("PayoutsService.getPayableBalance", () => {
  it("nets credits minus debits on MERCHANT_PAYABLE", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { direction: LedgerDirection.CREDIT, _sum: { amount: 10000 } },
      { direction: LedgerDirection.DEBIT, _sum: { amount: 3000 } },
    ]);
    const service = new PayoutsService(prisma as any, termsAccepted() as any);

    await expect(service.getPayableBalance("m_1")).resolves.toBe(7000);
  });

  it("treats a missing direction bucket as zero", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    const service = new PayoutsService(prisma as any, termsAccepted() as any);

    await expect(service.getPayableBalance("m_1")).resolves.toBe(5000);
  });
});

describe("PayoutsService.createDuePayouts", () => {
  const aggregatorMerchant = { id: "m_1", settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE };

  it("skips a merchant whose payouts ops has held", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([{ ...aggregatorMerchant, payoutHeldAt: new Date() }]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });

    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("pays nothing while the available balance is negative", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 1000 } },
      { currency: "BOB", direction: LedgerDirection.DEBIT, _sum: { amount: 4000 } },
    ]);

    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("holds the payout of a merchant who has not accepted the terms in force", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });
    const terms = { needsMerchantAcceptance: jest.fn().mockResolvedValue(true) };

    await new PayoutsService(prisma as any, terms as any).createDuePayouts();

    expect(terms.needsMerchantAcceptance).toHaveBeenCalledWith("m_1");
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("creates a payout for an eligible merchant using their approved KYC bank account", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });

    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ merchantId: "m_1", amount: 5000, bankAccount: "Banco Nacional de Bolivia 4012345678 — Ana Pérez", payoutAccountId: "pa_1" }),
    });
  });

  it("skips a merchant with a payout already in flight", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue({ id: "payout_pending", status: PayoutStatus.PENDING });
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });

    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("keeps paying the other merchants when one merchant's check-and-create fails", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant, { ...aggregatorMerchant, id: "m_2" }]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });
    prisma.payout.create.mockRejectedValueOnce(new Error("deadlock detected"));
    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    const logError = jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);

    await expect(service.createDuePayouts()).resolves.toBeUndefined();

    expect(prisma.payout.create).toHaveBeenCalledTimes(2);
    expect(prisma.payout.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ merchantId: "m_2" }) });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("m_1"), expect.anything());
  });

  it("keeps paying the other merchants when reading one merchant's balance fails", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant, { ...aggregatorMerchant, id: "m_2" }]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });
    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);

    await service.createDuePayouts();

    expect(prisma.payout.create).toHaveBeenCalledTimes(1);
    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ merchantId: "m_2" }) });
  });

  it("checks and creates each payout inside a transaction that holds the merchant's settlement lock", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });
    const seen: { inFlightCheck?: boolean; create?: boolean } = {};
    prisma.payout.findFirst.mockImplementation(async () => { seen.inFlightCheck = prisma.inTransaction; return null; });
    prisma.payout.create.mockImplementation(async () => { seen.create = prisma.inTransaction; });

    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ inFlightCheck: true, create: true });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.payout.findFirst.mock.invocationCallOrder[0]);
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.payout.create.mock.invocationCallOrder[0]);
  });

  it("treats a failed payout still due a retry as in flight", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue({ id: "payout_retrying", status: PayoutStatus.FAILED });
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });

    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();

    expect(prisma.payout.findFirst).toHaveBeenCalledWith({
      where: {
        merchantId: "m_1",
        currency: "BOB",
        OR: [{ status: PayoutStatus.PENDING }, { status: PayoutStatus.FAILED, nextRetryAt: { not: null } }],
      },
    });
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("skips a merchant with a zero or negative balance", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);

    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("never pays out a FACILITATOR merchant, even with a positive ledger balance", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([]); // the findMany where-clause itself excludes FACILITATOR; simulate that here
    const service = new PayoutsService(prisma as any, termsAccepted() as any);

    await service.createDuePayouts();

    expect(prisma.merchant.findMany).toHaveBeenCalledWith({
      where: { settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE },
    });
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("skips a merchant with no approved KYC on file rather than guessing a bank account", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue(null);

    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
});

describe("PayoutsService multi-currency", () => {
  const aggregatorMerchant = { id: "m_1", settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE };

  it("filters the single-currency balance by currency, defaulting to BOB", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);
    const service = new PayoutsService(prisma as any, termsAccepted() as any);

    await service.getPayableBalance("m_1");
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchantId: "m_1", currency: "BOB" }),
    }));
  });

  it("returns one balance per currency without summing across them", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 70000 } },
      { currency: "USD", direction: LedgerDirection.CREDIT, _sum: { amount: 9500 } },
      { currency: "USD", direction: LedgerDirection.DEBIT, _sum: { amount: 500 } },
    ]);
    const service = new PayoutsService(prisma as any, termsAccepted() as any);

    await expect(service.getPayableBalances("m_1")).resolves.toEqual([
      { currency: "BOB", payableBalance: 70000 },
      { currency: "USD", payableBalance: 9000 },
    ]);
  });

  it("creates separate BOB and USD payouts to the matching bank accounts", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } },
      { currency: "USD", direction: LedgerDirection.CREDIT, _sum: { amount: 900 } },
    ]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123", payoutUsdBankAccount: "US 987" });
    const service = new PayoutsService(prisma as any, termsAccepted() as any);

    await service.createDuePayouts();

    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 5000, currency: "BOB", bankAccount: "Banco Nacional de Bolivia 4012345678 — Ana Pérez", payoutAccountId: "pa_1" }) });
    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 900, currency: "USD", bankAccount: "US 987" }) });
    expect(prisma.payout.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ merchantId: "m_1", currency: "USD" }) });
  });

  it("holds a USD balance when no USD bank account is on file", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "USD", direction: LedgerDirection.CREDIT, _sum: { amount: 900 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123", payoutUsdBankAccount: null });
    const service = new PayoutsService(prisma as any, termsAccepted() as any);

    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
});

describe("PayoutsService.payoutBlocker", () => {
  const eligible = { id: "m_1", settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE, payoutHeldAt: null };

  function withMerchant(merchant: Record<string, unknown> | null, kyc: Record<string, unknown> | null = { status: KycStatus.APPROVED, payoutBankAccount: "BNB 123", payoutUsdBankAccount: null }) {
    const prisma = makeFakePrisma();
    prisma.merchant.findUnique.mockResolvedValue(merchant as any);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue(kyc);
    prisma.payout.findFirst.mockResolvedValue(null);
    return prisma;
  }

  it("is null for a merchant the batch would pay", async () => {
    await expect(new PayoutsService(withMerchant(eligible) as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBeNull();
  });

  it.each([
    ["held", { ...eligible, payoutHeldAt: new Date() }],
    ["facilitator", { ...eligible, settlementMode: SettlementMode.FACILITATOR }],
    ["inactive", { ...eligible, status: MerchantStatus.SUSPENDED }],
  ])("reports %s", async (blocker, merchant) => {
    await expect(new PayoutsService(withMerchant(merchant) as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBe(blocker);
  });

  it("reports terms not accepted", async () => {
    const terms = { needsMerchantAcceptance: jest.fn().mockResolvedValue(true) };
    await expect(new PayoutsService(withMerchant(eligible) as any, terms as any).payoutBlocker("m_1", "BOB")).resolves.toBe("terms");
  });

  it("reports missing KYC and a missing account for the currency", async () => {
    await expect(new PayoutsService(withMerchant(eligible, null) as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBe("kyc");
    await expect(new PayoutsService(withMerchant(eligible) as any, termsAccepted() as any).payoutBlocker("m_1", "USD")).resolves.toBe("no_account");
  });

  it("reports a payout already in flight", async () => {
    const prisma = withMerchant(eligible);
    prisma.payout.findFirst.mockResolvedValue({ id: "payout_pending" });
    await expect(new PayoutsService(prisma as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBe("in_flight");
  });
});

describe("PayoutsService payout account", () => {
  const merchant = { id: "m_1", settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE };
  function ready() {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([merchant]);
    prisma.merchant.findUnique.mockResolvedValue(merchant);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB legacy text" });
    return prisma;
  }

  it("never pays the legacy free-text account: no approved account means account_missing", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockResolvedValue(null);
    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    await expect(service.payoutBlocker("m_1", "BOB")).resolves.toBe("account_missing");
    await service.createDuePayouts();
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("pays nothing while a change waits for review, even with an approved account", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockImplementation(async ({ where }: any) => (where.status === "PENDING_REVIEW" ? { id: "pa_2" } : approvedAccount));
    await expect(new PayoutsService(prisma as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBe("account_review");
  });

  it("waits until the approved change is payable", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockImplementation(async ({ where }: any) => (where.status === "APPROVED" ? { ...approvedAccount, payableFrom: new Date(Date.now() + 3_600_000) } : null));
    await expect(new PayoutsService(prisma as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBe("account_waiting");
  });

  it("checks a pause and the terms before the account", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockResolvedValue(null);
    const terms = { needsMerchantAcceptance: jest.fn().mockResolvedValue(true) };
    await expect(new PayoutsService(prisma as any, terms as any).payoutBlocker("m_1", "BOB")).resolves.toBe("terms");
  });

  it("records which approved account a payout went to", async () => {
    const prisma = ready();
    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();
    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payoutAccountId: "pa_1", bankAccount: "Banco Nacional de Bolivia 4012345678 — Ana Pérez" }) });
  });
});
