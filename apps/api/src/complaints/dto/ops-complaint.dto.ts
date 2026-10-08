import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ComplaintOutcome, ComplaintStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Length, Matches, MaxLength } from "class-validator";

export class ListComplaintsQuery {
  @ApiPropertyOptional({ enum: ComplaintStatus }) @IsOptional() @IsEnum(ComplaintStatus) status?: ComplaintStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
}
export class ExportComplaintsQuery {
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
}
export class LinkComplaintDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^pi_[0-9a-z]+$/) paymentIntentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) merchantId?: string;
}
export class ComplaintNoteDto { @ApiProperty() @IsString() @Length(2, 5000) body!: string; }
export class AskMerchantDto { @ApiProperty() @IsString() @Length(10, 2000) question!: string; }
export class ExtendComplaintDto { @ApiProperty() @IsString() @Length(8, 1000) reason!: string; }
export class AnswerComplaintDto {
  @ApiProperty({ enum: ComplaintOutcome }) @IsEnum(ComplaintOutcome) outcome!: ComplaintOutcome;
  @ApiProperty() @IsString() @Length(20, 5000) answer!: string;
}
export class ComplaintRefundDto {
  @ApiPropertyOptional({ description: "Minor units; omit for a full refund" }) @IsOptional() @IsInt() @IsPositive() amount?: number;
}
export class ComplaintPauseDto { @ApiProperty() @IsString() @Length(8, 500) reason!: string; }
