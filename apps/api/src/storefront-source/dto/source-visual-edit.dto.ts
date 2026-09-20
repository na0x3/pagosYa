import { IsString, MaxLength, MinLength } from 'class-validator';
import { SourceProjectRevisionDto } from './save-source-project.dto';

export class SourceVisualEditDto extends SourceProjectRevisionDto {
  @IsString() @MinLength(1) @MaxLength(180) fieldId!: string;
  @IsString() @MinLength(1) @MaxLength(4000) value!: string;
}
