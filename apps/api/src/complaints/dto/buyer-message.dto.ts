import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class BuyerMessageDto {
  @ApiProperty() @IsString() @Length(2, 5000) body!: string;
}
