import { Type } from "class-transformer";
import { IsNumber, IsObject, IsString, ValidateNested } from "class-validator";

class PaymentQrDto {
  @IsString()
  qrId!: string;

  @IsString()
  transactionId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  currency!: string;
}

/** Body Baneco POSTs to notifyPaymentQR (§7.5): `{ payment: PaymentQR }`. */
export class BanecoQrWebhookDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentQrDto)
  payment!: PaymentQrDto;
}
