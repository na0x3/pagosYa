import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: "https://merchant.example.bo/webhooks/pagosya" })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiPropertyOptional({
    description: "Event types to receive. Empty/omitted = all events.",
    example: ["payment_intent.succeeded", "payment_intent.failed"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledEvents?: string[];
}
