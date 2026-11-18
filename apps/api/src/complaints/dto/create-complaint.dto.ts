import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ComplaintCategory, ComplaintRequest } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class CreateComplaintDto {
  @ApiProperty() @IsString() @Length(2, 120) buyerName!: string;
  @ApiProperty() @IsEmail() @MaxLength(200) buyerEmail!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) buyerPhone?: string;
  @ApiPropertyOptional({ description: "The 'Orden:' value on the receipt" }) @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) storeName?: string;
  @ApiProperty({ enum: ComplaintCategory }) @IsEnum(ComplaintCategory) category!: ComplaintCategory;
  @ApiProperty({ enum: ComplaintRequest }) @IsEnum(ComplaintRequest) request!: ComplaintRequest;
  @ApiProperty() @IsString() @Length(20, 5000) description!: string;
  /** Honeypot: hidden from people, filled in by bots. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) website?: string;
}
