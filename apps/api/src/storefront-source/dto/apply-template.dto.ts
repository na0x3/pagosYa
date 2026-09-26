import { SourceProjectRevisionDto } from './save-source-project.dto';

/** Applies a template over this revision; a stale revision is refused like every other save. */
export class ApplyTemplateDto extends SourceProjectRevisionDto {}
