import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { MerchantsService } from "./merchants.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";

@ApiTags("merchants")
@Controller("v1/merchants")
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Post()
  create(@Body() dto: CreateMerchantDto) {
    return this.merchants.create(dto);
  }
}
