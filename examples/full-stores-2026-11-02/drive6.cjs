// Drives the six first builds: a store waiting on a YAPI question gets «No hace falta, créala ya» (once per question); stops when
// every store has a design revision and no job left. node drive6.cjs
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const fs = require('node:fs'); const { execFileSync } = require('node:child_process'); const p = new PrismaClient();
const keys = (process.env.KEYS || 'gramiyaa,cuadrizate,bookcoffee,dooboo-n6,besto-n6,boxy-n6').split(',');
const answered = new Set(); const wait = ms => new Promise(r => setTimeout(r, ms)); const start = Date.now();
(async () => {
  while (Date.now() - start < 90 * 60e3) {
    let done = 0;
    for (const key of keys) {
      const { storeId } = JSON.parse(fs.readFileSync(`${__dirname}/${key}/demo.json`, 'utf8'));
      const job = await p.storeSourceChatJob.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } });
      const v = await p.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' }, select: { revision: true } });
      if (job?.status === 'AWAITING_INPUT' && !answered.has(job.id)) {
        answered.add(job.id);
        console.log(new Date().toISOString().slice(11, 19), key, 'answers', execFileSync('node', [`${__dirname}/send.cjs`, key, 'No hace falta, créala ya'], { encoding: 'utf8' }).trim().slice(0, 80));
      }
      if ((v?.revision ?? 0) > 0 && !['QUEUED', 'RUNNING', 'AWAITING_INPUT'].includes(job?.status)) done++;
    }
    if (done === keys.length) break;
    await wait(15e3);
  }
  console.log('drive6 finished after', Math.round((Date.now() - start) / 60e3), 'min');
  await p.$disconnect();
})();
