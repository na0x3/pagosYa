import { IsOptional, IsString, MaxLength } from "class-validator";
export class MemberActionDto { @IsOptional() @IsString() @MaxLength(40) periodId?: string; }
