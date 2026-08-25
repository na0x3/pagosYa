import { spawn, spawnSync } from "node:child_process";
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

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!(await portIsOpen(54329))) {
  start("database", ["dev:db"]);
  await waitForPort(54329);
}

runOnce(["--filter", "@pagosya/api", "exec", "prisma", "migrate", "deploy"]);
runOnce(["--filter", "@pagosya/shared-types", "run", "build"]);

start("shared types", ["--filter", "@pagosya/shared-types", "run", "dev"]);
start("API", ["--filter", "@pagosya/api", "run", "start:dev"], {
  PORT: "3001",
  CHECKOUT_ORIGIN: "http://localhost:5175",
});
start("checkout", ["--filter", "@pagosya/checkout", "exec", "vite", "--host", "127.0.0.1", "--port", "5175"], {
  VITE_API_BASE_URL: "http://localhost:3001/v1",
  VITE_CONSUMER_APP_ORIGIN: "http://localhost:4324",
});
start("dashboard", ["--filter", "@pagosya/merchant-dashboard", "run", "dev"], {
  DASHBOARD_LIVE_RELOAD: "0",
});
start("consumer", ["--filter", "@pagosya/consumer-dashboard", "run", "dev"]);
start("ops", ["--filter", "@pagosya/ops", "run", "start"]);

console.log("\npagosYa development stack is starting:");
console.log("  API        http://localhost:3001");
console.log("  Checkout   http://localhost:5175");
console.log("  Dashboard  http://localhost:4323");
console.log("  Mi pagosYa http://localhost:4324");
console.log("  Ops        http://localhost:4322");
console.log("Press Ctrl+C once to stop everything.\n");
