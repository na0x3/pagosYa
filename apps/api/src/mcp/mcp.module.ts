import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { McpApiKeyGuard } from './mcp-api-key.guard';
import { McpKeysController } from './mcp-keys.controller';
import { McpController, McpToolsService } from './mcp.controller';
import { PaymentLinksModule } from '../payment-links/payment-links.module';
import { StoresModule } from '../stores/stores.module';
import { StorefrontSourceModule } from '../storefront-source/storefront-source.module';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';

/** pagosYa MCP server (spec 2026-09-26 templates/settings/MCP, part 3). */
@Module({
  imports: [AuthModule, DashboardModule, StoresModule, PaymentLinksModule, StorefrontSourceModule],
  controllers: [McpKeysController, McpController],
  providers: [McpApiKeyGuard, McpToolsService, MerchantThrottlerGuard],
})
export class McpModule {}
