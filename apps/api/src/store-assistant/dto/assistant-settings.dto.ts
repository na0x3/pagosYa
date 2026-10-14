import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { IsSafeText } from '../../common/validation/safe-text.decorator';

export class AssistantSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) @IsSafeText() name?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @Matches(/^\/v1\/uploads\/[A-Za-z0-9._-]+$/) avatarUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200) @IsSafeText() greeting?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsIn(['tu', 'usted']) formality?: 'tu' | 'usted';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) @IsSafeText() notes?: string;
}

export class AssistantTestDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9]{20,40}$/) conversationId?: string;
  @IsString() @MinLength(1) @MaxLength(500) @Matches(/\S/) @IsSafeText() message!: string;
}

export class AssistantUnansweredDto {
  @IsIn(['teach', 'ignore']) action!: 'teach' | 'ignore';
  @IsOptional() @IsString() @MaxLength(500) @IsSafeText() answer?: string;
}

export class AssistantCapDto {
  @IsInt() @Min(0) @Max(100000) monthlyCap!: number;
}
