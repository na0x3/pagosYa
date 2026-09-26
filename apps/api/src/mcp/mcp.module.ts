import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { McpApiKeyGuard } from './mcp-api-key.guard';
import { McpKeysController } from './mcp-keys.controller';

/** pagosYa MCP server (spec 2026-09-26 templates/settings/MCP, part 3). */
@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [McpKeysController],
  providers: [McpApiKeyGuard],
})
export class McpModule {}
