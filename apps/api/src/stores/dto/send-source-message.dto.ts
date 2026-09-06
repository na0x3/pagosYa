import { IsIn, ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SourceProjectRevisionDto } from './save-source-project.dto';
export class SendSourceMessageDto extends SourceProjectRevisionDto {
  @IsString() @MinLength(1) @MaxLength(6000) instruction!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(500, { each: true }) assetUrls?: string[];
  @IsOptional() @IsIn(['business', 'logo', 'products', 'colors', 'review']) setupStep?: string;
  @IsOptional() @IsIn(['generate', 'restart']) setupAction?: 'generate' | 'restart';
}
