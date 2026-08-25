import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: "https://merchant.example.bo/webhooks/pagosya" })
  @IsUrl({ protocols: ["https"], require_protocol: true, require_tld: true })
  @MaxLength(2_048)
  url!: string;

  @ApiPropertyOptional({
    description: "Event types to receive. Empty/omitted = all events.",
    example: ["payment_intent.succeeded", "payment_intent.failed"],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  enabledEvents?: string[];
}
