// Prints a store's current home sections (type + title) from its newest revision.
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const fs = require('node:fs'); const prisma = new PrismaClient();
const key = process.argv[2]; const { storeId } = JSON.parse(fs.readFileSync(`${__dirname}/${key}/demo.json`, 'utf8'));
(async () => {
  const v = await prisma.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' } });
  const data = v.snapshot.files.find(f => f.path === 'components/store-data.tsx')?.content ?? '';
  const line = data.split('\n').find(l => l.startsWith('export const layout'));
  const layout = line ? JSON.parse(line.slice(line.indexOf('=') + 1).trim().replace(/;$/, '')) : [];
  const theme = (/"theme":"([^"]+)"/.exec(data) || [])[1];
  console.log(`${key} rev ${v.revision} «${v.label}» theme=${theme} sections=${layout.length}`);
  for (const b of layout) console.log('  -', b.type.padEnd(18), (b.title || '').slice(0, 60), b.items ? `[${b.items.length} items]` : '');
  await prisma.$disconnect();
})();
