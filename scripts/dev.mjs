import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];
let shuttingDown = false;

function portIsOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

// Reads one key from apps/api/.env so dev-only checkout helpers share the API's value.
function apiEnv(key) {
  try {
    const line = readFileSync(path.join(rootDir, "apps/api/.env"), "utf8")
      .split("\n")
      .find((entry) => entry.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim().replace(/^(["'])(.*)\1$/, "$2") || undefined;
  } catch {
    return undefined;
  }
}

function runOnce(args) {
  const result = spawnSync(pnpm, args, { cwd: rootDir, env: process.env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitForPort(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portIsOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for localhost:${port}`);
}

function start(name, args, extraEnv = {}) {
  const child = spawn(pnpm, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  children.push({ name, child });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${name} stopped unexpectedly (${signal ?? `exit ${code}`}).`);
    shutdown(code || 1);
  });
}

async function startOrReuse(name, port, args, extraEnv = {}) {
  if (await portIsOpen(port)) {
    if (name === 'API' && process.env.YAPI_CHATGPT_PLAN_URL) {
      throw new Error('ChatGPT plan mode cannot reuse an existing API. Stop the process on port 3001 and retry pnpm dev:chatgpt.');
    }
    console.log(`${name} already available on http://localhost:${port}; reusing it.`);
    return false;
  }
  start(name, args, extraEnv);
  return true;
}

function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping pagosYa development services…");
  for (const { child } of children) stopChild(child);
  process.exit(code);
}

// A killed bridge must not leave an API advertising a disconnected ChatGPT mode.
if (process.env.YAPI_CHATGPT_PLAN_URL) {
  const bridge = new URL(process.env.YAPI_CHATGPT_PLAN_URL);
  const watchBridge = setInterval(async () => {
    if (!shuttingDown && !(await portIsOpen(Number(bridge.port), bridge.hostname))) {
      console.error('ChatGPT bridge stopped. Restart with pnpm dev:chatgpt --skip-setup.');
      shutdown(1);
    }
  }, 5000);
  watchBridge.unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!(await portIsOpen(54329))) {
  start("database", ["dev:db"]);
  await waitForPort(54329);
}

// A restart can reuse the already prepared database and shared types.
if (!process.argv.includes('--skip-setup')) {
  runOnce(["--filter", "@pagosya/api", "exec", "prisma", "migrate", "deploy"]);
  runOnce(["--filter", "@pagosya/shared-types", "run", "build"]);
}

start("shared types", ["--filter", "@pagosya/shared-types", "run", "dev"]);
await startOrReuse("API", 3001, ["--filter", "@pagosya/api", "run", "start:dev"], {
  PORT: "3001",
  CHECKOUT_ORIGIN: "http://localhost:5175",
});
await startOrReuse("checkout", 5175, ["--filter", "@pagosya/checkout", "exec", "vite", "--host", "127.0.0.1", "--port", "5175"], {
  VITE_API_BASE_URL: "http://localhost:3001/v1",
  VITE_CONSUMER_APP_ORIGIN: "http://localhost:4324",
  // Lets the dev-only "Simular confirmación" button post the rail callback.
  VITE_DEV_INTERNAL_RAIL_CALLBACK_SECRET:
    process.env.VITE_DEV_INTERNAL_RAIL_CALLBACK_SECRET ?? apiEnv("INTERNAL_RAIL_CALLBACK_SECRET") ?? "",
});
await startOrReuse("dashboard", 4323, ["--filter", "@pagosya/merchant-dashboard", "run", "dev"], {
  DASHBOARD_LIVE_RELOAD: "0",
});
await startOrReuse("consumer", 4324, ["--filter", "@pagosya/consumer-dashboard", "run", "dev"]);
await startOrReuse("ops", 4322, ["--filter", "@pagosya/ops", "run", "start"]);

console.log("\npagosYa development stack is starting:");
console.log("  API        http://localhost:3001");
console.log("  Checkout   http://localhost:5175");
console.log("  Dashboard  http://localhost:4323");
console.log("  Mi pagosYa http://localhost:4324");
console.log("  Ops        http://localhost:4322");
console.log("Press Ctrl+C once to stop everything.\n");
