import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Shared harness for the suites that talk to a REAL database.
 *
 * Most API tests mock PrismaService, which is fast and fine for branching
 * logic but structurally blind to everything the database itself enforces: a
 * compound unique key containing null, a CHECK constraint, a partial unique
 * index, 22021 on a NUL byte, a P2002 race between two concurrent writers. A
 * hand-rolled fake agrees with whatever the code happens to do, so those
 * failures reach production with every mocked test green — which is exactly
 * how one already did (see inbox-persistence.integration.spec.ts).
 *
 * Each suite gets a throwaway database of its own: CREATE, apply every real
 * migration in order, DROP afterwards. It never touches the application's
 * database.
 */

const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "prisma", "migrations");

function adminUrl(): string | null {
  const explicit = process.env.INTEGRATION_TEST_ADMIN_URL ?? process.env.INBOX_IT_ADMIN_URL;
  if (explicit) return explicit;

  let raw = process.env.DATABASE_URL;
  if (!raw) {
    // The app reads .env through ConfigModule, which jest does not load.
    const envFile = join(__dirname, "..", "..", "..", ".env");
    if (!existsSync(envFile)) return null;
    raw = readFileSync(envFile, "utf8").split("\n")
      .find((line) => line.startsWith("DATABASE_URL="))
      ?.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
  if (!raw) return null;

  try {
    const url = new URL(raw);
    // Same server, maintenance database — never the application's own.
    url.pathname = "/postgres";
    url.search = "";
    return url.href;
  } catch {
    return null;
  }
}

function reachable(url: string): boolean {
  try {
    const { host, port } = new URL(url);
    execSync(
      `node -e "const n=require('net'),s=n.connect(${port || 5432},'${host.split(":")[0]}');s.setTimeout(2000);s.on('connect',()=>{s.destroy();process.exit(0)});s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))"`,
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the real migration files in order. Splitting on ";" is safe for this
 * repo specifically: no migration uses dollar-quoting, a DO block, or a
 * semicolon inside a string literal. If one ever does, this is the line to fix.
 */
function statements(sql: string): string[] {
  return sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
}

export interface IntegrationDatabase {
  /** `describe` when a database is reachable or CI is set, else `describe.skip`. */
  readonly describeDb: jest.Describe;
  readonly available: boolean;
  /** Unique name of this suite's throwaway database. */
  readonly databaseName: string;
  /** The failing test a CI run gets instead of a quiet green. Call inside describeDb. */
  failIfUnavailable(): void;
  /** CREATEs the database, applies every migration, returns a client for it. */
  create(): Promise<PrismaClient>;
  /** Disconnects and DROPs the database. Safe to call when create() never ran. */
  drop(): Promise<void>;
}

export function integrationDatabase(label: string): IntegrationDatabase {
  const databaseName = `pagosya_it_${label}_${process.pid}_${Date.now().toString(36)}`;
  const admin = adminUrl();
  const available = Boolean(admin) && reachable(admin!);
  const inCi = Boolean(process.env.CI);
  const message =
    `No reachable Postgres for the ${label} integration test. Set ` +
    "INTEGRATION_TEST_ADMIN_URL (or DATABASE_URL) to a server where this test " +
    "may CREATE and DROP a throwaway database.";

  /**
   * On a developer laptop with no database this skips, so a missing Postgres
   * does not turn every local run red. In CI it must NOT skip: a skipped suite
   * exits 0, and a build box without a database would then report success for
   * the one test that exists specifically because the mocked ones cannot catch
   * these failures. So CI gets a failing test instead of a quiet green.
   */
  const describeDb = available || inCi ? describe : describe.skip;

  if (!available && !inCi) {
    // Visible in the runner's output; not a silent omission.
    // eslint-disable-next-line no-console
    console.warn(`[${label} integration] SKIPPED — ${message}`);
  }

  let client: PrismaClient | undefined;

  return {
    describeDb,
    available,
    databaseName,

    failIfUnavailable() {
      it("requires a database in CI", () => {
        throw new Error(`${message} Refusing to report success in CI (CI=${process.env.CI}).`);
      });
    },

    async create() {
      const root = new PrismaClient({ datasources: { db: { url: admin! } } });
      await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await root.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      await root.$disconnect();

      const url = new URL(admin!);
      url.pathname = `/${databaseName}`;
      url.search = "?schema=public";

      client = new PrismaClient({ datasources: { db: { url: url.href } } });
      const names = readdirSync(MIGRATIONS_DIR)
        .filter((name) => existsSync(join(MIGRATIONS_DIR, name, "migration.sql")))
        .sort();
      for (const name of names) {
        for (const statement of statements(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"))) {
          await client.$executeRawUnsafe(statement);
        }
      }
      return client;
    },

    async drop() {
      if (client) await client.$disconnect();
      if (!admin) return;
      const root = new PrismaClient({ datasources: { db: { url: admin } } });
      await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await root.$disconnect();
    },
  };
}
