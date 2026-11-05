import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';

export const POINT_PAGES = ['home', 'product', 'about', 'contact', 'faq', 'shipping'] as const;
/** A known page or the address of a page YAPI made (spec 2026-11-05 creates anything). */
const POINT_PAGE = /^[a-z][a-z0-9-]{0,39}$/;
export const POINT_PARTS = ['header', 'announcement', 'footer', 'menu'] as const;
const FINITE = { allowNaN: false, allowInfinity: false };

/** A loop is pairs of numbers: an odd count is not a loop (the Studio refuses it too). */
@ValidatorConstraint({ name: 'pointPairs' })
class PointPairs implements ValidatorConstraintInterface {
  validate(value: unknown) { return Array.isArray(value) && value.length % 2 === 0; }
  defaultMessage() { return 'points must be x,y pairs'; }
}

export class SourcePointRectDto {
  @IsNumber(FINITE) @Min(0) @Max(100000) x!: number;
  @IsNumber(FINITE) @Min(0) @Max(100000) y!: number;
  @IsNumber(FINITE) @Min(0) @Max(100000) width!: number;
  @IsNumber(FINITE) @Min(0) @Max(100000) height!: number;
}
export class SourcePointSectionDto {
  @Matches(POINT_PAGE) page!: string;
  @IsInt() @Min(0) @Max(40) at!: number;
  @IsString() @MaxLength(60) label!: string;
}
/** A loop the merchant drew around part of the preview (spec 2026-11-05 point-at). */
export class SourcePointAreaDto {
  @IsArray() @ArrayMinSize(6) @ArrayMaxSize(128) @IsNumber(FINITE, { each: true }) @Validate(PointPairs) points!: number[];
  @ValidateNested() @Type(() => SourcePointRectDto) rect!: SourcePointRectDto;
  @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SourcePointSectionDto) sections!: SourcePointSectionDto[];
  @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(200, { each: true }) texts!: string[];
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(500, { each: true }) @Matches(/^(https?:\/\/|\/|assets\/)/, { each: true }) photos!: string[];
  @IsArray() @ArrayMaxSize(4) @IsIn(POINT_PARTS, { each: true }) parts!: Array<(typeof POINT_PARTS)[number]>;
  @IsInt() @Min(280) @Max(2400) width!: number;
  /** The preview's viewport height (final review 2026-11-05); optional for drafts saved before it. */
  @IsOptional() @IsInt() @Min(200) @Max(4000) height?: number;
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,63}\.html(\?[A-Za-z0-9=&_.%+,-]{0,135})?$/) pageQuery!: string;
}

/** A section picked in the Studio preview; the id has the same shape the preview and the section scope accept. On a template
 *  store it also carries its address (page + number) or the circle drawn around it (spec 2026-11-05 point-at). */
export class SourceSelectionDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{0,47}$/) sectionId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(40) at?: number;
  @IsOptional() @Matches(POINT_PAGE) page?: string;
  @IsOptional() @ValidateNested() @Type(() => SourcePointAreaDto) area?: SourcePointAreaDto;
}
/** The section in the middle of the preview when nothing is selected. */
export class SourceViewingDto {
  @Matches(POINT_PAGE) page!: string;
  @IsOptional() @IsInt() @Min(0) @Max(40) at?: number;
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{0,47}$/) sectionId?: string;
}
