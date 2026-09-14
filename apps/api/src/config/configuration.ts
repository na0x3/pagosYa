import * as path from "path";
import type { DomainCommerceConfig } from '../stores/domains/domain-commerce.config';

export interface BanecoQrConfig {
  enabled: boolean;
  baseUrl: string;
  username: string;
  password: string;
  aesKey: string;
  creditAccount: string;
  webhookSecret: string;
}

export interface EmailConfig {
  resendApiKey: string;
  fromAddress: string;
  webOrigin: string;
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
  sourceDesignJobsEnabled: boolean;
  environment: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  internalRailCallbackSecret: string;
  internalOpsSecret: string;
  checkoutOrigin: string;
  consumerDashboardOrigin: string;
  merchantDashboardOrigin: string;
  orderTrackingSecret: string;
  operationsEncryptionKey: string;
  corsOrigins: string[];
  exposeDocs: boolean;
  trustProxy: false | number | string;
  customDomains: {
    target: string;
  };
  banecoQr: BanecoQrConfig;
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
  deepSeek: { apiKey: string; enabled: boolean };
  openAi: {
    apiKey: string;
    designModel: string;
    conversationModel: string;
    inventoryModel: string;
    imageModel: string;
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
  requireSecret("OPERATIONS_ENCRYPTION_KEY", app.operationsEncryptionKey);
  requireHttps("CHECKOUT_ORIGIN", app.checkoutOrigin);
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
  const app: AppConfig = {
    environment,
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: databaseUrlWithPoolSettings(process.env.DATABASE_URL ?? ""),
    redisUrl: process.env.REDIS_URL ?? "",
    internalRailCallbackSecret: process.env.INTERNAL_RAIL_CALLBACK_SECRET ?? "",
    internalOpsSecret: process.env.INTERNAL_OPS_SECRET ?? "",
    checkoutOrigin: process.env.CHECKOUT_ORIGIN ?? "http://localhost:5174",
    consumerDashboardOrigin: process.env.CONSUMER_DASHBOARD_ORIGIN ?? "http://localhost:4324",
    merchantDashboardOrigin: process.env.MERCHANT_DASHBOARD_ORIGIN ?? "http://localhost:4322",
    orderTrackingSecret: process.env.ORDER_TRACKING_SECRET ?? "development-only-order-tracking-secret-change-me",
    operationsEncryptionKey: process.env.OPERATIONS_ENCRYPTION_KEY ?? "development-only-operations-key",
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
      markupPercent: Number(process.env.DOMAIN_MARKUP_PERCENT ?? 0),
      cloudflareToken: process.env.DOMAIN_CLOUDFLARE_API_TOKEN ?? '',
      cloudflareZoneId: process.env.DOMAIN_CLOUDFLARE_ZONE_ID ?? '',
      target: process.env.CUSTOM_DOMAIN_CNAME_TARGET ?? 'stores.pagosya.bo',
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
    sourceDesignJobsEnabled: process.env.SOURCE_DESIGN_JOBS_ENABLED === 'true',
    deepSeek: { apiKey: process.env.DEEPSEEK_API_KEY ?? "", enabled: process.env.DEEPSEEK_ENABLED !== "false" },
    openAi: {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      conversationModel: process.env.OPENAI_CONVERSATION_MODEL ?? "gpt-5.6-terra",
      designModel: process.env.OPENAI_DESIGN_MODEL ?? "gpt-5.6-sol",
      inventoryModel: process.env.OPENAI_INVENTORY_MODEL ?? "gpt-5.6-sol",
      imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
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
