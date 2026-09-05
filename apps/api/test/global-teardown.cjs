const fs = require("node:fs");
const path = require("node:path");

module.exports = async () => {
  const statePath = path.join(__dirname, ".e2e-state.json");
  if (!fs.existsSync(statePath)) return;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

  try {
    if (global.__PAGOSYA_E2E_POSTGRES__) {
      await global.__PAGOSYA_E2E_POSTGRES__.stop();
    } else {
      const { default: EmbeddedPostgres } = await import("embedded-postgres");
      const pg = new EmbeddedPostgres({
        databaseDir: state.databaseDir,
        user: "postgres",
        password: "postgres",
        port: state.port,
        persistent: true,
      });
      await pg.stop();
    }
  } finally {
    fs.rmSync(state.databaseDir, { recursive: true, force: true });
    fs.rmSync(state.uploadsDir, { recursive: true, force: true });
    fs.rmSync(statePath, { force: true });
  }
};
