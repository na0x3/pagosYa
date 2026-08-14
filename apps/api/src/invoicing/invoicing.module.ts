import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InvoicingService } from "./invoicing.service";
import { InvoiceEmissionWorker } from "./invoice-emission.worker";
import { InvoicingController } from "./invoicing.controller";
import { MockSinInvoicingAdapter } from "./adapters/mock-sin-invoicing.adapter";
import { INVOICING_PROVIDER } from "./tokens";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { SiatSoapClient } from "./adapters/siat-soap.client";
import { SiatInvoicingAdapter } from "./adapters/siat-invoicing.adapter";
import { InvoicingProvider } from "./interfaces/invoicing-provider.interface";
import { SiatCatalogService } from "./siat-catalog.service";
import { SiatCatalogController } from "./siat-catalog.controller";

@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [InvoicingController, SiatCatalogController],
  providers: [
    InvoicingService,
    InvoiceEmissionWorker,
    MockSinInvoicingAdapter,
    SiatSoapClient,
    SiatInvoicingAdapter,
    SiatCatalogService,
    {
      provide: INVOICING_PROVIDER,
      useFactory: (
        mock: MockSinInvoicingAdapter,
        siat: SiatInvoicingAdapter,
        config: ConfigService,
      ): InvoicingProvider => (config.get<boolean>("app.siat.enabled") ? siat : mock),
      inject: [MockSinInvoicingAdapter, SiatInvoicingAdapter, ConfigService],
    },
  ],
  exports: [InvoicingService, SiatCatalogService],
})
export class InvoicingModule {}
