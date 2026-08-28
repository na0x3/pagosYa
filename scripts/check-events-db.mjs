import { PrismaClient } from "../apps/api/node_modules/@prisma/client/default.js";

const prisma = new PrismaClient();
try {
  const enums = await prisma.$queryRaw`
    SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname LIKE ${"%Event%"}
    GROUP BY t.typname
    ORDER BY t.typname
  `;
  const tables = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = ${"public"}
      AND (tablename LIKE ${"%Event%"} OR tablename IN (${"Venue"}, ${"Admission"}, ${"Attendee"}, ${"TicketType"}))
    ORDER BY tablename
  `;
  const columns = await prisma.$queryRaw`
    SELECT table_name AS table, column_name AS column, data_type AS type, udt_name AS udt, is_nullable AS nullable
    FROM information_schema.columns
    WHERE table_schema = ${"public"}
      AND table_name IN (${"Event"}, ${"EventOrder"}, ${"EventPriceStage"}, ${"EventSeat"}, ${"EventTicket"})
    ORDER BY table_name, ordinal_position
  `;
  const constraints = await prisma.$queryRaw`
    SELECT tc.table_name AS table, tc.constraint_name AS name, tc.constraint_type AS type,
      kcu.column_name AS column, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = ${"public"}
      AND tc.table_name IN (${"Event"}, ${"EventOrder"}, ${"EventPriceStage"}, ${"EventSeat"}, ${"EventTicket"})
    ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
  `;
  console.log(JSON.stringify({ enums, tables, columns, constraints }, null, 2));
} finally {
  await prisma.$disconnect();
}
