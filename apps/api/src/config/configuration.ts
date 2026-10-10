import * as path from "path";
import type { DomainCommerceConfig } from '../domains/domain-commerce.config';

export interface BanecoQrConfig {
  enabled: boolean;
  baseUrl: string;
  username: string;
  password: string;
  aesKey: string;
  creditAccount: string;
  webhookSecret: string;
}

export interface DlocalConfig {
  enabled: boolean;
  baseUrl: string;
  login: string;
  transKey: string;
  secretKey: string;
  smartFieldsKey: string;
  notificationUrl: string;
  returnUrl: string;
  bobPerUsd: number;
  intlFeeBps: number;
  costBps: number;
  timeoutMs: number;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseDlocalConfig(env: NodeJS.ProcessEnv): DlocalConfig {
  return {
    enabled: env.DLOCAL_ENABLED === "true",
    baseUrl: env.DLOCAL_BASE_URL ?? "https://sandbox.dlocal.com",
    login: env.DLOCAL_LOGIN ?? "",
    transKey: env.DLOCAL_TRANS_KEY ?? "",
    secretKey: env.DLOCAL_SECRET_KEY ?? "",
    smartFieldsKey: env.DLOCAL_SMART_FIELDS_KEY ?? "",
    notificationUrl: env.DLOCAL_NOTIFICATION_URL ?? "http://localhost:3000/v1/webhooks/dlocal/payments",
    returnUrl: env.DLOCAL_RETURN_URL ?? "http://localhost:5173/",
    bobPerUsd: positiveNumber(env.INTL_BOB_PER_USD, 0),
    intlFeeBps: positiveNumber(env.INTL_FEE_BPS, 590),
    costBps: nonNegativeNumber(env.DLOCAL_COST_BPS, 0),
    timeoutMs: positiveNumber(env.DLOCAL_TIMEOUT_MS, 15000),
  };
}

export interface EmailConfig {
  resendApiKey: string;
  fromAddress: string;
  webOrigin: string;
  inboundSigningSecret: string;
}

export interface SiatConfig {
  enabled: boolean;
  baseUrl: string;
  delegatedToken: string;
  systemCode: string;
  environmentCode: number;
  modalityCode: number;
}

export interface AppConfig {
  domainCommerce: DomainCommerceConfig;
  sourceFramework: 'next' | 'static';
  /** YAPI engine: the tool-using agent (docs/superpowers/specs/2026-09-26-yapi-agent-design.md) or the single JSON call. */
  yapiEngine: 'agent' | 'single';
  /** Sketch-first new stores: one structured call + deterministic assembly. Default on; YAPI_SKETCH_FIRST=off disables. */
  yapiSketchFirst: boolean;
  /** Signature look: planner concepts carry a business-derived signature and the builder self-checks against vibecoded
   *  tells (spec 2026-10-09). Default on; YAPI_SIGNATURE=off returns to the previous prompts and schema. */
  yapiSignature: boolean;
  sourceDesignJobsEnabled: boolean;
  environment: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  internalRailCallbackSecret: string;
  internalOpsSecret: string;
  checkoutOrigin: string;
  /** The API's public https origin; email images are only ever absolute https URLs. */
  publicAssetBaseUrl: string | null;
  /** Local development only: where store-email test sends go instead of the signed-in account. Always null in production. */
  emailTestTo: string | null;
  consumerDashboardOrigin: string;
  merchantDashboardOrigin: string;
  orderTrackingSecret: string;
  /** Signs public cobro / proposal / contract links (business-documents/document-link-token.ts). */
  documentLinkSecret: string;
  /** Per-store cap on cobro / proposal / contract emails in any 24 hours (DOCUMENT_EMAILS_PER_DAY). */
  documentEmailsPerDay: number;
  /**
   * Keys the storefront analytics session hash (store-analytics.service.ts). Its own secret, so raw analytics rows can
   * never be joined to StoreFunnelVisit (plain sha256 of the same session id) or, through it, to orders.
   */
  analyticsSessionSecret: string;
  /** Per-store ceiling on storefront analytics events stored per Bolivia day (STORE_ANALYTICS_DAILY_CAP). */
  storeAnalyticsDailyCap: number;
  operationsEncryptionKey: string;
  extensionsEncryptionKey: string;
  corsOrigins: string[];
  exposeDocs: boolean;
  trustProxy: false | number | string;
  customDomains: {
    target: string;
  };
  banecoQr: BanecoQrConfig;
  dlocal: DlocalConfig;
  uploadsDir: string;
  objectStorage: {
    privateBucket?: string;
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
  /** Local-only authenticated bridge; never carries the user's OAuth tokens. */
  chatgptPlan?: { url: string; secret: string };
  /**
   * Let the Sep-5 generator author the brand, copy and section order, and have
   * the design engine render what it decided. Off unless explicitly enabled:
   * it runs a second generation before the render, so it costs more and is
   * slower than either engine alone. See docs/SEP5_AUTHORED_PLAN.md.
   */
  sep5Author: boolean;
  /**
   * After the authored store passes its checks, render it, show the model its own screenshots and keep the
   * corrected project. On with sep5Author unless YAPI_SEP5_SELF_REVIEW=0: a
   * second whole-project call, so roughly double the time and tokens of an authored run.
   */
  sep5SelfReview: boolean;
  /** Claude models for YAPI's agent (they run only on the tool-using engine). */
  anthropic: { apiKey: string };
  openAi: {
    apiKey: string;
    designModel: string;
    conversationModel: string;
    inventoryModel: string;
    imageModel: string;
    imagePriceSquare?: number;
    imagePricePortrait?: number;
    imagePriceLandscape?: number;
    enabled: boolean;
  };
  google: {
    clientId: string;
    clientSecret: string;
    calendarRedirectUri: string;
  };
  email: EmailConfig;
  siat: SiatConfig;
}

function parseTrustProxy(value: string | undefined): false | number | string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "false" || normalized === "0") return false;
  if (/^[1-9]\d?$/.test(normalized)) return Number(normalized);
  if (["loopback", "linklocal", "uniquelocal"].includes(normalized)) return normalized;
  throw new Error("TRUST_PROXY must be false, a hop count from 1-99, loopback, linklocal, or uniquelocal");
}

