import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

it('backfills every currently served store, including legacy stores without a source revision, and defaults new stores to private', async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      // A temporary table shadows Store only on this transaction's connection.
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Store" (
        "id" TEXT PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "sourcePublicationPaused" BOOLEAN NOT NULL DEFAULT false,
        "publishedSourceRevision" INTEGER
      ) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`INSERT INTO "Store" VALUES
        ('legacy', 'ACTIVE', false, NULL), ('source', 'ACTIVE', false, 1),
        ('paused', 'ACTIVE', true, 1), ('archived', 'ARCHIVED', false, 1)`);
      const sql = readFileSync(resolve(__dirname, '../prisma/migrations/20260919120000_store_public_visibility/migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter(statement => statement.trim())) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(`INSERT INTO "Store" ("id") VALUES ('new')`);
      expect(await tx.$queryRawUnsafe(`SELECT "id", "publicVisibility" FROM "Store" ORDER BY "id"`)).toEqual([
        { id: 'archived', publicVisibility: false },
        { id: 'legacy', publicVisibility: true },
        { id: 'new', publicVisibility: false },
        { id: 'paused', publicVisibility: false },
        { id: 'source', publicVisibility: true },
      ]);
    });
  } finally { await prisma.$disconnect(); }
});
