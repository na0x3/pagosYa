// Run after building the API:
// node --env-file=apps/api/.env apps/api/test/website-draft.database-check.cjs
// All fixture writes, including publication, are rolled back together.
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
const { StoresService } = require("../dist/src/stores/stores.service.js");
const { VisualStudioService } = require("../dist/src/stores/visual-studio.service.js");

if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error("This check requires a local development database.");
}
const prisma = new PrismaClient();
const rollback = new Error("ROLLBACK_WEBSITE_DRAFT_CHECK");

(async () => {
  try {
    await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findFirstOrThrow({ select: { id: true } });
      const store = await tx.store.create({ data: { merchantId: merchant.id, slug: `draft-check-${Date.now()}`, name: "Draft check", tagline: "Public title" } });
      const scoped = new Proxy(tx, { get: (target, property) => property === "$transaction" ? (work) => typeof work === "function" ? work(tx) : Promise.all(work) : target[property] });
      const service = new StoresService(scoped, {}, {});
      const visual = new VisualStudioService(scoped, {}, { get: () => undefined }, {});
      const races = await Promise.allSettled(["One", "Two"].map((tagline) => service.saveWebsiteDraft(merchant.id, store.id, { revision: 0, tagline, links: [{ label: tagline, url: "https://example.com" }] })));
      assert.equal(races.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(races.filter((result) => result.status === "rejected" && result.reason.getStatus() === 409).length, 1);
      const saved = await tx.store.findUniqueOrThrow({ where: { id: store.id } });
      assert.equal(saved.tagline, "Public title");
      assert.equal(saved.websiteRevision, 1);
      const publicView = await service.getStorePublic(store.slug, { trackView: false });
      assert.equal(publicView.tagline, "Public title");
      assert.equal(JSON.stringify(publicView).includes("websiteDraft"), false);
      await assert.rejects(service.publishWebsiteDraft(merchant.id, store.id, 0), (error) => error.getStatus() === 409);
      await service.publishWebsiteDraft(merchant.id, store.id, 1);
      const published = await service.getStorePublic(store.slug, { trackView: false });
      assert.equal(published.tagline, saved.websiteDraft.data.tagline);
      const version = await tx.storeVisualVersion.findFirstOrThrow({ where: { storeId: store.id } });
      await visual.restore(merchant.id, store.id, version.id, 2);
      assert.equal((await service.getStorePublic(store.slug, { trackView: false })).tagline, published.tagline);
      const restored = await tx.store.findUniqueOrThrow({ where: { id: store.id } });
      assert.equal(restored.websiteDraft.data.tagline, "Public title");
      await service.discardWebsiteDraft(merchant.id, store.id, 3);
      assert.equal((await tx.store.findUniqueOrThrow({ where: { id: store.id } })).websiteDraft, null);
      throw rollback;
    }, { timeout: 20_000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
  process.stdout.write("PASS: real PostgreSQL draft race, private/public reads, stale publish, publish, restore, discard; all fixture writes rolled back.\n");
})().catch((error) => { console.error(error); process.exitCode = 1; });
