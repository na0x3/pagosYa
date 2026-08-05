import { Module } from "@nestjs/common";
import { InvoicingService } from "./invoicing.service";
import { InvoiceEmissionWorker } from "./invoice-emission.worker";
import { InvoicingController } from "./invoicing.controller";
import { MockSinInvoicingAdapter } from "./adapters/mock-sin-invoicing.adapter";
import { INVOICING_PROVIDER } from "./tokens";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";

@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [InvoicingController],
  providers: [
    InvoicingService,
    InvoiceEmissionWorker,
    { provide: INVOICING_PROVIDER, useClass: MockSinInvoicingAdapter },
  ],
  exports: [InvoicingService],
})
export class InvoicingModule {}
