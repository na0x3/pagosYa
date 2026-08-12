import * as path from "path";

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

export interface AppConfig {
  port: number;
  databaseUrl: string;
  internalRailCallbackSecret: string;
  internalOpsSecret: string;
  checkoutOrigin: string;
  corsOrigins: string[];
  banecoQr: BanecoQrConfig;
  uploadsDir: string;
  objectStorage: {
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
  openAi: {
    apiKey: string;
    designModel: string;
    imageModel: string;
    enabled: boolean;
  };
  email: EmailConfig;
}

function apiRootFromCwd(): string {
  // Nest is started from both the repository root and apps/api in local tools.
  // Anchor the default once so the same bytes are served in either case.
  return path.basename(process.cwd()) === "api" ? process.cwd() : path.join(process.cwd(), "apps", "api");
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: process.env.DATABASE_URL ?? "",
    internalRailCallbackSecret: process.env.INTERNAL_RAIL_CALLBACK_SECRET ?? "",
    internalOpsSecret: process.env.INTERNAL_OPS_SECRET ?? "",
    checkoutOrigin: process.env.CHECKOUT_ORIGIN ?? "http://localhost:5174",
    // Checkout iframe origin plus any browser-side internal tools (ops
    // console, merchant dashboard) — merchant *backends* never need CORS,
    // they call the API server-to-server.
    corsOrigins: [
      process.env.CHECKOUT_ORIGIN ?? "http://localhost:5174",
      ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
    ],
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
      bucket: process.env.OBJECT_STORAGE_BUCKET ?? "",
      region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "",
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== "false",
    },
    openAi: {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      designModel: process.env.OPENAI_DESIGN_MODEL ?? "gpt-5.6-luna",
      imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      enabled: process.env.OPENAI_VISUAL_STUDIO_ENABLED !== "false",
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
  },
});
