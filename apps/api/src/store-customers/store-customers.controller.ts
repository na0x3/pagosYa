import { Body, Controller, Delete, Get, Header, Headers, Param, Patch, Post, Put, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StoreCustomersService } from './store-customers.service';
import { CustomerTokenDto, DeleteCustomerDto, ForgotPasswordDto, LoginCustomerDto, RegisterCustomerDto, ReplaceAddressesDto, ResetPasswordDto, UpdateCustomerProfileDto } from './store-customers.dto';

/** The session token travels as `Authorization: Bearer <token>` (the storefront keeps it in its own storage, no cookies). */
function bearer(header: string | undefined): string {
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header ?? '');
  if (!match) throw new UnauthorizedException('Inicia sesión para continuar');
  return match[1];
}

/** A shopper's account inside one store (spec 2026-09-30-store-customer-accounts-design). Public routes: nothing here needs
 * a merchant login, and every answer is either a token or personal, so none may be cached. */
@Controller('v1/stores/public/:slug/customers')
export class StoreCustomersController {
  constructor(private readonly customers: StoreCustomersService) {}

  @Post('register') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  register(@Param('slug') slug: string, @Body() dto: RegisterCustomerDto) { return this.customers.register(slug, dto); }

  @Post('verify-email') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  verifyEmail(@Param('slug') slug: string, @Body() dto: CustomerTokenDto) { return this.customers.verifyEmail(slug, dto.token); }

  @Post('login') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Param('slug') slug: string, @Body() dto: LoginCustomerDto) { return this.customers.login(slug, dto.email, dto.password); }

  @Post('logout') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  logout(@Param('slug') slug: string, @Headers('authorization') authorization?: string) { return this.customers.logout(slug, bearer(authorization)); }

  @Post('forgot-password') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  forgotPassword(@Param('slug') slug: string, @Body() dto: ForgotPasswordDto) { return this.customers.forgotPassword(slug, dto.email); }

  @Post('reset-password') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  resetPassword(@Param('slug') slug: string, @Body() dto: ResetPasswordDto) { return this.customers.resetPassword(slug, dto.token, dto.password); }

  @Get('me') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 60, ttl: 60_000 } })
  me(@Param('slug') slug: string, @Headers('authorization') authorization?: string) { return this.customers.authenticate(slug, bearer(authorization)); }

  @Patch('me') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async updateMe(@Param('slug') slug: string, @Body() dto: UpdateCustomerProfileDto, @Headers('authorization') authorization?: string) {
    return this.customers.updateProfile(await this.customers.authenticate(slug, bearer(authorization)), dto);
  }

  @Put('me/addresses') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async replaceAddresses(@Param('slug') slug: string, @Body() dto: ReplaceAddressesDto, @Headers('authorization') authorization?: string) {
    return this.customers.replaceAddresses(await this.customers.authenticate(slug, bearer(authorization)), dto.addresses);
  }

  @Get('me/orders') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async orders(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.customers.orders(await this.customers.authenticate(slug, bearer(authorization)));
  }

  @Get('me/subscriptions') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async subscriptions(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.customers.subscriptions(await this.customers.authenticate(slug, bearer(authorization)));
  }

  @Get('me/export') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async exportMe(@Param('slug') slug: string, @Headers('authorization') authorization?: string) {
    return this.customers.exportData(await this.customers.authenticate(slug, bearer(authorization)));
  }

  @Delete('me') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async deleteMe(@Param('slug') slug: string, @Body() dto: DeleteCustomerDto, @Headers('authorization') authorization?: string) {
    return this.customers.deleteAccount(await this.customers.authenticate(slug, bearer(authorization)), dto.password);
  }
}
