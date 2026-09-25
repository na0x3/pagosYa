import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateMerchantSessionDto {
  @ApiProperty({ example: "Ana", minLength: 1, maxLength: 32 })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  profileName!: string;

  /** Blob variation (B1). The old animal avatars 1–4 are simply the first four variations. */
  @ApiProperty({ example: 2, minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  profileAvatarId!: number;
}
