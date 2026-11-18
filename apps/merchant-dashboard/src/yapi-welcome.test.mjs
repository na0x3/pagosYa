import assert from "node:assert/strict";
import test from "node:test";
import { brandAsk, shouldWelcome } from "./yapi-welcome.mjs";

// Owner 2026-11-15: YAPI's welcome greets whoever opens the panel, never a link that asked for another screen.
test("the welcome shows on a plain entry or Inicio, not over a deep link", () => {
  assert.equal(shouldWelcome(""), true);
  assert.equal(shouldWelcome("#"), true);
  assert.equal(shouldWelcome("#dashboard-overview"), true);
  assert.equal(shouldWelcome("#dashboard-orders"), false);
  assert.equal(shouldWelcome("#dashboard-workspace"), false);
  // Owner 2026-11-17 («i dont want to see it everytime i refresh»): once it showed in this tab, a refresh goes to the panel.
  assert.equal(shouldWelcome("", true), false);
  assert.equal(shouldWelcome("#dashboard-overview", true), false);
});

// Spec 2026-11-18 «Mejorar mi marca»: the chip sends a branding request (the API runs the brand flow for it) with what was typed.
test("the «Mejorar mi marca» chip asks for the brand flow, with whatever was typed", () => {
  assert.equal(brandAsk(""), "Mejorar mi marca");
  assert.equal(brandAsk("  https://calima-sauce.myshopify.com "), "Mejorar mi marca. https://calima-sauce.myshopify.com");
});
