import assert from "node:assert/strict";
import test from "node:test";
import { shouldWelcome } from "./yapi-welcome.mjs";

// Owner 2026-11-15: YAPI's welcome greets whoever opens the panel, never a link that asked for another screen.
test("the welcome shows on a plain entry or Inicio, not over a deep link", () => {
  assert.equal(shouldWelcome(""), true);
  assert.equal(shouldWelcome("#"), true);
  assert.equal(shouldWelcome("#dashboard-overview"), true);
  assert.equal(shouldWelcome("#dashboard-orders"), false);
  assert.equal(shouldWelcome("#dashboard-workspace"), false);
});
