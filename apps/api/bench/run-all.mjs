// Serial batch driver. MODE=engine drives the current design engine over HTTP;
// MODE=sep5 drives the Sep-5 generator through the standalone gateway. Serial by
// necessity: one ChatGPT account, so two concurrent runs risk a sharing error.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { FOLDERS } from "./folders.mjs";

const MODE = process.env.MODE;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const ROOT = "/Users/saramia/pagosYa-sep5-output/bench2";
const keys = FOLDERS.map((b) => b.key).filter((k) => !ONLY || ONLY.includes(k));

const run = (cmd, args, env) => new Promise((resolve) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, cwd: "/Users/saramia/pagosYa/apps/api" });
  let out = "";
  child.stdout.on("data", (d) => { out += d; process.stdout.write(d); });
  child.stderr.on("data", (d) => { out += d; process.stderr.write(d); });
  child.on("close", (code) => resolve({ code, out }));
});

await mkdir(ROOT, { recursive: true });
const results = [];
for (const [index, key] of keys.entries()) {
  const started = Date.now();
  console.log(`\n=== [${index + 1}/${keys.length}] ${MODE} :: ${key} ===`);
  let res;
  if (MODE === "engine") {
    res = await run("node", ["bench/run-engine.mjs"], { STORE_KEY: key, OUT_DIR: `${ROOT}/engine/${key}` });
  } else {
    const handoff = JSON.parse(await readFile(process.env.HANDOFF, "utf8"));
    res = await run("node", ["./sep5-run.mjs"], {
      JOB: `/Users/saramia/pagosYa/apps/api/bench/jobs/${key}.json`,
      OUT_DIR: `${ROOT}/sep5/${key}`,
      KIT_DIR: process.env.KIT_DIR,
      API_BASE: "http://127.0.0.1:3001/v1",
      YAPI_ENDPOINT: handoff.url, YAPI_KEY: handoff.secret,
    });
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ key, mode: MODE, ok: res.code === 0, seconds, tail: res.out.trim().split("\n").slice(-2).join(" | ") });
  console.log(`--- ${key}: ${res.code === 0 ? "ok" : "FAILED"} in ${seconds}s`);
  await writeFile(`${ROOT}/results-${MODE}.json`, JSON.stringify(results, null, 2));
}
console.log("\n===== SUMMARY =====");
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.key.padEnd(14)} ${String(r.seconds).padStart(4)}s`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} succeeded`);
