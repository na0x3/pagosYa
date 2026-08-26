ALTER TABLE "Store"
  ALTER COLUMN "announcementColor" SET DEFAULT '#ffffff';

UPDATE "Store"
SET "announcementColor" = '#ffffff'
WHERE LOWER("announcementColor") = '#c58b3c';
