import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_VISUALS, boardHopPath, boardTileCoords, rewardCopy, wheelRotationFor, xpAnimationSegments } from './rewards.mjs';

test('wheel lands the chosen slice under the top pointer, always spinning forward', () => {
  const next = wheelRotationFor(0, 4, 9, { turns: 6, jitter: 0 });
  const slice = 360 / 9;
  assert.equal(((next % 360) + 360) % 360, (360 - (4 * slice + slice / 2)) % 360);
  assert.ok(next >= 360 * 6);
  assert.ok(wheelRotationFor(next, 0, 9) > next);
});

test('board ring walks the 7x7 perimeter clockwise', () => {
  assert.deepEqual(boardTileCoords(0), { row: 1, col: 1 });
  assert.deepEqual(boardTileCoords(6), { row: 1, col: 7 });
  assert.deepEqual(boardTileCoords(12), { row: 7, col: 7 });
  assert.deepEqual(boardTileCoords(18), { row: 7, col: 1 });
  assert.deepEqual(boardTileCoords(23), { row: 2, col: 1 });
  assert.equal(new Set(Array.from({ length: 24 }, (_, i) => JSON.stringify(boardTileCoords(i)))).size, 24);
});

test('hop path visits every tile and wraps', () => {
  assert.deepEqual(boardHopPath(22, 4), [23, 0, 1, 2]);
});

test('XP animation splits a gain that crosses two levels', () => {
  assert.deepEqual(xpAnimationSegments(90, 200, [0, 100, 250, 450]), [
    { level: 0, fromPct: 90, toPct: 100 },
    { level: 1, fromPct: 0, toPct: 100 },
    { level: 2, fromPct: 0, toPct: 20 },
  ]);
  assert.deepEqual(xpAnimationSegments(10, 25, [0, 100]), [{ level: 0, fromPct: 10, toPct: 35 }]);
});

test('every prize has visuals and converted credits explain themselves', () => {
  for (const key of ['STICKER_COMMON', 'XP_25', 'AI_CREDITS_5', 'TIP', 'XP_50', 'RESPIN', 'STICKER_RARE', 'XP_200', 'AI_CREDITS_25']) assert.ok(WHEEL_VISUALS[key]?.label, key);
  assert.match(rewardCopy({ prize: 'AI_CREDITS_5', kind: 'XP', amount: 200, convertedFrom: 'AI_CREDITS' }).message, /tope/);
  assert.match(rewardCopy({ prize: 'XP_50', kind: 'XP', amount: 50, convertedFrom: null }).title, /\+50 XP/);
  assert.match(rewardCopy({ prize: 'AI_CREDITS_5', kind: 'AI_CREDITS', amount: 5, convertedFrom: null }).title, /5 créditos de IA/);
});
