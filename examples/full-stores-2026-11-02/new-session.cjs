// A fresh local dashboard session for the live check (6 h), written straight to the DB so no owner session is revoked.
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const { createHash, randomBytes } = require('node:crypto'); const fs = require('node:fs');
const prisma = new PrismaClient(); const LIVE = __dirname + '/live.json';
(async () => {
  const { merchantId } = JSON.parse(fs.readFileSync(__dirname + '/miga/demo.json', 'utf8'));
  const user = await prisma.merchantUser.findFirstOrThrow({ where: { merchantId }, select: { id: true } });
  const token = `dash_${randomBytes(24).toString('base64url')}`;
  const session = await prisma.merchantSession.create({ data: { merchantUserId: user.id, merchantId, hashedToken: 'sha256:' + createHash('sha256').update(token).digest('hex'), profileName: 'Live check', profileAvatarId: 1, isPrimary: false, expiresAt: new Date(Date.now() + 6 * 3600_000) } });
  const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
  fs.writeFileSync(LIVE, JSON.stringify({ ...live, token, sessionIds: [...new Set([...(live.sessionIds ?? []), session.id])] }, null, 2));
  console.log('session ok');
  await prisma.$disconnect();
})();
