import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { ANIMATIONS, MOTIONS, mountBlob, runAnimation, validateSteps } from "../player.mjs";

function recorder({ cancelAfter = Infinity } = {}) {
  const log = [];
  let applied = 0;
  return {
    log,
    io: {
      apply: (step) => { log.push(["apply", step.expression, step.motion]); applied += 1; },
      wait: async (ms) => { log.push(["wait", ms]); },
      cancelled: () => applied >= cancelAfter,
    },
  };
}

test("an animation runs its steps with their holds, then returns to rest", async () => {
  const { log, io } = recorder();
  await runAnimation([{ expression: "surprised", hold: 600, motion: "hop" }, { expression: "happy", hold: 1400, motion: "celebrate" }], { rest: "smug" }, io);
  assert.deepEqual(log, [
    ["apply", "surprised", "hop"], ["wait", 600],
    ["apply", "happy", "celebrate"], ["wait", 1400],
    ["apply", "smug", null],
  ]);
});

test("rest defaults to idle and a step without motion has none", async () => {
  const { log, io } = recorder();
  await runAnimation([{ expression: "thinking", hold: 10 }], {}, io);
  assert.deepEqual(log, [["apply", "thinking", null], ["wait", 10], ["apply", "idle", null]]);
});

test("a looped animation repeats until cancelled and never jumps to rest itself", async () => {
  const { log, io } = recorder({ cancelAfter: 5 });
  await runAnimation(ANIMATIONS.talking, { loop: true }, io);
  assert.deepEqual(log.filter(([kind]) => kind === "apply").map(([, expression]) => expression), ["idle", "surprised", "idle", "surprised", "idle"]);
});

test("reduced motion jumps to the final expression with no motion, holds, then rests", async () => {
  const { log, io } = recorder();
  await runAnimation(ANIMATIONS.unlock, { rest: "wink", reducedMotion: true }, io);
  assert.deepEqual(log, [["apply", "happy", null], ["wait", 2000], ["apply", "wink", null]]);
});

test("reduced motion on a loop just holds the expression", async () => {
  const { log, io } = recorder();
  await runAnimation(ANIMATIONS.waiting, { loop: true, reducedMotion: true }, io);
  assert.deepEqual(log, [["apply", "thinking", null]]);
});

test("bad animations are refused with the step that is wrong", () => {
  assert.throws(() => validateSteps([]), /at least one step/);
  assert.throws(() => validateSteps([{ expression: "dance", hold: 1 }]), /Step 0: unknown expression/);
  assert.throws(() => validateSteps([{ expression: "happy", hold: 1 }, { expression: "happy", hold: -1 }]), /Step 1: hold/);
  assert.throws(() => validateSteps([{ expression: "happy", hold: 1, motion: "spin" }]), /Step 0: unknown motion/);
  assert.deepEqual(MOTIONS, ["bounce", "hop", "shake", "celebrate", "talk"]);
  for (const [name, steps] of Object.entries(ANIMATIONS)) assert.doesNotThrow(() => validateSteps(steps), name);
});

function dom() {
  const { window } = new JSDOM("<!doctype html><span id=host></span>");
  globalThis.matchMedia = () => ({ matches: false });
  return window.document.getElementById("host");
}

test("mountBlob changes expression without replacing the figure, and sets body motion on the host", async () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "pagosya:test", expression: "idle" });
  const figure = blob.svg.querySelector(".mo-bob");
  assert.equal(host.classList.contains("blob-host"), true);
  assert.equal(blob.svg.getAttribute("aria-hidden"), "true");
  const played = blob.play([{ expression: "happy", hold: 5, motion: "hop" }]);
  assert.equal(host.getAttribute("data-blob-motion"), "hop");
  assert.equal(host.getAttribute("data-blob-expression"), "happy");
  assert.match(blob.svg.querySelector("g.mo-root").getAttribute("class"), /mo-expr/);
  assert.match(blob.svg.getAttribute("style"), /--mo-esx:/);
  await played;
  assert.equal(blob.expression, "idle");
  assert.equal(host.getAttribute("data-blob-expression"), "idle");
  assert.equal(host.hasAttribute("data-blob-motion"), false);
  assert.equal(blob.svg.querySelector(".mo-bob"), figure);
});

test("a new animation cancels the running one; stop returns to rest", async () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "pagosya:test", expression: "smug" });
  const first = blob.play([{ expression: "thinking", hold: 20 }], { loop: true });
  const second = blob.play([{ expression: "surprised", hold: 5, motion: "hop" }]);
  await second;
  assert.equal(blob.expression, "smug");
  void blob.play([{ expression: "thinking", hold: 20 }], { loop: true });
  assert.equal(blob.expression, "thinking");
  blob.stop();
  assert.equal(blob.expression, "smug");
  await first;
});

test("with reduced motion, mountBlob shows the target expression and never sets body motion", async () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "pagosya:test", reducedMotion: true });
  const played = blob.play([{ expression: "surprised", hold: 5, motion: "hop" }, { expression: "love", hold: 5, motion: "celebrate" }]);
  assert.equal(blob.expression, "love");
  assert.equal(host.hasAttribute("data-blob-motion"), false);
  await played;
  assert.equal(blob.expression, "idle");
});

test("a titled mounted blob keeps its accessible name", () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "s", title: "Ana" });
  assert.equal(blob.svg.getAttribute("role"), "img");
  assert.equal(blob.svg.querySelector("title").textContent, "Ana");
});

test("blob-motion.css defines every motion and turns them all off for reduced motion", async () => {
  const css = await readFile(new URL("../blob-motion.css", import.meta.url), "utf8");
  for (const motion of MOTIONS) {
    assert.match(css, new RegExp(`@keyframes blob-${motion} `));
    assert.match(css, new RegExp(`\\[data-blob-motion="${motion}"\\] > \\.blob-figure \\{ animation: blob-${motion} `));
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.blob-host\[data-blob-motion\] > \.blob-figure \{ animation: none; \}/);
});
