import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class StoreRewardsDto {
  @ApiProperty()
  @IsString()
  storeId!: string;
}
