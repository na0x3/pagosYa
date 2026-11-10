// Merienda test stores 2026-11-10: first build naming the template (answering «Créala ya» to YAPI's questions), then the drawn parts.
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'); const prisma = new PrismaClient();
const send = (key, ...words) => console.log(execFileSync('node', [`${__dirname}/send.cjs`, key, ...words], { encoding: 'utf8' }).trim().slice(0, 90));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function idle(storeId) { for (let quiet = 0; quiet < 3;) { const busy = await prisma.storeSourceChatJob.count({ where: { storeId, status: { in: ['QUEUED', 'RUNNING'] } } }); quiet = busy ? 0 : quiet + 1; await sleep(10_000); } }
async function last(storeId) {
  const thread = await prisma.storeAgentThread.findUnique({ where: { storeId } });
  return thread ? prisma.storeAgentMessage.findFirst({ where: { threadId: thread.id, role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' } }) : null;
}
(async () => {
  const keys = process.argv.slice(2);
  if (!process.env.RESUME) for (const key of keys) send(key, '--first'); else for (const key of keys) send(key, 'Créala ya');
  for (const key of keys) {
    const { storeId } = JSON.parse(fs.readFileSync(`${__dirname}/${key}/demo.json`, 'utf8'));
    for (let round = 0; round < 6; round++) {
      await idle(storeId);
      const revision = await prisma.storeSourceVersion.count({ where: { storeId } });
      const message = await last(storeId);
      if (revision >= 2) break;
      if (message?.metadata?.clarification || message?.metadata?.intake) send(key, 'Créala ya');
      else break;
    }
    await idle(storeId);
    if (await prisma.storeSourceVersion.count({ where: { storeId } }) < 1) { console.log(key, 'no build'); continue; }
    console.log(key, 'built');
  }
  for (const key of keys) { const { storeId } = JSON.parse(fs.readFileSync(`${__dirname}/${key}/demo.json`, 'utf8')); await idle(storeId);
    const r = await prisma.storeRetention.findUnique({ where: { storeId } }); const s = r?.settings || {};
    const v = await prisma.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' } }); const files = v?.snapshot?.files || []; const data = files.find(f => f.path === 'components/store-data.ts')?.content || ''; console.log(key, 'revisions', await prisma.storeSourceVersion.count({ where: { storeId } }), 'theme', (data.match(/"theme":"([a-z]+)"/) || [])[1], 'blocks', (data.match(/"type":"[a-z-]+"/g) || []).join(' ').replace(/"type":/g, '')); }
  await prisma.$disconnect();
})().catch(error => { console.error(error); process.exit(1); });
