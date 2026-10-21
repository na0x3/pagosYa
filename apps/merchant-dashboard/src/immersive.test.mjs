import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { flightFrames, narratorTarget, playImmersiveMove } from './immersive.mjs';

test('the flight starts on the dock and ends, faded, where the glass window opens', () => {
  const from = { left: 400, top: 800, width: 640, height: 64 };
  const to = narratorTarget({ width: 1440, height: 900 });
  const frames = flightFrames(from, to);
  assert.equal(frames[0].transform, 'translate(0px, 0px) scale(1, 1)');
  assert.equal(frames[0].opacity, 1);
  assert.equal(frames.at(-1).opacity, 0);
  assert.match(frames.at(-1).transform, /^translate\(\d+(\.\d+)?px, -?\d+(\.\d+)?px\) scale\(/);
});

test('the target stays inside a phone screen', () => {
  const t = narratorTarget({ width: 390, height: 844 });
  assert.ok(t.left >= 0 && t.left + t.width <= 390 && t.top >= 0 && t.top + t.height <= 844);
  assert.equal(t.width, 358);
});

test('reduced motion: switches the view once and flies nothing', async () => {
  const { window } = new JSDOM('<!doctype html><body></body>');
  let went = 0;
  await playImmersiveMove({ doc: window.document, from: { left: 0, top: 0, width: 10, height: 10 }, text: 'Hola', go: () => { went += 1; }, reducedMotion: true });
  assert.equal(went, 1);
  assert.equal(window.document.querySelector('.yapi-ghost'), null);
});

test('without View Transitions it still switches once and the ghost card leaves no trace', async () => {
  const { window } = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  let went = 0;
  await playImmersiveMove({ doc: window.document, from: { left: 0, top: 0, width: 10, height: 10 }, text: 'Hola <b>YAPI</b>', go: () => { went += 1; }, reducedMotion: false, duration: 5 });
  assert.equal(went, 1);
  assert.equal(window.document.querySelector('.yapi-ghost'), null);
});

test('the dock, «Pídele a YAPI» and Crecimiento all travel the same way', () => {
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /import \{ playImmersiveMove \} from "\/src\/immersive\.mjs";/);
  assert.match(js, /function composeInYapi\(text, origin, from\) \{/);
  assert.match(js, /playImmersiveMove\(\{ doc: document, from: from \|\| dockRect\(\), text, go,/);
});

test('the card keeps its proportions in flight, so its words never squash', () => {
  const frames = flightFrames({ left: 400, top: 800, width: 640, height: 64 }, { left: 1036, top: 756, width: 380, height: 120 });
  for (const frame of frames) {
    const [, sx, sy] = frame.transform.match(/scale\(([\d.]+), ([\d.]+)\)/);
    assert.equal(sx, sy);
  }
});
