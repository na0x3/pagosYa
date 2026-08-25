import { ApiProperty } from "@nestjs/swagger";
import { OpsRole } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class CreateOpsUserDto {
  @ApiProperty({ example: "Ana Gutierrez" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "ana@pagosya.bo" })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: OpsRole, default: OpsRole.SUPPORT_AGENT, required: false })
  @IsOptional()
  @IsEnum(OpsRole)
  role?: OpsRole;
}
