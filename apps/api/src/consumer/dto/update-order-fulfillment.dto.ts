import { ApiProperty } from "@nestjs/swagger";
import { OrderFulfillmentStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateOrderFulfillmentDto {
  @ApiProperty({ enum: OrderFulfillmentStatus })
  @IsEnum(OrderFulfillmentStatus)
  status!: OrderFulfillmentStatus;
}