function parseBoundedInteger(name: string, value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function databaseUrlWithPoolSettings(value: string): string {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(parseBoundedInteger("DATABASE_POOL_SIZE", process.env.DATABASE_POOL_SIZE, 10, 1, 100)));
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", String(parseBoundedInteger("DATABASE_POOL_TIMEOUT_SECONDS", process.env.DATABASE_POOL_TIMEOUT_SECONDS, 10, 1, 60)));
    }
    return url.toString();
  } catch {
    return value;
  }
}

/**
 * dLocal fixture mode (DLOCAL_ENABLED=false) fakes payments, so international
 * charges may only be offered outside production unless the real client is on.
 */
export function dlocalChargesAllowed(dlocal: Pick<DlocalConfig, "enabled">, environment: string | undefined): boolean {
  return dlocal.enabled || environment !== "production";
}

/** The analytics session key outside production (the production check refuses it: "dev-" / "change-me"). */
export const DEVELOPMENT_ANALYTICS_SESSION_SECRET = "development-only-analytics-session-secret-change-me";

/** Where store-email test sends go in local development (EMAIL_TEST_TO). Never in production: there a test goes to the signed-in account. */
export function emailTestRecipient(environment: string, value: string | undefined): string | null {
  return environment === "production" ? null : value?.trim() || null;
}

