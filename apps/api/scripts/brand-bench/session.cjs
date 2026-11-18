// node session.cjs: a 10 h local dashboard session for the benchmark stores' merchant, written to the DEV database (no owner session
// is touched) and saved to $BENCH_LIVE (default ~/pagosya-benchmarks/live.json). Run it before a round: an expired one answers 401.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { LIVE, brands, prisma } = require('./common.cjs');

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('brand bench: dev only');
  const db = prisma();
  const merchantId = Object.values(brands())[0].merchantId;
  const user = await db.merchantUser.findFirstOrThrow({ where: { merchantId }, select: { id: true } });
  const token = `dash_${randomBytes(24).toString('base64url')}`;
  const session = await db.merchantSession.create({ data: { merchantUserId: user.id, merchantId, hashedToken: 'sha256:' + createHash('sha256').update(token).digest('hex'),
    profileName: 'Brand bench', profileAvatarId: 1, isPrimary: false, expiresAt: new Date(Date.now() + 10 * 3600e3) } });
  fs.mkdirSync(path.dirname(LIVE), { recursive: true });
  fs.writeFileSync(LIVE, JSON.stringify({ token, sessionId: session.id }, null, 2), { mode: 0o600 });
  console.log('session ok, 10 h', LIVE);
  await db.$disconnect();
})().catch(error => { console.error(error.message); process.exit(1); });
