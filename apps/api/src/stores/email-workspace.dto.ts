import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class EmailTemplateDto {
    @IsInt()
    @Min(0)
    revision!: number;
    @IsBoolean()
    enabled!: boolean;
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    subject!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body!: string;
}
class EmailRecipientDto {
    @IsEmail()
    @MaxLength(254)
    email!: string;
    @IsArray()
    @ArrayMaxSize(3)
    @ArrayUnique()
    @IsIn(['NEW_ORDER', 'REFUND', 'WEEKLY'], { each: true })
    events!: string[];
}
export class EmailStaffDto {
    @IsInt()
    @Min(0)
    revision!: number;
    @IsBoolean()
    enabled!: boolean;
    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => EmailRecipientDto)
    recipients!: EmailRecipientDto[];
}
export class EmailDomainDto {
    @IsInt()
    @Min(0)
    revision!: number;
    @Matches(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
    name!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    @Matches(/^[^<>\r\n]+$/)
    senderName!: string;
}
export class EmailRevisionDto {
    @IsInt()
    @Min(0)
    revision!: number;
}
