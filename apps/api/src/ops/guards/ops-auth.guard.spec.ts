import { ipAllowed } from "./ops-auth.guard";

describe("ipAllowed (OPS_ALLOWED_IPS)", () => {
  it("lets everyone through when no list is set", () => {
    expect(ipAllowed("8.8.8.8", [])).toBe(true);
  });

  it("matches exact addresses and IPv4 CIDR blocks, including IPv4-mapped IPv6", () => {
    const list = ["200.87.10.4", "10.8.0.0/16"];
    expect(ipAllowed("200.87.10.4", list)).toBe(true);
    expect(ipAllowed("::ffff:10.8.33.2", list)).toBe(true);
    expect(ipAllowed("10.9.0.1", list)).toBe(false);
    expect(ipAllowed("200.87.10.5", list)).toBe(false);
    expect(ipAllowed(undefined, list)).toBe(false);
    expect(ipAllowed("10.8.0.1", ["10.8.0.0/33"])).toBe(false);
  });
});
