import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the subscriptions panel does not use URLSearchParams.size (Safari < 17)", () => {
  const source = readFileSync(new URL("../src/subscriptions-panel.mjs", import.meta.url), "utf8");
  assert.equal(/\bparams\.size\b/.test(source), false);
});
