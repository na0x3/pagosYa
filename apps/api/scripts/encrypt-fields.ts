/**
 * ISO A-02: seals the bank accounts, NIT/CI and stored secrets that were written before field encryption, and re-seals
 * everything after a key rotation (new FIELD_ENCRYPTION_KEY, the old one in FIELD_ENCRYPTION_PREVIOUS_KEYS). Reads with
 * every key it is given, writes with the current one. Dry run by default; --apply writes.
 *
 *   FIELD_ENCRYPTION_KEY=… npx ts-node scripts/encrypt-fields.ts [--apply]
 */
import { PrismaClient } from '@prisma/client';
import configuration from '../src/config/configuration';
import { decryptField, ENCRYPTED_FIELDS, encryptField, needsSealing } from '../src/prisma/field-encryption';

async function main() {
  const apply = process.argv.includes('--apply');
  const app = configuration().app;
  const keys = { current: app.fieldEncryptionKey, previous: app.fieldEncryptionPreviousKeys };
  // A plain client on purpose: it sees the stored envelopes, not the opened values PrismaService returns.
  const prisma = new PrismaClient({ datasources: { db: { url: app.databaseUrl } } });
  let total = 0;
  try {
    for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
      const delegate = (prisma as any)[model[0].toLowerCase() + model.slice(1)];
      let cursor: string | undefined;
      let sealed = 0;
      for (;;) {
        const rows: Array<Record<string, string | null>> = await delegate.findMany({
          select: Object.fromEntries([['id', true], ...fields.map((field) => [field, true])]),
          orderBy: { id: 'asc' },
          take: 500,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (!rows.length) break;
        cursor = rows[rows.length - 1].id!;
        for (const row of rows) {
          const data = Object.fromEntries(fields.filter((field) => needsSealing(keys, row[field])).map((field) => [field, encryptField(keys, decryptField(keys, row[field]!))]));
          if (!Object.keys(data).length) continue;
          sealed += 1;
          if (apply) await delegate.update({ where: { id: row.id }, data });
        }
      }
      if (sealed) console.log(`${model}: ${sealed} row(s) ${apply ? 'sealed' : 'to seal'} (${fields.join(', ')})`);
      total += sealed;
    }
    console.log(total ? `${total} row(s) ${apply ? 'sealed' : 'to seal — run again with --apply'}` : 'Every encrypted field is sealed with the current key.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
