import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class SubscriberActionDto {
  @IsIn(["skip", "pause", "resume", "cancel"]) action!: "skip" | "pause" | "resume" | "cancel";
}
export class PublicSubscriptionActionDto {
  @IsIn(["skip", "pause", "resume", "cancel", "change_cadence"]) action!: "skip" | "pause" | "resume" | "cancel" | "change_cadence";
  @IsOptional() @IsIn(["WEEKLY", "BIWEEKLY", "MONTHLY"]) cadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
}
export class SubscriptionSettingsDto {
  @IsBoolean() enabled!: boolean;
}
export class ListSubscribersQuery {
  @IsOptional() @IsIn(["ACTIVE", "PAUSED", "CANCELED", "PENDING"]) status?: "ACTIVE" | "PAUSED" | "CANCELED" | "PENDING";
  @IsOptional() @IsString() @MaxLength(40) productId?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(40) cursor?: string;
}
