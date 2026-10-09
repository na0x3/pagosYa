import { Equals, IsString, MaxLength } from "class-validator";

export class JoinMembershipDto {
  @IsString() @MaxLength(40) productId!: string;
  @IsString() @MaxLength(40) periodId!: string;
  @Equals(true, { message: "Acepta las condiciones de la membresía para continuar." }) consent!: true;
}
