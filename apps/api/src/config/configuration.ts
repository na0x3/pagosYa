export interface BanecoQrConfig {
  enabled: boolean;
  baseUrl: string;
  username: string;
  password: string;
  aesKey: string;
  creditAccount: string;
  webhookSecret: string;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  internalRailCallbackSecret: string;
  internalOpsSecret: string;
  checkoutOrigin: string;
  corsOrigins: string[];
  banecoQr: BanecoQrConfig;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: process.env.DATABASE_URL ?? "",
    internalRailCallbackSecret: process.env.INTERNAL_RAIL_CALLBACK_SECRET ?? "",
    internalOpsSecret: process.env.INTERNAL_OPS_SECRET ?? "",
    checkoutOrigin: process.env.CHECKOUT_ORIGIN ?? "http://localhost:5173",
    // Checkout iframe origin plus any browser-side internal tools (ops
    // console, merchant dashboard) — merchant *backends* never need CORS,
    // they call the API server-to-server.
    corsOrigins: [
      process.env.CHECKOUT_ORIGIN ?? "http://localhost:5173",
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
  },
});
