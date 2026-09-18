import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class ArticleDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(100) slug!: string;
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/) locale!: string;
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsString() @MaxLength(500) excerpt!: string;
  @IsString() @MinLength(1) @MaxLength(40000) body!: string;
  @IsString() @MinLength(1) @MaxLength(100) author!: string;
  @IsOptional() @IsISO8601() publishedAt?: string | null;
  @IsOptional() @IsInt() @Min(0) revision?: number;
}
export class ReviewDto {
  @IsString() @MaxLength(250) trackingToken!: string;
  @IsString() @MaxLength(60) productId!: string;
  @IsString() @MinLength(1) @MaxLength(80) displayName!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @MinLength(3) @MaxLength(2000) body!: string;
}
export class ReviewStatusDto { @IsIn(['PUBLISHED', 'REJECTED', 'PENDING']) status!: string; }
export class ReviewQueryDto {
  @IsOptional() @IsIn(['PUBLISHED', 'REJECTED', 'PENDING']) status?: string;
  @IsOptional() @IsString() @MaxLength(80) before?: string;
}
class BundleItemDto { @IsString() @MaxLength(60) productId!: string; @IsInt() @Min(1) @Max(99) quantity!: number; }
export class BundleDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsIn(['FIXED', 'MIX_MATCH', 'BOGO']) kind!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => BundleItemDto) items!: BundleItemDto[];
  @IsInt() @Min(2) @Max(99) minimumQuantity!: number;
  @IsInt() @Min(1) @Max(99) discountPercent!: number;
}
export class BundleStatusDto { @IsBoolean() active!: boolean; }
