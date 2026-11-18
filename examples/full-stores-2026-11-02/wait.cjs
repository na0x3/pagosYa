// Waits until a store has no QUEUED/RUNNING chat job (follow-ups included), then prints its jobs, YAPI's replies and revisions.
//   node wait.cjs <key> [minutes]
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const fs = require('node:fs'); const prisma = new PrismaClient();
const key = process.argv[2]; const { storeId } = JSON.parse(fs.readFileSync(`${__dirname}/${key}/demo.json`, 'utf8'));
const since = new Date(Date.now() - Number(process.env.SINCE_MIN ?? 120) * 60e3);
(async () => {
  const start = Date.now(); let idle = 0;
  while (Date.now() - start < Number(process.argv[3] ?? 40) * 60e3) {
    const busy = await prisma.storeSourceChatJob.count({ where: { storeId, status: { in: ['QUEUED', 'RUNNING'] } } });
    idle = busy ? 0 : idle + 1; if (idle >= 3) break;   // 3 quiet polls: follow-ups queue right after a job ends
    await new Promise(r => setTimeout(r, 10e3));
  }
  const jobs = await prisma.storeSourceChatJob.findMany({ where: { storeId, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } });
  for (const j of jobs) { const i = j.input || {}; const kind = ['polish','sectionLibrary','layoutRest','shippingRest','briefCheck','checklistFix','setupAction'].filter(k => i[k]).join(',') || 'chat';
    console.log(j.createdAt.toISOString().slice(11,19), j.status.padEnd(10), kind.padEnd(16), String(i.instruction||'').slice(0,60).replace(/\s+/g,' '), '|', String(j.error||'').slice(0,160)); }
  const thread = await prisma.storeAgentThread.findUnique({ where: { storeId } });
  const messages = thread ? await prisma.storeAgentMessage.findMany({ where: { threadId: thread.id, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, select: { role: true, content: true } }) : [];
  for (const m of messages) console.log(m.role === 'USER' ? '  >' : '  <', m.content.replace(/\s+/g, ' ').slice(0, 420));
  const v = await prisma.storeSourceVersion.findMany({ where: { storeId }, orderBy: { revision: 'asc' }, select: { revision: true, label: true } });
  console.log('revisions:', v.map(x => `${x.revision}:${x.label}`).join(' | '));
  await prisma.$disconnect();
})();
