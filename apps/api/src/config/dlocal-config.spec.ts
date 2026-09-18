import { parseDlocalConfig } from "./configuration";

describe("parseDlocalConfig", () => {
  it("defaults to fixture mode with the international fee and no FX rate", () => {
    const cfg = parseDlocalConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.baseUrl).toBe("https://sandbox.dlocal.com");
    expect(cfg.intlFeeBps).toBe(590);
    expect(cfg.costBps).toBe(0);
    expect(cfg.bobPerUsd).toBe(0);
    expect(cfg.timeoutMs).toBe(15000);
  });

  it("reads explicit values", () => {
    const cfg = parseDlocalConfig({
      DLOCAL_ENABLED: "true", DLOCAL_BASE_URL: "https://api.dlocal.com", DLOCAL_LOGIN: "l", DLOCAL_TRANS_KEY: "t",
      DLOCAL_SECRET_KEY: "s", INTL_BOB_PER_USD: "6.96", INTL_FEE_BPS: "650", DLOCAL_COST_BPS: "420",
    });
    expect(cfg).toMatchObject({ enabled: true, baseUrl: "https://api.dlocal.com", login: "l", bobPerUsd: 6.96, intlFeeBps: 650, costBps: 420 });
  });

  it("treats a non-numeric rate as unavailable", () => {
    expect(parseDlocalConfig({ INTL_BOB_PER_USD: "abc" }).bobPerUsd).toBe(0);
  });
});
