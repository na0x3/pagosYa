import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class GoogleLoginDto {
  @ApiProperty({ description: "Google Identity Services ID token returned in the credential callback." })
  @IsString()
  @MaxLength(10_000)
  credential!: string;

  @ApiPropertyOptional({ description: "Carnet/CI required only when Google creates a new consumer account." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  carnet?: string;
}
