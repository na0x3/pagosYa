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
  email: EmailConfig;
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
    // Where product photos / merchant logos land on disk (see UploadsModule).
    // Default keeps dev/test self-contained, same "no Docker required" ethos as
    // embedded-postgres — no object storage dependency needed at this scale.
    uploadsDir: process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads"),
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
