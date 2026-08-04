export interface AppConfig {
  port: number;
  databaseUrl: string;
  internalRailCallbackSecret: string;
  checkoutOrigin: string;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: process.env.DATABASE_URL ?? "",
    internalRailCallbackSecret: process.env.INTERNAL_RAIL_CALLBACK_SECRET ?? "",
    checkoutOrigin: process.env.CHECKOUT_ORIGIN ?? "http://localhost:5173",
  },
});
