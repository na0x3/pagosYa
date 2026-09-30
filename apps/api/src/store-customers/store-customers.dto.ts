import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

// The service checks lengths and formats and answers in Spanish; these only bound the payload and keep the whitelist.
export class RegisterCustomerDto {
  @IsString() @MaxLength(1000) name!: string;
  @IsString() @MaxLength(1000) email!: string;
  @IsString() @MaxLength(1000) password!: string;
}
export class LoginCustomerDto {
  @IsString() @MaxLength(1000) email!: string;
  @IsString() @MaxLength(1000) password!: string;
}
export class CustomerTokenDto {
  @IsString() @MaxLength(1000) token!: string;
}
export class ForgotPasswordDto {
  @IsString() @MaxLength(1000) email!: string;
}
export class ResetPasswordDto {
  @IsString() @MaxLength(1000) token!: string;
  @IsString() @MaxLength(1000) password!: string;
}
export class UpdateCustomerProfileDto {
  @IsString() @MaxLength(1000) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) phone?: string;
}
export class ReplaceAddressesDto {
  @IsArray() @ArrayMaxSize(10) addresses!: unknown[];
}
export class DeleteCustomerDto {
  @IsString() @MaxLength(1000) password!: string;
}
