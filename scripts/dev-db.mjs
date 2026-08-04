import EmbeddedPostgres from "embedded-postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

// Local Postgres for development/tests without requiring Docker or root.
// Mirrors docker-compose.yml's postgres service (same port/user/password/db)
// so DATABASE_URL in .env.example works against either.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(rootDir, ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: 54329,
  persistent: true,
});

async function start() {
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase("pagosya").catch(() => {});
  console.log("postgres ready on postgresql://postgres:postgres@localhost:54329/pagosya");
}

async function stop() {
  await pg.stop();
  console.log("postgres stopped");
}

const cmd = process.argv[2];
if (cmd === "start") await start();
else if (cmd === "stop") await stop();
else {
  console.error("usage: dev-db.mjs <start|stop>");
  process.exit(1);
}
