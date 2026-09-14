import { Type } from 'class-transformer';
import { Equals, IsEmail, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested, IsDefined } from 'class-validator';

export class DomainSearchDto {
  @IsString() @Length(1, 100) query!: string;
}
export class DomainQuoteDto {
  @IsString() @Length(4, 100) hostname!: string;
}
export class DomainRegistrantDto {
  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @Matches(/^\+[1-9][0-9]{6,14}$/) phone!: string;
  @IsString() @Length(3, 160) address1!: string;
  @IsString() @Length(1, 80) city!: string;
  @IsString() @Length(1, 80) state!: string;
  @IsString() @Length(1, 20) zip!: string;
  @Matches(/^[A-Z]{2}$/) country!: string;
}
export class DomainCheckoutDto {
  @IsUUID() quoteId!: string;
  @IsDefined() @ValidateNested() @Type(() => DomainRegistrantDto) registrant!: DomainRegistrantDto;
  @Equals(true) accepted!: boolean;
}
