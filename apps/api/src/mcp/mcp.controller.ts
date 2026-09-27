import { Controller, Delete, Get, Injectable, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { PaymentLinksService } from '../payment-links/payment-links.service';
import { StoresService } from '../stores/stores.service';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { SourceProjectsService } from '../storefront-source/source-projects.service';
import { SourceTemplatesService } from '../storefront-source/source-templates.service';
import { McpApiKeyGuard } from './mcp-api-key.guard';
import { screenshotSnapshot } from './mcp-screenshot';
import { buildMcpServer, type McpDeps } from './mcp-tools';

/** The services the MCP tools call; replaceable in tests. */
@Injectable()
export class McpToolsService {
  readonly deps: McpDeps;
  constructor(stores: StoresService, products: PaymentLinksService, projects: SourceProjectsService, templates: SourceTemplatesService) {
    this.deps = { stores, products, projects, templates, screenshot: screenshotSnapshot } as McpDeps;
  }
}

const notAllowed = (res: Response) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });

/** Stateless Streamable HTTP MCP endpoint (spec 2026-09-26 §3.1): one server per request, scoped to the key's merchant. */
@ApiTags('mcp')
@ApiBearerAuth()
@Controller('v1/mcp')
export class McpController {
  constructor(private readonly tools: McpToolsService) {}

  @Post(['', 'k/:key'])
  @UseGuards(McpApiKeyGuard, MerchantThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(@Req() req: Request & { merchant: { id: string } }, @Res() res: Response) {
    const server = buildMcpServer(this.tools.deps, req.merchant.id);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get(['', 'k/:key'])
  get(@Res() res: Response) { notAllowed(res); }

  @Delete(['', 'k/:key'])
  remove(@Res() res: Response) { notAllowed(res); }
}
