import "reflect-metadata";
import { PrismaClient, ApiKeyMode, ApiKeyType, SettlementMode } from "@prisma/client";
import { ApiKeyService } from "../src/auth/api-key.service";
import { PrismaService } from "../src/prisma/prisma.service";

async function main() {
  const prisma = new PrismaClient();
  const apiKeys = new ApiKeyService(prisma as unknown as PrismaService);

  const merchants = [
    { name: "pagosYa Demo Store (Aggregator)", email: "demo-aggregator@pagosya.bo", settlementMode: SettlementMode.AGGREGATOR },
    { name: "pagosYa Demo Store (Facilitator)", email: "demo-facilitator@pagosya.bo", settlementMode: SettlementMode.FACILITATOR },
  ];

  for (const m of merchants) {
    const merchant = await prisma.merchant.upsert({
      where: { email: m.email },
      update: {},
      create: { name: m.name, email: m.email, settlementMode: m.settlementMode, status: "ACTIVE" },
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
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
