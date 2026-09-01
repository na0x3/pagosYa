import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class SendStoreAgentMessageDto {
  @ApiProperty({
    description: "A merchant instruction for the current private storefront proposal.",
    example: "Mantén el catálogo, pero haz la apertura más cálida.",
  })
  @IsString()
  @IsSafeText()
  @MaxLength(1200)
  instruction!: string;

  @ApiPropertyOptional({ description: "Private proposal that this revision must inherit." })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  proposalId?: string;
}
