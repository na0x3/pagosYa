import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, Max, Min } from "class-validator";

export class ClaimProgressCelebrationsDto {
  @ApiProperty()
  @IsString()
  storeId!: string;

}

export class AcknowledgeProgressCelebrationDto extends ClaimProgressCelebrationsDto {
  @ApiProperty({ minimum: 0, maximum: 7, description: "Zero-based companion level that was displayed" })
  @IsInt()
  @Min(0)
  @Max(7)
  level!: number;
}
