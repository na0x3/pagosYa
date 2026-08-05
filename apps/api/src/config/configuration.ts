export interface AppConfig {
  port: number;
  databaseUrl: string;
  internalRailCallbackSecret: string;
  internalOpsSecret: string;
  checkoutOrigin: string;
  corsOrigins: string[];
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
  },
});
