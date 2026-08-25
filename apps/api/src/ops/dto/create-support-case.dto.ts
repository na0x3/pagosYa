import { ApiProperty } from "@nestjs/swagger";
import { SupportCaseCategory, SupportCasePriority } from "@prisma/client";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSupportCaseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  merchantId!: string;

  @ApiProperty({ enum: SupportCaseCategory })
  @IsEnum(SupportCaseCategory)
  category!: SupportCaseCategory;

  @ApiProperty({ enum: SupportCasePriority, default: SupportCasePriority.NORMAL })
  @IsEnum(SupportCasePriority)
  priority!: SupportCasePriority;

  @ApiProperty({ example: "El titular no puede ingresar a su cuenta." })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  summary!: string;
}
