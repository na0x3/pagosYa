import { Body, Controller, Get, Patch, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, ValidateIf, Min, Max } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

class ShippingRateStatusDto { @IsBoolean() active!: boolean; }
class ShippingSettingsDto { @IsBoolean() enabled!: boolean; @IsBoolean() pickupEnabled!: boolean; }
class ShippingWeightDto { @ValidateIf((_object, value) => value !== null) @IsInt() @Min(0) @Max(100000000) weightGrams!: number | null; }
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/shipping')
export class ShippingController {
  constructor(private readonly prisma: PrismaService) {}
  private async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { shippingEnabled: true, shippingPickupEnabled: true } });
    if (!store) throw new NotFoundException('Store not found'); return store;
  }
  @Get()
  async get(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    const store = await this.owner(merchant.id, storeId);
    const [rates, products] = await Promise.all([
      this.prisma.deliveryZone.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true, shippingWeightGrams: true } }),
    ]);
    return { enabled: store.shippingEnabled, pickupEnabled: store.shippingPickupEnabled, rates, products };
  }
  @Patch('products/:productId')
  async weight(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('productId') productId: string, @Body() dto: ShippingWeightDto) {
    await this.owner(merchant.id, storeId);
    if (!(await this.prisma.paymentLink.updateMany({ where: { id: productId, storeId }, data: { shippingWeightGrams: dto.weightGrams ?? null } })).count) throw new NotFoundException('Producto no encontrado');
    return { weightGrams: dto.weightGrams ?? null };
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
    await this.prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: dto.enabled, shippingPickupEnabled: dto.pickupEnabled } });
    return this.get(merchant, storeId);
  }
}
