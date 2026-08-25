import configuration from "./configuration";

const SECURITY_ENV_KEYS = [
  "NODE_ENV",
  "DATABASE_URL",
  "INTERNAL_RAIL_CALLBACK_SECRET",
  "INTERNAL_OPS_SECRET",
  "CHECKOUT_ORIGIN",
  "CONSUMER_DASHBOARD_ORIGIN",
  "MERCHANT_DASHBOARD_ORIGIN",
  "ORDER_TRACKING_SECRET",
  "OPERATIONS_ENCRYPTION_KEY",
  "PAGOSYA_WEB_ORIGIN",
  "ADDITIONAL_CORS_ORIGINS",
  "BANECO_QR_ENABLED",
  "TRUST_PROXY",
] as const;

describe("production security configuration", () => {
  const original = Object.fromEntries(SECURITY_ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of SECURITY_ENV_KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("fails closed when production secrets and HTTPS origins are unsafe", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "";
    process.env.INTERNAL_RAIL_CALLBACK_SECRET = "dev-change-me";
    process.env.INTERNAL_OPS_SECRET = "short";
    process.env.CHECKOUT_ORIGIN = "http://checkout.example";
    process.env.CONSUMER_DASHBOARD_ORIGIN = "http://consumer.example";
    process.env.MERCHANT_DASHBOARD_ORIGIN = "http://merchant.example";
    process.env.ORDER_TRACKING_SECRET = "short";
    process.env.OPERATIONS_ENCRYPTION_KEY = "short";
    process.env.PAGOSYA_WEB_ORIGIN = "http://web.example";
    process.env.ADDITIONAL_CORS_ORIGINS = "";
    process.env.BANECO_QR_ENABLED = "false";

    expect(configuration).toThrow("Refusing insecure production startup");
  });

  it("accepts explicit strong production settings and a bounded proxy hop count", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://database.example/pagosya";
    process.env.INTERNAL_RAIL_CALLBACK_SECRET = "rail_" + "a".repeat(48);
    process.env.INTERNAL_OPS_SECRET = "ops_" + "b".repeat(48);
    process.env.CHECKOUT_ORIGIN = "https://checkout.pagosya.bo";
    process.env.CONSUMER_DASHBOARD_ORIGIN = "https://mi.pagosya.bo";
    process.env.MERCHANT_DASHBOARD_ORIGIN = "https://comercios.pagosya.bo";
    process.env.ORDER_TRACKING_SECRET = "tracking_" + "d".repeat(48);
    process.env.OPERATIONS_ENCRYPTION_KEY = "calendar_" + "c".repeat(48);
    process.env.PAGOSYA_WEB_ORIGIN = "https://pagosya.bo";
    process.env.ADDITIONAL_CORS_ORIGINS = "https://ops.pagosya.bo,https://dashboard.pagosya.bo";
    process.env.BANECO_QR_ENABLED = "false";
    process.env.TRUST_PROXY = "1";

    const result = configuration();
    expect(result.app.environment).toBe("production");
    expect(result.app.trustProxy).toBe(1);
    expect(result.app.exposeDocs).toBe(false);
  });
});
