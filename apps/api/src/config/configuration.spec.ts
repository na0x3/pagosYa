import configuration from "./configuration";

describe('local ChatGPT plan configuration', () => {
  const keys = ['NODE_ENV', 'YAPI_CHATGPT_PLAN_URL', 'YAPI_CHATGPT_PLAN_SECRET', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY'];
  let original: Record<string, string | undefined>;
  beforeEach(() => {
    original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    Object.assign(process.env, { NODE_ENV: 'development', YAPI_CHATGPT_PLAN_URL: 'http://127.0.0.1:54321/v1/responses', YAPI_CHATGPT_PLAN_SECRET: 'test-local-secret', OPENAI_API_KEY: 'paid-openai', ANTHROPIC_API_KEY: 'paid-claude', DEEPSEEK_API_KEY: 'paid-deepseek' });
  });
  afterEach(() => {
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  });
  it('removes all paid AI credentials from app configuration while preserving the original environment', () => {
    const { app } = configuration();
    expect(app.openAi.apiKey).toBe('');
    expect(app.anthropic.apiKey).toBe('');
    expect(app.deepSeek.apiKey).toBe('');
    expect(app.deepSeek.enabled).toBe(false);
    expect(app.chatgptPlan?.secret).toBe('test-local-secret');
    expect(process.env.OPENAI_API_KEY).toBe('paid-openai');
  });
  it('rejects a production launch, remote bridge, and missing local credential', () => {
    process.env.NODE_ENV = 'production';
    expect(configuration).toThrow('local development launcher');
    process.env.NODE_ENV = 'development';
    process.env.YAPI_CHATGPT_PLAN_URL = 'https://remote.example/v1/responses';
    expect(configuration).toThrow('local development launcher');
    process.env.YAPI_CHATGPT_PLAN_URL = 'http://127.0.0.1:54321/v1/responses';
    delete process.env.YAPI_CHATGPT_PLAN_SECRET;
    expect(configuration).toThrow('local development launcher');
  });
  it('keeps normal API mode unchanged when the local bridge is absent', () => {
    delete process.env.YAPI_CHATGPT_PLAN_URL;
    const { app } = configuration();
    expect(app.openAi.apiKey).toBe('paid-openai');
    expect(app.anthropic.apiKey).toBe('paid-claude');
    expect(app.chatgptPlan).toBeUndefined();
  });
});

const SECURITY_ENV_KEYS = [
  "NODE_ENV",
  "DATABASE_URL",
  "REDIS_URL",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "INTERNAL_RAIL_CALLBACK_SECRET",
  "INTERNAL_OPS_SECRET",
  "CHECKOUT_ORIGIN",
  "CONSUMER_DASHBOARD_ORIGIN",
  "MERCHANT_DASHBOARD_ORIGIN",
  "ORDER_TRACKING_SECRET",
  "DOCUMENT_LINK_SECRET",
  "ANALYTICS_SESSION_SECRET",
  "OPERATIONS_ENCRYPTION_KEY",
  "EXTENSIONS_ENCRYPTION_KEY",
  "PAGOSYA_WEB_ORIGIN",
  "ADDITIONAL_CORS_ORIGINS",
  "BANECO_QR_ENABLED",
  "TRUST_PROXY",
  "INTL_BOB_PER_USD",
  "DLOCAL_ENABLED",
  "DLOCAL_LOGIN",
  "DLOCAL_TRANS_KEY",
  "DLOCAL_SECRET_KEY",
  "DLOCAL_NOTIFICATION_URL",
  "DLOCAL_RETURN_URL",
] as const;

function setStrongProductionEnv() {
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://database.example/pagosya";
  process.env.REDIS_URL = "rediss://default:strong-password@redis.example:6379/0";
  process.env.OBJECT_STORAGE_BUCKET = "pagosya-production";
  process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "production-access-key";
  process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "production-secret-key";
  process.env.INTERNAL_RAIL_CALLBACK_SECRET = "rail_" + "a".repeat(48);
  process.env.INTERNAL_OPS_SECRET = "ops_" + "b".repeat(48);
  process.env.CHECKOUT_ORIGIN = "https://checkout.pagosya.bo";
  process.env.CONSUMER_DASHBOARD_ORIGIN = "https://mi.pagosya.bo";
  process.env.MERCHANT_DASHBOARD_ORIGIN = "https://comercios.pagosya.bo";
  process.env.ORDER_TRACKING_SECRET = "tracking_" + "d".repeat(48);
  process.env.OPERATIONS_ENCRYPTION_KEY = "calendar_" + "c".repeat(48);
  process.env.EXTENSIONS_ENCRYPTION_KEY = "extensions_" + "g".repeat(48);
  process.env.DOCUMENT_LINK_SECRET = "documents_" + "e".repeat(48);
  process.env.ANALYTICS_SESSION_SECRET = "analytics_" + "f".repeat(48);
  process.env.PAGOSYA_WEB_ORIGIN = "https://pagosya.bo";
  process.env.ADDITIONAL_CORS_ORIGINS = "https://ops.pagosya.bo,https://dashboard.pagosya.bo";
  process.env.BANECO_QR_ENABLED = "false";
  process.env.TRUST_PROXY = "1";
  delete process.env.INTL_BOB_PER_USD;
  delete process.env.DLOCAL_ENABLED;
}

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
    process.env.REDIS_URL = "";
    process.env.OBJECT_STORAGE_BUCKET = "";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "";
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
    process.env.REDIS_URL = "rediss://default:strong-password@redis.example:6379/0";
    process.env.OBJECT_STORAGE_BUCKET = "pagosya-production";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "production-access-key";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "production-secret-key";
    process.env.INTERNAL_RAIL_CALLBACK_SECRET = "rail_" + "a".repeat(48);
    process.env.INTERNAL_OPS_SECRET = "ops_" + "b".repeat(48);
    process.env.CHECKOUT_ORIGIN = "https://checkout.pagosya.bo";
    process.env.CONSUMER_DASHBOARD_ORIGIN = "https://mi.pagosya.bo";
    process.env.MERCHANT_DASHBOARD_ORIGIN = "https://comercios.pagosya.bo";
    process.env.ORDER_TRACKING_SECRET = "tracking_" + "d".repeat(48);
    process.env.OPERATIONS_ENCRYPTION_KEY = "calendar_" + "c".repeat(48);
    process.env.EXTENSIONS_ENCRYPTION_KEY = "extensions_" + "g".repeat(48);
    process.env.DOCUMENT_LINK_SECRET = "documents_" + "e".repeat(48);
    process.env.ANALYTICS_SESSION_SECRET = "analytics_" + "f".repeat(48);
    process.env.PAGOSYA_WEB_ORIGIN = "https://pagosya.bo";
    process.env.ADDITIONAL_CORS_ORIGINS = "https://ops.pagosya.bo,https://dashboard.pagosya.bo";
    process.env.BANECO_QR_ENABLED = "false";
    process.env.TRUST_PROXY = "1";

    const result = configuration();
    expect(result.app.environment).toBe("production");
    expect(result.app.trustProxy).toBe(1);
    expect(result.app.exposeDocs).toBe(false);
    expect(result.app.databaseUrl).toContain("connection_limit=10");
  });

  it("refuses production without a strong document link secret", () => {
    setStrongProductionEnv();
    delete process.env.DOCUMENT_LINK_SECRET;
    expect(configuration).toThrow("DOCUMENT_LINK_SECRET");
    process.env.DOCUMENT_LINK_SECRET = "development-only-document-link-secret-change-me";
    expect(configuration).toThrow("DOCUMENT_LINK_SECRET");
  });

  it("refuses production without a strong analytics session secret", () => {
    setStrongProductionEnv();
    delete process.env.ANALYTICS_SESSION_SECRET;
    expect(configuration).toThrow("ANALYTICS_SESSION_SECRET");
    process.env.ANALYTICS_SESSION_SECRET = "development-only-analytics-session-secret-change-me";
    expect(configuration).toThrow("ANALYTICS_SESSION_SECRET");
  });

  it("refuses an FX rate in production while dLocal would run on fixtures", () => {
    setStrongProductionEnv();
    process.env.INTL_BOB_PER_USD = "6.96";
    expect(configuration).toThrow("INTL_BOB_PER_USD");

    process.env.DLOCAL_ENABLED = "true";
    process.env.DLOCAL_LOGIN = "login";
    process.env.DLOCAL_TRANS_KEY = "trans";
    process.env.DLOCAL_SECRET_KEY = "secret";
    process.env.DLOCAL_NOTIFICATION_URL = "https://api.pagosya.bo/v1/webhooks/dlocal/payments";
    process.env.DLOCAL_RETURN_URL = "https://checkout.pagosya.bo/";
    expect(() => configuration()).not.toThrow();
  });
});

