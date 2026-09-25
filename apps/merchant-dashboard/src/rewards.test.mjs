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

import { JSDOM } from 'jsdom';
import { celebrateXpGain } from './rewards.mjs';

test('celebrateXpGain fills the bar, counts up, announces and flags each level-up', async () => {
  const { window } = new JSDOM('<div id="t" role="progressbar"><span></span></div><strong id="l"></strong><p id="a"></p>');
  globalThis.document = window.document;
  const track = window.document.getElementById('t'); const label = window.document.getElementById('l'); const announcer = window.document.getElementById('a');
  let clock = 0; const levels = [];
  await celebrateXpGain({
    previousXp: 90, gainedXp: 200, thresholds: [0, 100, 250, 450],
    bars: [{ track, label, format: (xp) => `${xp} XP` }], announcer,
    frame: (cb) => { clock += 1000; cb(); return 0; }, now: () => clock,
    onLevelUp: (level) => levels.push(level),
  });
  assert.equal(track.style.getPropertyValue('--xp-progress-scale'), '0.2');
  assert.equal(track.getAttribute('aria-valuenow'), '20');
  assert.equal(track.firstElementChild.style.transform, 'scaleX(0.2)', 'bars drawn by an inner fill span (topbar, Horizonte) move too');
  assert.equal(label.textContent, '290 XP');
  assert.match(announcer.textContent, /Ganaste 200 XP/);
  assert.deepEqual(levels, [1, 2]);
  assert.ok(track.classList.contains('is-xp-pulse'));
  assert.ok(!track.classList.contains('is-xp-gaining'));
  assert.ok(track.querySelector('.xp-gain-float'));
});

test('celebrateXpGain jumps straight to the end with reduced motion', async () => {
  const { window } = new JSDOM('<div id="t"></div>'); globalThis.document = window.document;
  const track = window.document.getElementById('t'); let frames = 0;
  await celebrateXpGain({ previousXp: 10, gainedXp: 25, thresholds: [0, 100], bars: [{ track }], reduceMotion: true, frame: (cb) => { frames++; cb(); return 0; }, now: () => 0 });
  assert.equal(frames, 0);
  assert.equal(track.style.getPropertyValue('--xp-progress-scale'), '0.35');
  assert.ok(!track.classList.contains('is-xp-gaining'));
});
