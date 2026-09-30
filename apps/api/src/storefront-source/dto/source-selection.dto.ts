import { IsString, Matches } from 'class-validator';

/** A section picked in the Studio preview; the id has the same shape the preview and the section scope accept. */
export class SourceSelectionDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{0,47}$/) sectionId!: string;
}
