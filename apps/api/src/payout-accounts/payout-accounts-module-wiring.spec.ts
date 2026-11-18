import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import configuration from "../config/configuration";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutAccountsModule } from "./payout-accounts.module";
import { PayoutAccountsService } from "./payout-accounts.service";

/** Compiles the real PayoutAccountsModule so a missing import fails here, not at boot. */
describe("PayoutAccountsModule wiring", () => {
  it("resolves the payout accounts service and its controllers", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ThrottlerModule.forRoot([]), PrismaModule, PayoutAccountsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(PayoutAccountsService)).toBeInstanceOf(PayoutAccountsService);
  });
});
