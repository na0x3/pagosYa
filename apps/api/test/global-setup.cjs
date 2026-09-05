const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const statePath = path.join(__dirname, ".e2e-state.json");

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

module.exports = async () => {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "pagosya-e2e-pg-"));
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pagosya-e2e-uploads-"));
  const port = await availablePort();
  const database = "pagosya_e2e";
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
  });

  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(database);
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`;
    const state = { databaseDir, uploadsDir, port, database, databaseUrl };
    fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });

    const projectRoot = path.resolve(__dirname, "../../..");
    execFileSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "prisma", "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"],
      {
        cwd: projectRoot,
        env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
        stdio: "inherit",
      },
    );

    global.__PAGOSYA_E2E_POSTGRES__ = pg;
  } catch (error) {
    await pg.stop().catch(() => {});
    fs.rmSync(databaseDir, { recursive: true, force: true });
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.rmSync(statePath, { force: true });
    throw error;
  }
};
