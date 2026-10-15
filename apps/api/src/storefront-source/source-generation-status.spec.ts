import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_REVIEW_STATUS } from './source-background-review';

/** Spec 2026-10-14 store controls, part 1: the dev database refused every background-review row because the status CHECK never
 *  listed REVIEWING. Mocked Prisma cannot see a CHECK, so the newest migration that sets it is read here. */
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');
function allowedStatuses(): string[] {
  const latest = readdirSync(MIGRATIONS).filter(name => /^\d{14}_/.test(name)).sort()
    .map(name => join(MIGRATIONS, name, 'migration.sql')).filter(path => existsSync(path))
    .map(path => readFileSync(path, 'utf8'))
    .filter(sql => sql.includes('ADD CONSTRAINT "StoreSourceGeneration_status_check"')).at(-1)!;
  const list = latest.match(/ADD CONSTRAINT "StoreSourceGeneration_status_check" CHECK \("status" IN \(([^)]*)\)\)/)![1];
  return [...list.matchAll(/'([A-Z_]+)'/g)].map(match => match[1]);
}

describe('StoreSourceGeneration status check', () => {
  it('allows every status a generation or a background review writes', () => {
    const allowed = allowedStatuses();
    for (const status of ['RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'CANDIDATE', 'PARTIAL', 'BLOCKED', 'AWAITING_STYLE', SOURCE_REVIEW_STATUS, 'CANCELLED', 'DISCARDED']) {
      expect({ status, allowed: allowed.includes(status) }).toEqual({ status, allowed: true });
    }
  });
});
