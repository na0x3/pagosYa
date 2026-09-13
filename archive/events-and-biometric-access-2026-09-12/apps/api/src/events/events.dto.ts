import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { AccessDeviceRole, AdmissionSource, BiometricConsentScope, EventPaymentMethod, EventStaffRole, EventStatus, TicketTypeKind } from "@prisma/client";

export class CreateVenueDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(240) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
}

export class CreateEventDto {
  @IsString() @IsNotEmpty() venueId!: string;
  @IsString() @IsNotEmpty() @MaxLength(140) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsDateString() doorsOpenAt!: string;
  @IsOptional() @IsDateString() lastEntryAt?: string;
  @IsInt() @Min(1) capacity!: number;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsEnum(EventStatus) status?: EventStatus;
  @IsOptional() @IsBoolean() allowReentry?: boolean;
  @IsOptional() @IsBoolean() biometricRequired?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(8760) retentionHours?: number;
  @IsOptional() @IsBoolean() salesAtDoorEnabled?: boolean;
  @IsOptional() @IsBoolean() onlineSalesEnabled?: boolean;
  @IsOptional() @IsBoolean() manualOverrideAllowed?: boolean;
}

export class CreateTicketTypeDto {
  @IsEnum(TicketTypeKind) kind!: TicketTypeKind;
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsInt() @Min(0) price!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsInt() @Min(1) inventory!: number;
  @IsOptional() @IsDateString() salesStart?: string;
  @IsOptional() @IsDateString() salesEnd?: string;
  @IsOptional() @IsBoolean() reentryAllowed?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) capacityContribution?: number;
}

export class AttachEventTicketsBlockDto {
  @IsString() @IsNotEmpty() storeId!: string;
}

export class ReservationItemDto {
  @IsString() @IsNotEmpty() ticketTypeId!: string;
  @IsInt() @Min(1) @Max(20) quantity!: number;
}

export class CreateReservationDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ReservationItemDto)
  items!: ReservationItemDto[];
  @IsOptional() @IsString() @MaxLength(120) buyerName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) buyerEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) buyerPhone?: string;
}

export class ManageReservationDto {
  @IsString() @IsNotEmpty() managementToken!: string;
}

export class CashSaleDto {
  @IsString() @IsNotEmpty() cashShiftId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ReservationItemDto)
  items!: ReservationItemDto[];
  @IsOptional() @IsEnum(EventPaymentMethod) paymentMethod?: EventPaymentMethod;
  @IsOptional() @IsString() @MaxLength(120) buyerName?: string;
  @IsOptional() @IsString() @MaxLength(40) buyerPhone?: string;
}

export class OpenCashShiftDto {
  @IsString() @IsNotEmpty() eventId!: string;
  @IsInt() @Min(0) openingFloat!: number;
}

export class CloseCashShiftDto {
  @IsInt() @Min(0) declaredCash!: number;
}

export class ClaimAdmissionDto {
  @IsString() @IsNotEmpty() token!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) displayName!: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}

export class CreateInvitationDto {
  @IsString() @IsNotEmpty() managementToken!: string;
  @IsOptional() @IsInt() @Min(1) @Max(168) expiresInHours?: number;
}

export class CreateEnrollmentSessionDto {
  @IsOptional() @IsString() deviceId?: string;
}

export class CompleteEnrollmentDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() deviceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) displayName!: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsBoolean() consent!: boolean;
  @IsString() @IsNotEmpty() @MaxLength(40) consentVersion!: string;
  @IsOptional() @IsDateString() consentExpiresAt?: string;
}

export class ActivateFaceEntryDto {
  @IsOptional() @IsString() @MaxLength(200) managementToken?: string;
}

export class ConsumerEnrollmentSessionDto extends ActivateFaceEntryDto {
  @IsOptional() @IsString() deviceId?: string;
  @IsEnum(BiometricConsentScope) scope!: BiometricConsentScope;
}

export class CreateDeviceDto {
  @IsString() @IsNotEmpty() venueId!: string;
  @IsOptional() @IsString() eventId?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(60) vendor?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) ipAddress?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsInt() @Min(1) faceCapacity?: number;
  @IsOptional() @IsString() @MaxLength(120) algorithmVersion?: string;
  @IsOptional() @IsObject() providerCapabilities?: Record<string, unknown>;
  @IsEnum(AccessDeviceRole) role!: AccessDeviceRole;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
  @IsOptional() @IsString() encryptedSecrets?: string;
}

export class NormalizedDeviceEventDto {
  @IsString() @IsNotEmpty() externalEventId!: string;
  @IsString() @IsNotEmpty() deviceId!: string;
  @IsDateString() occurredAt!: string;
  @IsString() @IsNotEmpty() eventType!: string;
  @IsOptional() @IsString() direction?: "ENTRY" | "EXIT";
  @IsOptional() @IsString() externalPersonId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) matchConfidence?: number;
  @IsOptional() @IsBoolean() livenessPassed?: boolean;
  @IsOptional() @IsString() @MaxLength(240) rawVendorEventReference?: string;
}

export class SimulatorActionDto {
  @IsString() @IsNotEmpty() deviceId!: string;
  @IsString() @IsNotEmpty() action!: string;
  @IsOptional() @IsString() externalPersonId?: string;
  @IsOptional() @IsString() attendeeId?: string;
  @IsOptional() @IsString() duplicateExternalEventId?: string;
}

export class ManualAccessDto {
  @IsString() @IsNotEmpty() admissionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(240) reason!: string;
}

export class DeleteBiometricDto {
  @IsString() @IsNotEmpty() @MaxLength(240) reason!: string;
  @IsOptional() @IsString() eventId?: string;
}

export class DeleteFaceEntryDto {
  @IsString() @IsNotEmpty() @MaxLength(240) reason!: string;
}

export class AddStaffDto {
  @IsString() @IsNotEmpty() merchantUserId!: string;
  @IsEnum(EventStaffRole) role!: EventStaffRole;
  @IsOptional() @IsObject() permissions?: Record<string, boolean>;
}
