// Readiness run 2026-11-04 (YAPI asks first): waits until a store has no QUEUED/RUNNING job, then prints YAPI's newest message, its
// chips and the intake so far.   node last.cjs <key> [minutes=15]
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient(); const key = process.argv[2]; const { storeId } = require(`${__dirname}/${key}/demo.json`);
(async () => {
  const start = Date.now(); let idle = 0;
  while (Date.now() - start < Number(process.argv[3] ?? 15) * 60e3) {
    const busy = await prisma.storeSourceChatJob.count({ where: { storeId, status: { in: ['QUEUED', 'RUNNING'] } } });
    idle = busy ? 0 : idle + 1; if (idle >= 2) break; await new Promise(r => setTimeout(r, 5e3));
  }
  const m = await prisma.storeAgentMessage.findFirst({ where: { thread: { storeId }, role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' } });
  const meta = m?.metadata || {};
  console.log(`== ${key}\n${m?.content}\n chips: ${(meta.clarification?.options || []).map(o => o.label).join(' | ') || '-'}\n intake: ${meta.intake ? `asked=${meta.intake.asked.join(',')} answers=${meta.intake.answers.length}` : '-'}  templatePick: ${meta.templatePick || '-'}`);
  await prisma.$disconnect();
})();