export function assertProductionSecurityConfig(app: AppConfig): void {
  if (app.environment !== "production") return;
  const failures: string[] = [];
  const requireSecret = (name: string, value: string) => {
    if (value.length < 32 || /change-me|example|dev-/i.test(value)) failures.push(`${name} must be a non-demo secret of at least 32 characters`);
  };
  const requireHttps = (name: string, value: string) => {
    try {
      if (new URL(value).protocol !== "https:") failures.push(`${name} must use HTTPS in production`);
    } catch {
      failures.push(`${name} must be a valid HTTPS origin`);
    }
  };

  try {
    const database = new URL(app.databaseUrl);
    if (!["postgres:", "postgresql:"].includes(database.protocol)) failures.push("DATABASE_URL must be a PostgreSQL URL");
  } catch {
    failures.push("DATABASE_URL must be a valid PostgreSQL URL");
  }
  try {
    const redis = new URL(app.redisUrl);
    if (!["redis:", "rediss:"].includes(redis.protocol)) failures.push("REDIS_URL must use redis:// or rediss://");
  } catch {
    failures.push("REDIS_URL is required for shared production rate limiting");
  }
  if (!app.objectStorage.bucket || !app.objectStorage.accessKeyId || !app.objectStorage.secretAccessKey) {
    failures.push("durable object storage credentials are required for multi-instance production uploads");
  }
  requireSecret("INTERNAL_RAIL_CALLBACK_SECRET", app.internalRailCallbackSecret);
  requireSecret("INTERNAL_OPS_SECRET", app.internalOpsSecret);
  requireSecret("ORDER_TRACKING_SECRET", app.orderTrackingSecret);
  requireSecret("DOCUMENT_LINK_SECRET", app.documentLinkSecret);
  requireSecret("ANALYTICS_SESSION_SECRET", app.analyticsSessionSecret);
  requireSecret("OPERATIONS_ENCRYPTION_KEY", app.operationsEncryptionKey);
  requireSecret("EXTENSIONS_ENCRYPTION_KEY", app.extensionsEncryptionKey);
  requireHttps("CHECKOUT_ORIGIN", app.checkoutOrigin);
  if (app.publicAssetBaseUrl) requireHttps("PUBLIC_ASSET_BASE_URL", app.publicAssetBaseUrl);
  requireHttps("CONSUMER_DASHBOARD_ORIGIN", app.consumerDashboardOrigin);
  requireHttps("MERCHANT_DASHBOARD_ORIGIN", app.merchantDashboardOrigin);
  requireHttps("PAGOSYA_WEB_ORIGIN", app.email.webOrigin);
  app.corsOrigins.forEach((origin) => requireHttps("CORS origin", origin));

  if (app.banecoQr.enabled) {
    if (!app.banecoQr.username || !app.banecoQr.password || !app.banecoQr.aesKey || !app.banecoQr.creditAccount) {
      failures.push("all Baneco credentials are required when BANECO_QR_ENABLED=true");
    }
    requireSecret("BANECO_WEBHOOK_SECRET", app.banecoQr.webhookSecret);
  }
  if (app.dlocal.enabled) {
    if (!app.dlocal.login || !app.dlocal.transKey || !app.dlocal.secretKey) {
      failures.push("DLOCAL_LOGIN, DLOCAL_TRANS_KEY and DLOCAL_SECRET_KEY are required when DLOCAL_ENABLED=true");
    }
    requireHttps("DLOCAL_NOTIFICATION_URL", app.dlocal.notificationUrl);
    requireHttps("DLOCAL_RETURN_URL", app.dlocal.returnUrl);
  }
  if (app.dlocal.bobPerUsd > 0 && !app.dlocal.enabled) {
    failures.push("INTL_BOB_PER_USD must stay unset while DLOCAL_ENABLED is not true (fixture mode fakes international payments)");
  }
  if (failures.length) throw new Error(`Refusing insecure production startup:\n- ${failures.join("\n- ")}`);
}

function apiRootFromCwd(): string {
  // Nest is started from both the repository root and apps/api in local tools.
  // Anchor the default once so the same bytes are served in either case.
  return path.basename(process.cwd()) === "api" ? process.cwd() : path.join(process.cwd(), "apps", "api");
}

