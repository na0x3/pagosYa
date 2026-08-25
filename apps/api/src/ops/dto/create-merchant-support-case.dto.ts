import { ApiProperty } from "@nestjs/swagger";
import { SupportCaseCategory } from "@prisma/client";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

export class CreateMerchantSupportCaseDto {
  @ApiProperty({ enum: SupportCaseCategory })
  @IsEnum(SupportCaseCategory)
  category!: SupportCaseCategory;

  @ApiProperty({ example: "Un cobro figura duplicado y necesito que lo revisen." })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  summary!: string;
}
