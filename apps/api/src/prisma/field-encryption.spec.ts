import { decryptField, encryptField, FieldEncryptionError, fieldEncryptionMiddleware, isEncrypted, needsSealing, openResult, sealWriteData } from "./field-encryption";

const keys = { current: "k".repeat(40) };

describe("field encryption", () => {
  it("seals to an envelope that opens back, random per write", () => {
    const a = encryptField(keys, "1234567890");
    expect(a).toMatch(/^pfe1\.[0-9a-f]{8}\./);
    expect(a).not.toContain("1234567890");
    expect(encryptField(keys, "1234567890")).not.toBe(a);
    expect(decryptField(keys, a)).toBe("1234567890");
    // Text that looks sealed is sealed again, so a typed "pfe1.…" can never sit unreadable in the table.
    const typed = "pfe1.zzzzzzzz.a.b.c";
    expect(decryptField(keys, encryptField(keys, typed))).toBe(typed);
    expect(decryptField(keys, "plain legacy")).toBe("plain legacy");
  });

  it("opens with a previous key during a rotation and refuses a tampered or unknown envelope", () => {
    const old = encryptField({ current: "o".repeat(40) }, "NIT 1020304050");
    const rotated = { current: "n".repeat(40), previous: ["o".repeat(40)] };
    expect(decryptField(rotated, old)).toBe("NIT 1020304050");
    expect(needsSealing(rotated, old)).toBe(true);
    expect(needsSealing(rotated, encryptField(rotated, "x"))).toBe(false);
    expect(needsSealing(rotated, "plain")).toBe(true);
    expect(() => decryptField({ current: "z".repeat(40) }, old)).toThrow(FieldEncryptionError);
    const parts = old.split(".");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptField({ current: "o".repeat(40) }, parts.join("."))).toThrow("integrity");
  });

  it("seals only the listed fields, through nested writes, without touching the caller's object", () => {
    const data = {
      accountNumber: "10000234",
      holderName: "Ana",
      merchant: { connect: { id: "m1" } },
    };
    const sealed = sealWriteData(keys, "PayoutAccount", data) as typeof data;
    expect(isEncrypted(sealed.accountNumber)).toBe(true);
    expect(sealed.holderName).toBe("Ana");
    expect(data.accountNumber).toBe("10000234");

    const nested = sealWriteData(keys, "Merchant", {
      name: "Tienda",
      kycSubmissions: { create: [{ legalName: "Ana", taxId: "1020", payoutBankAccount: "777" }] },
      payoutAccounts: { update: { where: { id: "pa" }, data: { accountNumber: { set: "999" } } } },
    }) as any;
    expect(nested.name).toBe("Tienda");
    expect(isEncrypted(nested.kycSubmissions.create[0].taxId)).toBe(true);
    expect(isEncrypted(nested.kycSubmissions.create[0].payoutBankAccount)).toBe(true);
    expect(nested.kycSubmissions.create[0].legalName).toBe("Ana");
    expect(isEncrypted(nested.payoutAccounts.update.data.accountNumber.set)).toBe(true);
    // A field with a listed name on a model that is not listed stays as it is.
    expect(sealWriteData(keys, "StoreSourceVisit", { token: "t", secret: "s" })).toEqual({ token: "t", secret: "s" });
  });

  it("opens envelopes anywhere in a result and leaves dates and look-alike text alone", () => {
    const when = new Date();
    const result = openResult(keys, [{ id: "1", createdAt: when, payoutAccounts: [{ accountNumber: encryptField(keys, "555") }], note: "pfe1.not-a-field" }]) as any;
    expect(result[0].payoutAccounts[0].accountNumber).toBe("555");
    expect(result[0].createdAt).toBe(when);
    expect(result[0].note).toBe("pfe1.not-a-field");
  });

  it("as middleware, seals creates and upserts and opens what comes back", async () => {
    const middleware = fieldEncryptionMiddleware(keys);
    const seen: any[] = [];
    const next = async (params: any) => { seen.push(params); return { ...(params.args.data ?? params.args.create) }; };
    const out: any = await middleware({ model: "WebhookEndpoint", action: "create", args: { data: { url: "https://x", secret: "whsec_1" } }, dataPath: [], runInTransaction: false }, next);
    expect(isEncrypted(seen[0].args.data.secret)).toBe(true);
    expect(out.secret).toBe("whsec_1");
    await middleware({ model: "MerchantInvoicingProfile", action: "upsert", args: { where: { id: "x" }, create: { nit: "1" }, update: { nit: "2" } }, dataPath: [], runInTransaction: false }, next);
    expect(isEncrypted(seen[1].args.create.nit) && isEncrypted(seen[1].args.update.nit)).toBe(true);
  });
});
