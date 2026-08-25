import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from "class-validator";

export class DebtLookupDto {
  @ApiProperty({ example: "7845123" })
  @IsString()
  @MinLength(4)
  @MaxLength(24)
  customerDocument!: string;
}

export class DebtCheckoutDto extends DebtLookupDto {
  @ApiProperty({ type: [String], description: "Pending debt records selected by the customer." })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  debtRecordIds!: string[];
}
