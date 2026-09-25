import assert from "node:assert/strict";
import test from "node:test";
import { ADVENTURE_LEVELS, GAMIFICATION_RUNNERS, PROFILE_ART_VERSION, STARTER_COUNT, normalizeAvatarId, profileAvatarHtml } from "./companions.mjs";

test("levels climb in id and xp order, starting free", () => {
  assert.equal(ADVENTURE_LEVELS[0].xpRequired, 0);
  ADVENTURE_LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1);
    if (index) assert.ok(level.xpRequired > ADVENTURE_LEVELS[index - 1].xpRequired, `${level.name} needs more xp than the level before`);
  });
});

test("the runners are exactly the starter levels, sharing their art", () => {
  assert.equal(GAMIFICATION_RUNNERS.length, STARTER_COUNT);
  GAMIFICATION_RUNNERS.forEach((runner, index) => {
    assert.equal(runner.name, ADVENTURE_LEVELS[index].name);
    assert.equal(runner.asset, `/assets/profile-${index + 1}.png?v=${PROFILE_ART_VERSION}`);
    assert.ok(runner.description);
  });
});

test("avatar ids outside the starters fall back to the first", () => {
  assert.equal(normalizeAvatarId(3), 3);
  assert.equal(normalizeAvatarId("4"), 4);
  for (const bad of [0, 5, -1, 2.5, "x", null, undefined, '1" onerror="alert(1)']) assert.equal(normalizeAvatarId(bad), 1);
});

test("avatar markup only ever carries a normalized id", () => {
  assert.equal(profileAvatarHtml(2), `<img class="profile-avatar-image profile-avatar-image-2" src="/assets/profile-2.png?v=${PROFILE_ART_VERSION}" alt="">`);
  assert.doesNotMatch(profileAvatarHtml('2" onerror="x'), /onerror/);
});
