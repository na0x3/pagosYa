import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class RailCallbackDto {
  @ApiProperty()
  @IsString()
  paymentIntentId!: string;

  @ApiProperty({ enum: ["succeeded", "failed"] })
  @IsIn(["succeeded", "failed"])
  status!: "succeeded" | "failed";

  @ApiProperty()
  @IsString()
  railReference!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  failureReason?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}
