import { IsBoolean, IsIn, IsInt, Min, Max, IsOptional, IsString, MaxLength } from "class-validator";

export class SubscriberActionDto {
  @IsIn(["skip", "pause", "resume", "cancel"]) action!: "skip" | "pause" | "resume" | "cancel";
}
export class PublicSubscriptionActionDto {
  @IsIn(["skip", "pause", "resume", "cancel", "change_cadence"]) action!: "skip" | "pause" | "resume" | "cancel" | "change_cadence";
  @IsOptional() @IsIn(["WEEKLY", "BIWEEKLY", "MONTHLY"]) cadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
}
export class SubscriptionSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(30) membershipGraceDays?: number;
}
export class ListSubscribersQuery {
  @IsOptional() @IsIn(["ACTIVE", "PAUSED", "CANCELED", "PENDING", "LAPSED"]) status?: "ACTIVE" | "PAUSED" | "CANCELED" | "PENDING" | "LAPSED";
  @IsOptional() @IsIn(["subscription", "membership"]) kind?: "subscription" | "membership";
  @IsOptional() @IsString() @MaxLength(40) productId?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(40) cursor?: string;
}
