/** pagosYa MCP server (spec 2026-09-26 templates/settings/MCP, part 3): a merchant's own AI builds their store with
 * these tools. Build, not publish: nothing here publishes, touches money, keys, domains or spends YAPI credits. */
import { ConflictException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { z } from 'zod';
import { CreatePaymentLinkDto } from '../payment-links/dto/create-payment-link.dto';
import { UpdatePaymentLinkDto } from '../payment-links/dto/update-payment-link.dto';
import type { SourceProjectSnapshot } from '../storefront-source/source-project';

export const MCP_TOOL_NAMES = ['list_stores', 'get_store', 'list_products', 'create_product', 'update_product', 'list_templates', 'apply_template', 'get_design_files', 'write_design_files', 'screenshot_store'] as const;

export interface McpDeps {
  stores: { listForMerchant(merchantId: string): Promise<Array<{ id: string; name: string; slug: string; sourceProject?: { revision: number } | null; publishedSourceRevision?: number | null }>> };
  products: {
    listForStore(merchantId: string, storeId: string): Promise<unknown>;
    create(merchantId: string, storeId: string, dto: CreatePaymentLinkDto): Promise<unknown>;
    update(merchantId: string, storeId: string, id: string, dto: UpdatePaymentLinkDto): Promise<unknown>;
  };
  projects: {
    current(merchantId: string, storeId: string): Promise<{ slug: string; revision: number }>;
    version(merchantId: string, storeId: string, revision: number): Promise<{ snapshot: unknown }>;
    editFiles(merchantId: string, storeId: string, input: { revision: number; files: Array<{ path: string; content: string }> }): Promise<{ revision: number; label: string }>;
  };
  templates: {
    list(): Array<{ id: string; name: string; category: string; description: string }>;
    apply(merchantId: string, storeId: string, templateId: string, revision: number): Promise<{ revision: number; label: string }>;
  };
  screenshot(snapshot: SourceProjectSnapshot, width: 1280 | 390, page: string): Promise<Buffer>;
}

const logger = new Logger('McpTools');
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const failure = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] });

/** Merchant-facing messages only; never stack traces or provider diagnostics. */
function mcpError(error: unknown, notFound = 'No encontré esa tienda.') {
  if (error instanceof NotFoundException) return failure(notFound);
  if (error instanceof ConflictException) return failure('La tienda cambió. Vuelve a leer los archivos con get_design_files.');
  if (error instanceof HttpException) {
    const body = error.getResponse() as { message?: unknown };
    const message = Array.isArray(body?.message) ? body.message.join(' ') : typeof body?.message === 'string' ? body.message : error.message;
    return failure(message);
  }
  logger.warn(`MCP tool failed: ${error instanceof Error ? error.message : String(error)}`);
  return failure('No pude completar esa acción.');
}

async function validated<T extends object>(type: new () => T, input: unknown): Promise<T> {
  const dto = plainToInstance(type, input ?? {});
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw new HttpException({ message: errors.flatMap(error => Object.values(error.constraints || {})).join(' ') || 'Datos del producto no válidos.' }, 400);
  return dto;
}

const SOURCE_FORMAT = 'A pagosYa store is React source: components/*.tsx (home, product, checkout, shared components) and styles/globals.css, using @pagosya/ui. The platform owns prices, cart, checkout and stock hooks; keep the commerce components and data-* hooks you find. Read the real structure with get_design_files first.';

