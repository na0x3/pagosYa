import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsSafeText } from '../../common/validation/safe-text.decorator';

export class AssistantChatDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z0-9]{20,40}$/)
  conversationId?: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) @Matches(/\S/) @IsSafeText()
  message!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  pagePath?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  productId?: string;

  /** The buyer tapped an "Agregar" button in the chat since the last message. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  addedToCart?: boolean;
}
