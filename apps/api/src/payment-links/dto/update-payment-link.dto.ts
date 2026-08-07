import { PartialType } from "@nestjs/swagger";
import { CreatePaymentLinkDto } from "./create-payment-link.dto";

export class UpdatePaymentLinkDto extends PartialType(CreatePaymentLinkDto) {}
