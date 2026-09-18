import { Body, Controller, Get, Patch, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, ValidateIf, Min, Max } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

class ShippingRateStatusDto { @IsBoolean() active!: boolean; }
class ShippingSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() pickupEnabled!: boolean;
  @IsOptional() @IsBoolean() carriersEnabled?: boolean;
  @IsOptional()
  @IsInt({ message: 'El tiempo de preparación debe estar entre 0 y 1440 minutos.' })
  @Min(0, { message: 'El tiempo de preparación debe estar entre 0 y 1440 minutos.' })
  @Max(1440, { message: 'El tiempo de preparación debe estar entre 0 y 1440 minutos.' })
  prepMinutes?: number;
}
const DIMENSION_MESSAGE = 'Las medidas deben ser números enteros entre 1 y 500 cm.';
class ShippingWeightDto {
  @ValidateIf((_object, value) => value !== null) @IsInt() @Min(0) @Max(100000000) weightGrams!: number | null;
  // Omitted = unchanged; null = clear.
  @IsOptional() @IsInt({ message: DIMENSION_MESSAGE }) @Min(1, { message: DIMENSION_MESSAGE }) @Max(500, { message: DIMENSION_MESSAGE }) lengthCm?: number | null;
  @IsOptional() @IsInt({ message: DIMENSION_MESSAGE }) @Min(1, { message: DIMENSION_MESSAGE }) @Max(500, { message: DIMENSION_MESSAGE }) widthCm?: number | null;
  @IsOptional() @IsInt({ message: DIMENSION_MESSAGE }) @Min(1, { message: DIMENSION_MESSAGE }) @Max(500, { message: DIMENSION_MESSAGE }) heightCm?: number | null;
  @IsOptional() @IsBoolean({ message: 'Indica si el producto es frágil.' }) fragile?: boolean;
  @IsOptional() @IsBoolean({ message: 'Indica si el producto se puede apilar.' }) noStack?: boolean;
}
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/shipping')
export class ShippingController {
  constructor(private readonly prisma: PrismaService) {}
  private async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { shippingEnabled: true, shippingPickupEnabled: true, shippingCarriersEnabled: true, shippingPrepMinutes: true } });
    if (!store) throw new NotFoundException('Store not found'); return store;
  }
  @Get()
  async get(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    const store = await this.owner(merchant.id, storeId);
    const [rates, products, carriers] = await Promise.all([
      this.prisma.deliveryZone.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true, shippingWeightGrams: true, lengthCm: true, widthCm: true, heightCm: true, fragile: true, noStack: true } }),
      this.prisma.shippingCarrier.findMany({ where: { isActive: true, mode: 'MANUAL' }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, mode: true } }),
    ]);
    return { enabled: store.shippingEnabled, pickupEnabled: store.shippingPickupEnabled, carriersEnabled: store.shippingCarriersEnabled, prepMinutes: store.shippingPrepMinutes, rates, products, carriers };
  }
  @Patch('products/:productId')
  async weight(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('productId') productId: string, @Body() dto: ShippingWeightDto) {
    await this.owner(merchant.id, storeId);
    const profile: Pick<ShippingWeightDto, 'lengthCm' | 'widthCm' | 'heightCm' | 'fragile' | 'noStack'> = {};
    for (const key of ['lengthCm', 'widthCm', 'heightCm'] as const) if (dto[key] !== undefined) profile[key] = dto[key] ?? null;
    // null is treated as omitted: these columns are non-nullable booleans.
    for (const key of ['fragile', 'noStack'] as const) if (dto[key] != null) profile[key] = dto[key];
    if (!(await this.prisma.paymentLink.updateMany({ where: { id: productId, storeId }, data: { shippingWeightGrams: dto.weightGrams ?? null, ...profile } })).count) throw new NotFoundException('Producto no encontrado');
    return { weightGrams: dto.weightGrams ?? null, ...profile };
  }
  @Patch('rates/:rateId')
  async toggle(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('rateId') rateId: string, @Body() dto: ShippingRateStatusDto) {
    await this.owner(merchant.id, storeId);
    const result = await this.prisma.deliveryZone.updateMany({ where: { id: rateId, storeId, merchantId: merchant.id }, data: { isActive: dto.active } });
    if (!result.count) throw new NotFoundException('Tarifa no encontrada');
    return { active: dto.active };
  }
  @Post()
  async save(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() dto: ShippingSettingsDto) {
    await this.owner(merchant.id, storeId);
    await this.prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: dto.enabled, shippingPickupEnabled: dto.pickupEnabled, ...(dto.carriersEnabled !== undefined ? { shippingCarriersEnabled: dto.carriersEnabled } : {}), ...(dto.prepMinutes !== undefined ? { shippingPrepMinutes: dto.prepMinutes } : {}) } });
    return this.get(merchant, storeId);
  }
}
