import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import configuration from "../config/configuration";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentLinksModule } from "../payment-links/payment-links.module";
import { PaymentLinksService } from "../payment-links/payment-links.service";
import { ProductContentModule } from "./product-content.module";
import { ProductPageController } from "./product-page.controller";
import { ProductPageWriterService } from "./product-page-writer.service";

/** The writer is an @Optional() dependency of product create: if PaymentLinksModule stopped importing
 * ProductPageModule, products would silently stop getting long pages and nothing would fail. Compiling the real
 * modules proves the wiring (same approach as the inbox wiring spec). */
describe("ProductPageModule wiring", () => {
  const compile = (module: unknown) => Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ThrottlerModule.forRoot([]), PrismaModule, module as never] })
    .overrideProvider(PrismaService).useValue({}).compile();

  it("PaymentLinksModule gives product create the long-page writer", async () => {
    const moduleRef = await compile(PaymentLinksModule);
    expect((moduleRef.get(PaymentLinksService) as unknown as { pageWriter?: unknown }).pageWriter).toBeInstanceOf(ProductPageWriterService);
  });
  it("ProductContentModule serves the Studio regenerate endpoint", async () => {
    const moduleRef = await compile(ProductContentModule);
    expect(moduleRef.get(ProductPageController)).toBeInstanceOf(ProductPageController);
  });
});
