import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { foldText } from './assistant-text';
import type { Passage } from './assistant-summary';

// Accent folding without a database extension: lower() then translate() the Spanish accented letters.
// Capitals are listed too, so folding does not depend on lower() handling non-ASCII under a C/POSIX locale.
const FROM = 'áéíóúüñàèìòùÁÉÍÓÚÜÑÀÈÌÒÙ';
const TO = 'aeiouunaeiouaeiouunaeiou';
const fold = (expression: Prisma.Sql) => Prisma.sql`translate(lower(${expression}), ${FROM}, ${TO})`;

/** Plain words joined with OR: the model sends keywords, and any of them may match. Only [a-z0-9] reaches to_tsquery. */
export function orQuery(text: string): string {
  const words = foldText(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 2);
  return [...new Set(words)].slice(0, 12).join(' | ');
}

export async function searchProductIds(prisma: PrismaService, storeId: string, query: string, category: string | null = null, limit = 6): Promise<string[]> {
  const words = orQuery(query);
  if (!words) return [];
  const doc = Prisma.sql`to_tsvector('spanish', ${fold(Prisma.sql`p."name" || ' ' || coalesce(p."description", '') || ' ' || array_to_string(p."tags", ' ') || ' ' || coalesce(c."name", '')`)})`;
  const tsquery = Prisma.sql`to_tsquery('spanish', ${words})`;
  const categoryFilter = category ? Prisma.sql`AND ${fold(Prisma.sql`coalesce(c."name", '')`)} LIKE ${`%${foldText(category).replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT p."id" FROM "PaymentLink" p LEFT JOIN "Category" c ON c."id" = p."categoryId"
    WHERE p."storeId" = ${storeId} AND p."status" = 'ACTIVE' AND ${doc} @@ ${tsquery} ${categoryFilter}
    ORDER BY ts_rank(${doc}, ${tsquery}) DESC, p."createdAt" ASC
    LIMIT ${limit}`;
  return rows.map((row) => row.id);
}

/** Published articles, published reviews, and the store's own passages (story, policies, locations, notes), searched together. */
export async function searchInfo(prisma: PrismaService, storeId: string, query: string, passages: Passage[], limit = 4): Promise<Passage[]> {
  const words = orQuery(query);
  if (!words) return [];
  const titles = passages.map((p) => p.title), bodies = passages.map((p) => p.body);
  const rows = await prisma.$queryRaw<Array<{ title: string; body: string; rank: number }>>`
    WITH docs AS (
      SELECT a."title" AS title, a."excerpt" || ' ' || a."body" AS body FROM "StoreArticle" a
        WHERE a."storeId" = ${storeId} AND a."publishedAt" IS NOT NULL AND a."publishedAt" <= (now() AT TIME ZONE 'UTC') -- publishedAt is a zoneless UTC timestamp; a bare now() would shift by the session time zone
      UNION ALL
      SELECT 'Reseña de ' || r."displayName", r."body" FROM "StoreReview" r WHERE r."storeId" = ${storeId} AND r."status" = 'PUBLISHED'
      UNION ALL
      SELECT t.title, t.body FROM unnest(${titles}::text[], ${bodies}::text[]) AS t(title, body)
    ), scored AS (
      SELECT title, ${fold(Prisma.sql`body`)} AS folded, to_tsvector('spanish', ${fold(Prisma.sql`title || ' ' || body`)}) AS doc FROM docs
    )
    -- the snippet is cut from the accent-folded text so accented words match; only the model reads it
    SELECT title, ts_headline('spanish', folded, to_tsquery('spanish', ${words}), 'MaxWords=90, MinWords=40, StartSel="", StopSel="", HighlightAll=false') AS body, ts_rank(doc, to_tsquery('spanish', ${words})) AS rank
    FROM scored WHERE doc @@ to_tsquery('spanish', ${words})
    ORDER BY rank DESC LIMIT ${limit}`;
  return rows.map(({ title, body }) => ({ title, body }));
}
