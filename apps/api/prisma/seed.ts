import "reflect-metadata";
import { PrismaClient, ApiKeyMode, ApiKeyType, KycStatus, SettlementMode } from "@prisma/client";
import { ApiKeyService } from "../src/auth/api-key.service";
import { KycService } from "../src/merchants/kyc.service";
import { MerchantsService } from "../src/merchants/merchants.service";
import { PrismaService } from "../src/prisma/prisma.service";

async function main() {
  const prisma = new PrismaClient();
  const apiKeys = new ApiKeyService(prisma as unknown as PrismaService);
  const kyc = new KycService(prisma as unknown as PrismaService);
  const merchantsService = new MerchantsService(prisma as unknown as PrismaService, apiKeys);

  const merchants = [
    { name: "pagosYa Demo Store (Aggregator)", email: "demo-aggregator@pagosya.bo", settlementMode: SettlementMode.AGGREGATOR },
    { name: "pagosYa Demo Store (Facilitator)", email: "demo-facilitator@pagosya.bo", settlementMode: SettlementMode.FACILITATOR },
  ];

  for (const m of merchants) {
    const merchant = await prisma.merchant.upsert({
      where: { email: m.email },
      update: {},
      // status starts PENDING (schema default) — same as any real self-serve
      // signup. Only the Aggregator demo below walks through KYC to ACTIVE.
      create: { name: m.name, email: m.email, settlementMode: m.settlementMode },
    });

    const existingKeys = await prisma.apiKey.count({ where: { merchantId: merchant.id } });
    if (existingKeys > 0) {
      console.log(`\n${m.name} already seeded (merchant id: ${merchant.id}) — skipping key issuance.`);
      continue;
    }

    const secretKey = await apiKeys.issue(merchant.id, ApiKeyType.SECRET, ApiKeyMode.TEST);
    const publishableKey = await apiKeys.issue(merchant.id, ApiKeyType.PUBLISHABLE, ApiKeyMode.TEST);

    console.log(`\n${m.name}`);
    console.log(`  merchant id:     ${merchant.id}`);
    console.log(`  secret key:      ${secretKey.fullKey}`);
    console.log(`  publishable key: ${publishableKey.fullKey}`);

    // Demonstrate the full KYC -> ACTIVE -> LIVE keys path for one merchant;
    // leave the other PENDING to show what an unreviewed merchant looks like.
    if (m.settlementMode === SettlementMode.AGGREGATOR) {
      const submission = await kyc.submit(merchant.id, {
        legalName: m.name,
        taxId: "1023456028",
        legalRepName: "Maria Fernanda Rojas",
        legalRepDocumentId: "7654321 LP",
        payoutBankAccount: "BNB 4012345678",
      });
      const reviewed = await kyc.review(submission.id, { decision: KycStatus.APPROVED, note: "Seed data auto-approval" });
      console.log(`  kyc:             ${reviewed.status} (reviewed ${reviewed.reviewedAt?.toISOString()})`);

      const { liveKeys } = await merchantsService.issueLiveKeys(merchant.id);
      console.log(`  live secret key: ${liveKeys.secretKey}`);
      console.log(`  live pub key:    ${liveKeys.publishableKey}`);
    } else {
      console.log(`  kyc:             not submitted (status: ${merchant.status})`);
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
