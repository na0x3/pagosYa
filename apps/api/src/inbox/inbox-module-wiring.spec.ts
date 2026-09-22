import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import configuration from "../config/configuration";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { StoresModule } from "../stores/stores.module";
import { StoreCheckoutService } from "../stores/store-checkout.service";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { InboxService } from "./inbox.service";

/**
 * Task 3 injects InboxService into StoreCheckoutService and PaymentIntentsService
 * as `@Optional()`. If the modules that own those two services never import
 * InboxModule, that optional dependency silently resolves to undefined at
 * runtime: thread creation becomes a permanent no-op and nothing fails, not
 * even Nest's own boot-time checks (they only fail loudly for required
 * dependencies). Compiling the real StoresModule and PaymentIntentsModule
 * here — not a hand-assembled stand-in — is what actually proves the fix:
 * these tests fail if InboxModule is ever removed from either module's
 * `imports`, which a test that only asserts "InboxModule compiles" would not
 * catch. PrismaService is overridden because a live datasource is not needed
 * to prove wiring and must not be dialled from a unit test.
 */
describe("InboxModule wiring", () => {
  it("StoresModule satisfies StoreCheckoutService's optional inbox dependency", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), PrismaModule, StoresModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const service = moduleRef.get(StoreCheckoutService);
    expect((service as unknown as { inbox?: InboxService }).inbox).toBeInstanceOf(InboxService);
  });

  it("PaymentIntentsModule satisfies PaymentIntentsService's optional inbox dependency", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), PrismaModule, PaymentIntentsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const service = moduleRef.get(PaymentIntentsService);
    expect((service as unknown as { inbox?: InboxService }).inbox).toBeInstanceOf(InboxService);
  });
});
