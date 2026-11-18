// Answers the intake with «Créala ya» (up to 4 questions), then waits until the store's first build and its follow-ups are done.
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client'); const p = new PrismaClient();
const { execFileSync } = require('node:child_process'); const storeId = process.argv[2];
const FULL = '/Users/saramia/pagosYa/examples/full-stores-2026-11-02'; const key = process.argv[3];
(async () => { let answers = 0, quiet = 0; const start = Date.now();
  while (Date.now() - start < 40 * 60e3) {
    const last = await p.storeSourceChatJob.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } });
    if (last?.status === 'AWAITING_INPUT' && answers < 4) { execFileSync('node', [`${FULL}/send.cjs`, key, 'Créala ya'], { cwd: FULL }); answers++; await new Promise(r => setTimeout(r, 8e3)); continue; }
    const busy = await p.storeSourceChatJob.count({ where: { storeId, status: { in: ['QUEUED', 'RUNNING', 'AWAITING_INPUT'] } } });
    quiet = busy ? 0 : quiet + 1; if (quiet >= 4) break; await new Promise(r => setTimeout(r, 10e3)); }
  console.log('first build done in', Math.round((Date.now() - start) / 60e3), 'min, answers', answers); await p.$disconnect(); })();
