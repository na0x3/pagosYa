import { formatComplaintNumber, nextComplaintNumber } from "./complaint-number";

describe("complaint numbers", () => {
  it("formats R-YYYY-NNNNNN", () => {
    expect(formatComplaintNumber(2026, 123)).toBe("R-2026-000123");
  });
  it("takes the next number for the La Paz year in one statement", async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ last: 7 }]) };
    await expect(nextComplaintNumber(tx as any, new Date("2027-01-01T02:00:00Z"))).resolves.toBe("R-2026-000007");
    const sql = (tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain("ON CONFLICT");
    expect(tx.$queryRaw.mock.calls[0][1]).toBe(2026);
  });
});
