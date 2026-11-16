// node node_modules/ts-node/dist/bin.js --transpile-only scripts/brand-bench/v2-scorecard.ts key:storeId … > out.json
// Owner 2026-11-15 («a great e-commerce generator», step 3: a measured quality bar): the page checks on each store's latest V2 design,
// desktop and phone, with the time and cost of the run that made it (examples/brand-bench/v2/rounds.jsonl). No model call.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { templateQaFindings } from '../../src/storefront-source/source-template-qa';
import { FREE_ADVICE_BLOCKERS, FREE_BLOCKERS } from '../../src/storefront-source/v2/v2-run';

const LABEL = 'Diseño V2 (prototipo)';
const ROUNDS = join(__dirname, '..', '..', '..', '..', 'examples', 'brand-bench', 'v2', 'rounds.jsonl');
type Round = { key: string; storeId: string; status: string; revision: number | null; minutes: number; usd: number };

(async () => {
  const prisma = new PrismaClient();
  const rounds: Round[] = existsSync(ROUNDS) ? readFileSync(ROUNDS, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const out = [];
  for (const job of process.argv.slice(2)) {
    const [key, storeId] = job.split(':');
    const version = await prisma.storeSourceVersion.findFirst({ where: { storeId, label: { startsWith: LABEL } }, orderBy: { revision: 'desc' } });
    if (!version) { out.push({ key, storeId, error: 'sin diseño V2' }); continue; }
    const widths = await templateQaFindings(version.snapshot as never);
    const counted = (width: 1280 | 390) => {
      const findings = widths.find(entry => entry.width === width)?.findings ?? [];
      return findings.filter(finding => (finding.severity === 'block' && FREE_BLOCKERS.has(finding.rule)) || FREE_ADVICE_BLOCKERS.has(finding.rule)).map(finding => finding.rule);
    };
    const desktop = counted(1280), phone = counted(390);
    // The run that saved this revision (a reassemble has none; the nearest earlier run of the store stands in).
    const run = rounds.filter(round => round.storeId === storeId && round.status === 'DONE' && (round.revision ?? 0) <= version.revision).sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0];
    out.push({ key, storeId, revision: version.revision, problems: { desktop, phone }, total: desktop.length + phone.length, minutes: run?.minutes ?? null, usd: run?.usd ?? null });
    console.error(`${key} r${version.revision}: ${desktop.length + phone.length} problems ${[...new Set([...desktop, ...phone])].join(', ')}`);
  }
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
})();
