import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateCustomDomainDto {
  @ApiProperty({
    example: "www.mitienda.bo",
    description: "Merchant-owned hostname to connect. A full https URL is accepted and normalized.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  hostname!: string;
}
