// Readiness run 2026-11-04: each store's job statuses and the template its first build recorded (metadata.templatePick).
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client'); const p = new PrismaClient();
(async () => { for (const k of process.argv.slice(2)) {
  const id = require(`./${k}/demo.json`).storeId;
  const jobs = await p.storeSourceChatJob.findMany({ where: { storeId: id }, orderBy: { createdAt: 'asc' }, select: { status: true } });
  const ms = await p.storeAgentMessage.findMany({ where: { thread: { storeId: id }, role: 'ASSISTANT', metadata: { path: ['templatePick'], string_starts_with: '' } }, select: { content: true, metadata: true } });
  console.log('==', k, 'jobs', jobs.map(j => j.status[0]).join(''));
  for (const m of ms) console.log('  pick', m.metadata.templatePick, '|', m.content.slice(0, 220).replace(/\n/g, ' / '));
} await p.$disconnect(); })();
