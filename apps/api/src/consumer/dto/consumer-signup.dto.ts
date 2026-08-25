import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ConsumerSignupDto {
  @ApiProperty({ example: "María Quispe" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: "maria@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "7845123", description: "Bolivian carnet/CI; punctuation and extensions are normalized." })
  @IsString()
  @Matches(/^(?=(?:\D*\d){4,24}\D*$).+$/)
  carnet!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
