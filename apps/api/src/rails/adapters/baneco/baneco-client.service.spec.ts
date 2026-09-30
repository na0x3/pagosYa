import { BanecoClientService, BANECO_FETCH_TIMEOUT_MS } from "./baneco-client.service";

describe("BanecoClientService HTTP timeout", () => {
  const cfg = { baseUrl: "https://bank.test", aesKey: "k", password: "p", username: "u", creditAccount: "acc" };
  const config = { get: () => cfg };
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;
  beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock as never; });
  afterAll(() => { global.fetch = realFetch; });

  it("uses an 8 second timeout", () => expect(BANECO_FETCH_TIMEOUT_MS).toBe(8000));

  it("every HTTP call carries an abort signal, and an aborted call surfaces as an error", async () => {
    const jwt = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.y`;
    fetchMock.mockImplementation(async (url: string | URL, init: RequestInit) => {
      const u = String(url);
      if (u.includes("/encrypt")) return { ok: true, status: 200, text: async () => "enc" };
      if (u.includes("/authenticate")) return { ok: true, status: 200, json: async () => ({ token: jwt }) };
      return { ok: true, status: 200, json: async () => ({ status: "ok" }) };
    });
    const client = new BanecoClientService(config as never);
    await (client as any).request("/api/anything");
    expect(fetchMock.mock.calls.length).toBe(3); // encrypt, authenticate, request
    for (const [, init] of fetchMock.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    await expect((client as any).request("/api/anything")).rejects.toThrow(/timeout/);
  });
});
