import { IsIn } from 'class-validator';
import { IsOptional } from 'class-validator';
import { SOURCE_MOTION_MODES, SOURCE_SCROLL_FEELS, type SourceMotionMode, type SourceScrollFeel } from '../source-motion';
import { SourceProjectRevisionDto } from './save-source-project.dto';
export class SourceMotionDto extends SourceProjectRevisionDto {
  @IsIn(SOURCE_MOTION_MODES) motion!: SourceMotionMode;
  @IsOptional() @IsIn(SOURCE_SCROLL_FEELS) scrollFeel?: SourceScrollFeel;
}
