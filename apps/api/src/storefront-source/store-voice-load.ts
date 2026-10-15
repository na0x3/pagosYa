import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { readVoice, VOICE_FILE, type StoreVoice } from './store-voice';

/** The voice sheet of a store's latest revision (spec 2026-10-14), read in PostgreSQL so no bundled photo bytes travel. Undefined
 *  when the store has none or the read fails: every reader then writes as it did before the sheet. */
export async function loadStoreVoice(prisma: Pick<PrismaService, '$queryRaw'>, storeId: string): Promise<StoreVoice | undefined> {
  try {
    const rows = await prisma.$queryRaw<Array<{ content: string | null }>>(Prisma.sql`
      SELECT (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${VOICE_FILE} LIMIT 1) AS content
      FROM "StoreSourceVersion" v
      WHERE v."storeId" = ${storeId}
      ORDER BY v.revision DESC LIMIT 1
    `);
    const content = rows[0]?.content;
    return content ? readVoice([{ path: VOICE_FILE, content }]) : undefined;
  } catch {
    return undefined;
  }
}
