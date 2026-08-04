import { Module } from "@nestjs/common";
import { PaymentMethodsService } from "./payment-methods.service";

@Module({
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
