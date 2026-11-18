import { test } from "node:test";
import assert from "node:assert/strict";
import { BANKS, accountStatusLabel, currentAccounts, maskAccountText, ownerFitsLevel } from "./payout-accounts.mjs";

const row = (over) => ({ id: "pa", bankCode: "BNB", bankName: "Banco Nacional de Bolivia", accountLast4: "5678", holderName: "Ana Pérez", status: "APPROVED", isChange: false, payableFrom: "2026-10-01T15:00:00.000Z", reviewNote: null, createdAt: "2026-10-01T15:00:00.000Z", ...over });

test("lists the same banks as the API", () => {
  assert.equal(BANKS.length, 13);
  assert.deepEqual(BANKS[0], { code: "BNB", name: "Banco Nacional de Bolivia" });
});

test("finds the approved account, the waiting one and a rejection newer than the approved one", () => {
  const approved = row({ id: "a" });
  const waiting = row({ id: "b", status: "PENDING_REVIEW", isChange: true, createdAt: "2026-10-05T15:00:00.000Z" });
  assert.deepEqual(currentAccounts([waiting, approved]), { approved, waiting, lastRejected: null });
  const rejected = row({ id: "c", status: "REJECTED", isChange: true, reviewNote: "Otro titular", createdAt: "2026-10-06T15:00:00.000Z" });
  assert.equal(currentAccounts([rejected, approved]).lastRejected, rejected);
  const oldRejection = row({ id: "d", status: "REJECTED", createdAt: "2026-09-01T15:00:00.000Z" });
  assert.equal(currentAccounts([approved, oldRejection]).lastRejected, null);
  assert.deepEqual(currentAccounts([]), { approved: null, waiting: null, lastRejected: null });
});

test("says where each account stands, in La Paz time", () => {
  const now = new Date("2026-10-08T15:00:00Z");
  assert.equal(accountStatusLabel(row({ status: "PENDING_REVIEW" }), now), "En revisión");
  assert.equal(accountStatusLabel(row(), now), "Aprobada · recibe desembolsos");
  assert.equal(accountStatusLabel(row({ payableFrom: "2026-10-11T19:00:00.000Z" }), now), "Aprobada · desde el 11/10/2026 15:00");
  assert.equal(accountStatusLabel(row({ status: "REJECTED", reviewNote: "Otro titular" }), now), "No aprobada: Otro titular");
});

test("masks only the account number, keeping the bank and holder readable", () => {
  assert.equal(maskAccountText("Banco Nacional de Bolivia 4012345678 — Ana Pérez"), "Banco Nacional de Bolivia ····5678 — Ana Pérez");
  assert.equal(maskAccountText(""), "");
});

test("reuses an approved account only for a level its owner fits", () => {
  assert.equal(ownerFitsLevel("PERSON", 1), true);
  assert.equal(ownerFitsLevel("PERSON", 2), false);
  assert.equal(ownerFitsLevel("COMPANY", 2), true);
  assert.equal(ownerFitsLevel(null, 1), false);
});
