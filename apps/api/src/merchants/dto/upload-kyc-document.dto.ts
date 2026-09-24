import { ApiProperty } from "@nestjs/swagger";
import { KycDocumentSlot } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UploadKycDocumentDto {
  @ApiProperty({ enum: KycDocumentSlot })
  @IsEnum(KycDocumentSlot)
  slot!: KycDocumentSlot;
}