describe("domain commerce configuration", () => {
  const DOMAIN_ENV_KEYS = ["CUSTOM_DOMAIN_CNAME_TARGET"] as const;
  const original = Object.fromEntries(DOMAIN_ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of DOMAIN_ENV_KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // A deployment that forgets this variable must not register real domains and
  // point them at the default host. The manual connect flow keeps its default,
  // because that path is already live and a change there would break it.
  it("leaves the purchased-domain CNAME target empty while the manual flow keeps its default", () => {
    delete process.env.CUSTOM_DOMAIN_CNAME_TARGET;
    const { app } = configuration() as any;
    expect(app.domainCommerce.target).toBe("");
    expect(app.customDomains.target).toBe("stores.pagosya.bo");
  });

  it("uses the configured target for both once it is set", () => {
    process.env.CUSTOM_DOMAIN_CNAME_TARGET = "edge.example.test";
    const { app } = configuration() as any;
    expect(app.domainCommerce.target).toBe("edge.example.test");
    expect(app.customDomains.target).toBe("edge.example.test");
  });
});

describe("document email cap", () => {
  const saved = process.env.DOCUMENT_EMAILS_PER_DAY;
  afterEach(() => { if (saved === undefined) delete process.env.DOCUMENT_EMAILS_PER_DAY; else process.env.DOCUMENT_EMAILS_PER_DAY = saved; });

  it("defaults to 200 document emails per store per day and reads DOCUMENT_EMAILS_PER_DAY", () => {
    delete process.env.DOCUMENT_EMAILS_PER_DAY;
    expect(configuration().app.documentEmailsPerDay).toBe(200);
    process.env.DOCUMENT_EMAILS_PER_DAY = "50";
    expect(configuration().app.documentEmailsPerDay).toBe(50);
    process.env.DOCUMENT_EMAILS_PER_DAY = "0";
    expect(configuration).toThrow("DOCUMENT_EMAILS_PER_DAY");
  });
});

describe("store analytics daily cap", () => {
  const saved = process.env.STORE_ANALYTICS_DAILY_CAP;
  afterEach(() => { if (saved === undefined) delete process.env.STORE_ANALYTICS_DAILY_CAP; else process.env.STORE_ANALYTICS_DAILY_CAP = saved; });

  it("defaults to 50 000 analytics events per store per day and reads STORE_ANALYTICS_DAILY_CAP", () => {
    delete process.env.STORE_ANALYTICS_DAILY_CAP;
    expect(configuration().app.storeAnalyticsDailyCap).toBe(50_000);
    process.env.STORE_ANALYTICS_DAILY_CAP = "1000";
    expect(configuration().app.storeAnalyticsDailyCap).toBe(1000);
    process.env.STORE_ANALYTICS_DAILY_CAP = "0";
    expect(configuration).toThrow("STORE_ANALYTICS_DAILY_CAP");
  });
});

describe("Anthropic", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  afterEach(() => { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; });
  it("reads the Anthropic key for the Claude models", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(configuration().app.anthropic.apiKey).toBe("sk-ant-test");
  });
});