export function buildMcpServer(deps: McpDeps, merchantId: string): McpServer {
  const server = new McpServer({ name: 'pagosya', version: '1.0.0' });
  const storeId = z.string().min(1).describe('A store id from list_stores.');
  const run = (notFound?: string) => <A>(handler: (args: A) => Promise<{ content: unknown[] }>) => async (args: A) => {
    try { return await handler(args) as any; } catch (error) { return mcpError(error, notFound) as any; }
  };

  server.registerTool('list_stores', { description: 'List this merchant\'s pagosYa stores with their current design revision and whether a design is published.' },
    run()(async () => json((await deps.stores.listForMerchant(merchantId)).map(store => ({
      id: store.id, name: store.name, slug: store.slug, revision: store.sourceProject?.revision ?? 0, published: Boolean(store.publishedSourceRevision),
    })))));

  server.registerTool('get_store', { description: 'One store: current design revision, the Plantilla it came from, product count and publication state.', inputSchema: { storeId } },
    run()(async ({ storeId: id }: { storeId: string }) => {
      const current = await deps.projects.current(merchantId, id);
      const store = (await deps.stores.listForMerchant(merchantId)).find(entry => entry.id === id);
      const brief = current.revision ? ((await deps.projects.version(merchantId, id, current.revision)).snapshot as SourceProjectSnapshot).brief : undefined;
      const products = await deps.products.listForStore(merchantId, id);
      return json({ id, name: store?.name, slug: current.slug, revision: current.revision, templateId: brief?.templateId ?? null,
        sitePurpose: brief?.sitePurpose ?? null, productCount: Array.isArray(products) ? products.length : undefined, published: Boolean(store?.publishedSourceRevision) });
    }));

  server.registerTool('list_products', { description: 'Products of a store: name, price in minor units (amount, centavos), stock, options and photos.', inputSchema: { storeId } },
    run()(async ({ storeId: id }: { storeId: string }) => json(await deps.products.listForStore(merchantId, id))));

  const productShape = z.record(z.string(), z.unknown()).describe('Product fields as in the pagosYa dashboard: name (required on create), amount (integer, minor units: 5000 = Bs 50.00), currency (default BOB), description, imageUrls, tags, stock, variants, extras, categoryId, discountPercent.');
  server.registerTool('create_product', { description: 'Create a product in a store. Validated like the dashboard form.', inputSchema: { storeId, product: productShape } },
    run()(async ({ storeId: id, product }: { storeId: string; product: unknown }) => json(await deps.products.create(merchantId, id, await validated(CreatePaymentLinkDto, product)))));

  server.registerTool('update_product', { description: 'Update some fields of an existing product (ids from list_products).', inputSchema: { storeId, productId: z.string().min(1), product: productShape } },
    run('No encontré ese producto.')(async ({ storeId: id, productId, product }: { storeId: string; productId: string; product: unknown }) =>
      json(await deps.products.update(merchantId, id, productId, await validated(UpdatePaymentLinkDto, product)))));

  server.registerTool('list_templates', { description: 'The Plantillas: complete designer-made stores a store can start from (id, name, category, description).' },
    run()(async () => json(deps.templates.list().map(({ id, name, category, description }) => ({ id, name, category, description })))));

  server.registerTool('apply_template', { description: `Replace the store's design with a Plantilla filled with its products, as a new revision (earlier revisions stay in the history). ${SOURCE_FORMAT}`,
    inputSchema: { storeId, templateId: z.string().min(1), revision: z.number().int().min(0).describe('The store\'s current revision (from get_store).') } },
    run()(async ({ storeId: id, templateId, revision }: { storeId: string; templateId: string; revision: number }) => json(await deps.templates.apply(merchantId, id, templateId, revision))));

  server.registerTool('get_design_files', { description: `The current design's text files (path + content); images and other binary files are listed by path. ${SOURCE_FORMAT}`, inputSchema: { storeId } },
    run()(async ({ storeId: id }: { storeId: string }) => {
      const current = await deps.projects.current(merchantId, id);
      if (!current.revision) return json({ revision: 0, files: [], binaryPaths: [], note: 'This store has no design yet: apply a Plantilla with apply_template first.' });
      const snapshot = (await deps.projects.version(merchantId, id, current.revision)).snapshot as SourceProjectSnapshot;
      return json({ revision: current.revision,
        files: snapshot.files.filter(file => file.encoding !== 'base64').map(({ path, content }) => ({ path, content })),
        binaryPaths: snapshot.files.filter(file => file.encoding === 'base64').map(file => file.path) });
    }));

  server.registerTool('write_design_files', { description: `Save changed text files (1-20) as one new design revision. It goes through the same validation, compile and commerce checks as the pagosYa code editor; errors come back as messages. Only existing text files can be changed. ${SOURCE_FORMAT}`,
    inputSchema: { storeId, revision: z.number().int().min(1).describe('The revision the files were read from.'), files: z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1).max(20) } },
    run()(async ({ storeId: id, revision, files }: { storeId: string; revision: number; files: Array<{ path: string; content: string }> }) => json(await deps.projects.editFiles(merchantId, id, { revision, files }))));

  server.registerTool('screenshot_store', { description: 'A PNG of the current design rendered in pagosYa\'s sandbox, top of the page, at laptop (1280) or phone (390) width.',
    inputSchema: { storeId, width: z.union([z.literal(1280), z.literal(390)]).default(1280), page: z.string().default('index.html').describe('An HTML page of the design, e.g. index.html.') } },
    run()(async ({ storeId: id, width, page }: { storeId: string; width: 1280 | 390; page: string }) => {
      const current = await deps.projects.current(merchantId, id);
      if (!current.revision) return failure('Esta tienda todavía no tiene diseño.');
      const snapshot = (await deps.projects.version(merchantId, id, current.revision)).snapshot as SourceProjectSnapshot;
      const png = await deps.screenshot(snapshot, width, page);
      return { content: [{ type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' }] };
    }));

  return server;
}
