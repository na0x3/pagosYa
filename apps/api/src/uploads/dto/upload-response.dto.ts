import { ApiProperty } from "@nestjs/swagger";

export class UploadResponseDto {
  @ApiProperty({ description: "Relative path to feed into imageUrl/logoUrl fields elsewhere in the API.", example: "/v1/uploads/3f1b2c4d-5678-90ab-cdef-1234567890ab.png" })
  url!: string;

  @ApiProperty({ description: "Merchant-owned asset id used by Visual Studio to preserve source lineage." })
  assetId!: string;
}
