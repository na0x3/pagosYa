// 2026-11-02 «check and log»: the background check of each new template home (YAPI's «Armé la portada…» reply, metadata.templateQa).
//   node qa-log.cjs [hours=24]
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient(); const hours = Number(process.argv[2] ?? 24);
(async () => {
  const rows = await prisma.storeAgentMessage.findMany({ where: { createdAt: { gt: new Date(Date.now() - hours * 3600e3) }, content: { startsWith: 'Armé la portada' } },
    orderBy: { createdAt: 'desc' }, select: { createdAt: true, metadata: true, thread: { select: { store: { select: { name: true, slug: true } } } } } });
  for (const row of rows) {
    const qa = row.metadata?.templateQa;
    console.log(`${row.createdAt.toISOString().slice(0, 16)} ${row.thread?.store?.name ?? '?'} (${row.thread?.store?.slug ?? '?'}) ${qa ? `${qa.template} rev ${qa.revision}: ${qa.blocking.length ? '' : 'sin problemas'}` : 'sin revisar'}`);
    for (const line of qa?.blocking ?? []) console.log('   -', line);
  }
  await prisma.$disconnect();
})();