function parseSiatEnvCode(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? `${fallback}`, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function withLocalhostAliases(origins: string[]): string[] {
  const expanded = new Set<string>();
  origins.forEach((origin) => {
    expanded.add(origin);
    try {
      const url = new URL(origin);
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return;
      url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
      expanded.add(url.origin);
    } catch {
      // Invalid configured origins are retained so startup behavior remains
      // backwards compatible; Nest simply will not match them to a request.
    }
  });
  return [...expanded];
}

export default (): { app: AppConfig } => {
  const environment = process.env.NODE_ENV ?? "development";
  const sep5Author = process.env.YAPI_SEP5_AUTHOR === '1';
  const sep5SelfReview = sep5Author && process.env.YAPI_SEP5_SELF_REVIEW !== '0';
  const chatgptPlan = process.env.YAPI_CHATGPT_PLAN_URL
    ? { url: process.env.YAPI_CHATGPT_PLAN_URL, secret: process.env.YAPI_CHATGPT_PLAN_SECRET ?? '' }
    : undefined;
  if (chatgptPlan) {
    const url = new URL(chatgptPlan.url);
    if (environment !== 'development' || url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
      || url.pathname !== '/v1/responses' || url.username || url.password || url.search || url.hash || !chatgptPlan.secret) {
      throw new Error('ChatGPT plan mode requires the local development launcher: pnpm dev:chatgpt');
    }
  }
  const app: AppConfig = {
    environment,
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: databaseUrlWithPoolSettings(process.env.DATABASE_URL ?? ""),
    redisUrl: process.env.REDIS_URL ?? "",
    internalRailCallbackSecret: process.env.INTERNAL_RAIL_CALLBACK_SECRET ?? "",
    internalOpsSecret: process.env.INTERNAL_OPS_SECRET ?? "",
    checkoutOrigin: process.env.CHECKOUT_ORIGIN ?? "http://localhost:5174",
    publicAssetBaseUrl: process.env.PUBLIC_ASSET_BASE_URL?.trim().replace(/\/+$/, "") || null,
    emailTestTo: emailTestRecipient(environment, process.env.EMAIL_TEST_TO),
    consumerDashboardOrigin: process.env.CONSUMER_DASHBOARD_ORIGIN ?? "http://localhost:4324",
    merchantDashboardOrigin: process.env.MERCHANT_DASHBOARD_ORIGIN ?? "http://localhost:4322",
    orderTrackingSecret: process.env.ORDER_TRACKING_SECRET ?? "development-only-order-tracking-secret-change-me",
    documentLinkSecret: process.env.DOCUMENT_LINK_SECRET ?? "development-only-document-link-secret-change-me",
    analyticsSessionSecret: process.env.ANALYTICS_SESSION_SECRET ?? DEVELOPMENT_ANALYTICS_SESSION_SECRET,
    documentEmailsPerDay: parseBoundedInteger("DOCUMENT_EMAILS_PER_DAY", process.env.DOCUMENT_EMAILS_PER_DAY, 200, 1, 100_000),
    storeAnalyticsDailyCap: parseBoundedInteger("STORE_ANALYTICS_DAILY_CAP", process.env.STORE_ANALYTICS_DAILY_CAP, 50_000, 1, 10_000_000),
    operationsEncryptionKey: process.env.OPERATIONS_ENCRYPTION_KEY ?? "development-only-operations-key",
    extensionsEncryptionKey: process.env.EXTENSIONS_ENCRYPTION_KEY ?? "development-only-extensions-key",
    // Checkout iframe origin plus any browser-side internal tools (ops
    // console, merchant dashboard) — merchant *backends* never need CORS,
    // they call the API server-to-server.
    corsOrigins: withLocalhostAliases([
      process.env.CHECKOUT_ORIGIN ?? "http://localhost:5174",
      process.env.CONSUMER_DASHBOARD_ORIGIN ?? "http://localhost:4324",
      process.env.MERCHANT_DASHBOARD_ORIGIN ?? "http://localhost:4322",
      ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
    ]),
    exposeDocs: process.env.EXPOSE_API_DOCS ? process.env.EXPOSE_API_DOCS === "true" : environment !== "production",
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    domainCommerce: {
      enabled: process.env.DOMAIN_COMMERCE_ENABLED === 'true',
      sandbox: process.env.DOMAIN_REGISTRAR_SANDBOX !== 'false',
      username: process.env.NAMECOM_USERNAME ?? '',
      token: process.env.NAMECOM_API_TOKEN ?? '',
      platformMerchantId: process.env.DOMAIN_PLATFORM_MERCHANT_ID ?? '',
      bobPerUsd: Number(process.env.DOMAIN_BOB_PER_USD ?? 0),
      // Live quote used for bobPerUsd (DolarApi); bobPerUsd above is the fallback.
      fxSource: process.env.DOMAIN_FX_SOURCE === 'binance' ? 'binance' : 'oficial',
      markupPercent: Number(process.env.DOMAIN_MARKUP_PERCENT ?? 0),
      cloudflareToken: process.env.DOMAIN_CLOUDFLARE_API_TOKEN ?? '',
      cloudflareZoneId: process.env.DOMAIN_CLOUDFLARE_ZONE_ID ?? '',
      // No default on purpose. A purchased domain's apex and www records are
      // written to this host, so a deployment that forgets it must fail closed
      // in assertDomainCommerceReady rather than point real names at whatever
      // the platform's default happens to be. customDomains.target below keeps
      // its default: that path is already live and merchants aim their own DNS
      // at it by hand.
      target: process.env.CUSTOM_DOMAIN_CNAME_TARGET ?? '',
    },
    customDomains: {
      // All verified merchant hostnames route to the same storefront app. The
      // deployment edge must accept this target and provision TLS for the
      // merchant hostname (for example through Cloudflare for SaaS).
      target: process.env.CUSTOM_DOMAIN_CNAME_TARGET ?? "stores.pagosya.bo",
    },
    // Flipping BANECO_QR_ENABLED is the only thing that swaps the QR rail
    // between MockQrRailAdapter and BanecoQrAdapter (see RailsModule) — the
    // intent this integration is a first bank and will likely be replaced.
    banecoQr: {
      enabled: process.env.BANECO_QR_ENABLED === "true",
      baseUrl: process.env.BANECO_BASE_URL ?? "https://apimktdesa.baneco.com.bo/ApiGateway",
      username: process.env.BANECO_USERNAME ?? "",
      password: process.env.BANECO_PASSWORD ?? "",
      aesKey: process.env.BANECO_AES_KEY ?? "",
      creditAccount: process.env.BANECO_CREDIT_ACCOUNT ?? "",
      webhookSecret: process.env.BANECO_WEBHOOK_SECRET ?? "",
    },
    dlocal: parseDlocalConfig(process.env),
    // The local fallback resolves to the same directory regardless of process
    // cwd. Set object storage in production for multi-instance durability.
    uploadsDir: process.env.UPLOADS_DIR ?? path.join(apiRootFromCwd(), "uploads"),
    objectStorage: {
      privateBucket: process.env.PRIVATE_DOWNLOAD_BUCKET ?? "",
      bucket: process.env.OBJECT_STORAGE_BUCKET ?? "",
      region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "",
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== "false",
    },
    sourceFramework: process.env.SOURCE_FRAMEWORK === 'static' ? 'static' : 'next',
    yapiEngine: process.env.YAPI_ENGINE === 'agent' || process.env.YAPI_ENGINE === 'single' ? process.env.YAPI_ENGINE : 'agent',
    yapiSketchFirst: process.env.YAPI_SKETCH_FIRST !== 'off',
    yapiSignature: process.env.YAPI_SIGNATURE !== 'off',
    sourceDesignJobsEnabled: process.env.SOURCE_DESIGN_JOBS_ENABLED === 'true',
    chatgptPlan,
    sep5Author,
    sep5SelfReview,
    anthropic: { apiKey: chatgptPlan ? '' : process.env.ANTHROPIC_API_KEY ?? "" },
    openAi: {
      apiKey: chatgptPlan ? '' : process.env.OPENAI_API_KEY ?? "",
      conversationModel: process.env.OPENAI_CONVERSATION_MODEL ?? "gpt-5.6-luna",
      designModel: process.env.OPENAI_DESIGN_MODEL ?? "gpt-5.6-sol",
      inventoryModel: process.env.OPENAI_INVENTORY_MODEL ?? "gpt-5.6-sol",
      imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      imagePriceSquare: Number(process.env.OPENAI_IMAGE_PRICE_SQUARE) || undefined,
      imagePricePortrait: Number(process.env.OPENAI_IMAGE_PRICE_PORTRAIT) || undefined,
      imagePriceLandscape: Number(process.env.OPENAI_IMAGE_PRICE_LANDSCAPE) || undefined,
      enabled: process.env.OPENAI_VISUAL_STUDIO_ENABLED !== "false",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      calendarRedirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? "http://localhost:3000/v1/calendar/google/callback",
    },
    // RESEND_API_KEY is the same switch pattern as BANECO_QR_ENABLED: set it
    // to swap DashboardModule's EmailProvider from MockEmailProvider (logs to
    // console) to ResendEmailProvider (real send) — see DashboardModule.
    email: {
      resendApiKey: process.env.RESEND_API_KEY ?? "",
      fromAddress: process.env.EMAIL_FROM_ADDRESS ?? "PagosYa <onboarding@resend.dev>",
      // Where verification/reset links point — the marketing site (apps.checkout
      // is the payment iframe, not a page a human browses to). Not CHECKOUT_ORIGIN.
      webOrigin: process.env.PAGOSYA_WEB_ORIGIN ?? "http://localhost:3001",
      inboundSigningSecret: process.env.RESEND_INBOUND_SIGNING_SECRET ?? "",
    },
    siat: {
      enabled: process.env.SIAT_ENABLED === "true",
      baseUrl: process.env.SIAT_BASE_URL ?? "https://pilotosiatservicios.impuestos.gob.bo/v2",
      delegatedToken: process.env.SIAT_DELEGATED_TOKEN ?? "",
      systemCode: process.env.SIAT_SYSTEM_CODE ?? "",
      environmentCode: parseSiatEnvCode(process.env.SIAT_ENVIRONMENT_CODE, 2),
      // pagosYa is authorized for Facturacion Computarizada en Linea.
      modalityCode: parseSiatEnvCode(process.env.SIAT_MODALITY_CODE, 2),
    },
  };
  assertProductionSecurityConfig(app);
  return { app };
};
