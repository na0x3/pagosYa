import { IsIn } from 'class-validator';
import { SOURCE_MOTION_MODES, type SourceMotionMode } from '../source-motion';
import { SourceProjectRevisionDto } from './save-source-project.dto';
export class SourceMotionDto extends SourceProjectRevisionDto {
  @IsIn(SOURCE_MOTION_MODES) motion!: SourceMotionMode;
}
