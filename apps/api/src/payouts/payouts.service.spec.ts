import { KycStatus, LedgerDirection, MerchantStatus, PayoutStatus, SettlementMode } from "@prisma/client";
import { PayoutsService } from "./payouts.service";

function makeFakePrisma() {
  return {
    ledgerEntry: { groupBy: jest.fn() },
    merchant: { findMany: jest.fn() },
    payout: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    merchantKycSubmission: { findFirst: jest.fn() },
  };
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
      data: expect.objectContaining({ merchantId: "m_1", amount: 5000, bankAccount: "BNB 123" }),
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

    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 5000, currency: "BOB", bankAccount: "BNB 123" }) });
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
