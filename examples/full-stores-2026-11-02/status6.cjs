// One line per store: latest job status, newest revision and YAPI's last words (owner 2026-11-06 six new stores).
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const fs = require('node:fs'); const p = new PrismaClient();
const keys = (process.argv[2] || 'gramiyaa,cuadrizate,bookcoffee,dooboo-n6,besto-n6,boxy-n6').split(',');
(async () => {
  for (const key of keys) {
    const { storeId, slug } = JSON.parse(fs.readFileSync(`${__dirname}/${key}/demo.json`, 'utf8'));
    const jobs = await p.storeSourceChatJob.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' }, select: { status: true } });
    const v = await p.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' }, select: { revision: true, label: true } });
    const thread = await p.storeAgentThread.findUnique({ where: { storeId } });
    const last = thread ? await p.storeAgentMessage.findFirst({ where: { threadId: thread.id, role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' }, select: { content: true } }) : null;
    console.log(key.padEnd(11), slug, jobs.map(j => j.status[0]).join(''), 'rev', v?.revision ?? 0, (v?.label ?? '').slice(0, 22).padEnd(22), '|', (last?.content ?? '').replace(/\s+/g, ' ').slice(0, 170));
  }
  await p.$disconnect();
})();
