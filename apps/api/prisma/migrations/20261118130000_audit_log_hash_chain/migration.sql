-- ISO 27001 finding M-04: the audit log becomes tamper-evident and append-only.
-- Every entry carries the hash of the one before it (sha256 over its own fields + the previous hash), computed by the
-- database itself so no code path can skip it. Editing, deleting or truncating entries is refused; anyone who bypasses
-- that (a superuser disabling triggers) breaks the chain, which audit_log_entry_hash lets anyone recompute.

ALTER TABLE "AuditLogEntry" ADD COLUMN "seq" BIGINT;
ALTER TABLE "AuditLogEntry" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "AuditLogEntry" ADD COLUMN "hash" TEXT;

-- Existing entries are numbered in the order they happened.
UPDATE "AuditLogEntry" e SET "seq" = o.n
FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n FROM "AuditLogEntry") o
WHERE e."id" = o."id";

CREATE SEQUENCE "AuditLogEntry_seq_seq" OWNED BY "AuditLogEntry"."seq";
SELECT setval('"AuditLogEntry_seq_seq"', coalesce((SELECT max("seq") FROM "AuditLogEntry"), 0) + 1, false);
ALTER TABLE "AuditLogEntry" ALTER COLUMN "seq" SET DEFAULT nextval('"AuditLogEntry_seq_seq"');
ALTER TABLE "AuditLogEntry" ALTER COLUMN "seq" SET NOT NULL;
CREATE UNIQUE INDEX "AuditLogEntry_seq_key" ON "AuditLogEntry"("seq");

-- The one definition of an entry's hash. Fields are joined with the unit separator; jsonb prints its keys in a fixed order.
CREATE FUNCTION audit_log_entry_hash(prev TEXT, e "AuditLogEntry") RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws(E'\x1f',
    prev, e."seq"::TEXT, e."id", e."actorType", e."actorId", e."actorLabel", e."action", e."targetType", e."targetId",
    coalesce(e."metadata"::TEXT, ''), to_char(e."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex')
$$;

-- Seal what is already there, oldest first.
DO $$
DECLARE r "AuditLogEntry"; prev TEXT := 'genesis';
BEGIN
  FOR r IN SELECT * FROM "AuditLogEntry" ORDER BY "seq" LOOP
    UPDATE "AuditLogEntry" SET "prevHash" = prev, "hash" = audit_log_entry_hash(prev, r) WHERE "id" = r."id";
    prev := audit_log_entry_hash(prev, r);
  END LOOP;
END $$;

ALTER TABLE "AuditLogEntry" ALTER COLUMN "prevHash" SET NOT NULL;
ALTER TABLE "AuditLogEntry" ALTER COLUMN "hash" SET NOT NULL;
-- Two entries pointing at the same predecessor would be a fork: refuse the second instead of storing it.
CREATE UNIQUE INDEX "AuditLogEntry_prevHash_key" ON "AuditLogEntry"("prevHash");

-- New entries: numbered and chained under one lock, so concurrent writers line up instead of forking.
CREATE FUNCTION audit_log_entry_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('AuditLogEntry.chain'));
  NEW."seq" := nextval('"AuditLogEntry_seq_seq"');
  SELECT "hash" INTO last_hash FROM "AuditLogEntry" ORDER BY "seq" DESC LIMIT 1;
  NEW."prevHash" := coalesce(last_hash, 'genesis');
  NEW."hash" := audit_log_entry_hash(NEW."prevHash", NEW);
  RETURN NEW;
END $$;
CREATE TRIGGER audit_log_entry_chain BEFORE INSERT ON "AuditLogEntry" FOR EACH ROW EXECUTE FUNCTION audit_log_entry_chain();

CREATE FUNCTION audit_log_entry_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLogEntry is append-only (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_log_entry_no_update BEFORE UPDATE OR DELETE ON "AuditLogEntry" FOR EACH ROW EXECUTE FUNCTION audit_log_entry_append_only();
CREATE TRIGGER audit_log_entry_no_truncate BEFORE TRUNCATE ON "AuditLogEntry" FOR EACH STATEMENT EXECUTE FUNCTION audit_log_entry_append_only();
