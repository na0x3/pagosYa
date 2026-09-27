import assert from "node:assert/strict";
import test from "node:test";
import { profileInitials } from "./profile-initials.mjs";

test("a profile's picture is the first letters of its first two words", () => {
  assert.equal(profileInitials("María José Pérez"), "MJ");
  assert.equal(profileInitials("carlos"), "C");
  assert.equal(profileInitials("  ána   lópez "), "ÁL");
  assert.equal(profileInitials("Ñandú"), "Ñ");
});

test("a name without letters still gets a neutral mark", () => {
  assert.equal(profileInitials(""), "?");
  assert.equal(profileInitials(null), "?");
  assert.equal(profileInitials("123 --"), "?");
});
