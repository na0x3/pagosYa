import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class MerchantReplyDto {
  @ApiProperty() @IsString() @Length(10, 5000) body!: string;
}