describe("YAPI engine", () => {
  const saved = { engine: process.env.YAPI_ENGINE, env: process.env.NODE_ENV };
  afterEach(() => { for (const [key, value] of [["YAPI_ENGINE", saved.engine], ["NODE_ENV", saved.env]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  it("uses the same agent engine in every environment unless explicitly overridden", () => {
    delete process.env.YAPI_ENGINE;
    process.env.NODE_ENV = "development";
    expect(configuration().app.yapiEngine).toBe("agent");
    process.env.NODE_ENV = "test";
    expect(configuration().app.yapiEngine).toBe("agent");
    process.env.YAPI_ENGINE = "single";
    expect(configuration().app.yapiEngine).toBe("single");
    process.env.YAPI_ENGINE = "agent";
    expect(configuration().app.yapiEngine).toBe("agent");
  });
});

describe("source framework default", () => {
  const saved = process.env.SOURCE_FRAMEWORK;
  afterEach(() => { if (saved === undefined) delete process.env.SOURCE_FRAMEWORK; else process.env.SOURCE_FRAMEWORK = saved; });

  it("generates new stores in component mode unless static is asked for explicitly", () => {
    delete process.env.SOURCE_FRAMEWORK;
    expect(configuration().app.sourceFramework).toBe("next");
    process.env.SOURCE_FRAMEWORK = "static";
    expect(configuration().app.sourceFramework).toBe("static");
  });
});

describe('public asset base URL', () => {
  const original = process.env.PUBLIC_ASSET_BASE_URL;
  afterEach(() => { if (original === undefined) delete process.env.PUBLIC_ASSET_BASE_URL; else process.env.PUBLIC_ASSET_BASE_URL = original; });
  it('reads PUBLIC_ASSET_BASE_URL without a trailing slash, and null when unset', () => {
    process.env.PUBLIC_ASSET_BASE_URL = 'https://api.pagosya.bo/';
    expect(configuration().app.publicAssetBaseUrl).toBe('https://api.pagosya.bo');
    delete process.env.PUBLIC_ASSET_BASE_URL;
    expect(configuration().app.publicAssetBaseUrl).toBeNull();
  });
});
