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

describe("PayoutsService.getPayableBalance", () => {
  it("nets credits minus debits on MERCHANT_PAYABLE", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { direction: LedgerDirection.CREDIT, _sum: { amount: 10000 } },
      { direction: LedgerDirection.DEBIT, _sum: { amount: 3000 } },
    ]);
    const service = new PayoutsService(prisma as any);

    await expect(service.getPayableBalance("m_1")).resolves.toBe(7000);
  });

  it("treats a missing direction bucket as zero", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    const service = new PayoutsService(prisma as any);

    await expect(service.getPayableBalance("m_1")).resolves.toBe(5000);
  });
});

describe("PayoutsService.createDuePayouts", () => {
  const aggregatorMerchant = { id: "m_1", settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE };

  it("creates a payout for an eligible merchant using their approved KYC bank account", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });

    const service = new PayoutsService(prisma as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ merchantId: "m_1", amount: 5000, bankAccount: "BNB 123" }),
    });
  });

  it("skips a merchant with a payout already in flight", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue({ id: "payout_pending", status: PayoutStatus.PENDING });

    const service = new PayoutsService(prisma as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("skips a merchant with a zero or negative balance", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);

    const service = new PayoutsService(prisma as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("never pays out a FACILITATOR merchant, even with a positive ledger balance", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([]); // the findMany where-clause itself excludes FACILITATOR; simulate that here
    const service = new PayoutsService(prisma as any);

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

    const service = new PayoutsService(prisma as any);
    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
});
