// node scripts/screens.mjs <outDir> — screenshots every dashboard screen at 1440 and 390 for the Clyro restyle
// (spec 2026-11-16) and reports sideways scroll. Session token from the JSON file in PAGOSYA_SESSION_FILE (never printed).
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const token = JSON.parse(readFileSync(process.env.PAGOSYA_SESSION_FILE, "utf8")).token;
const VIEWS = ["dashboard-overview", "dashboard-products", "dashboard-payments", "dashboard-charge-links", "dashboard-payouts",
  "dashboard-marketing", "dashboard-store-settings", "dashboard-stores"];
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const browser = await chromium.launch();
for (const [size, viewport] of Object.entries(SIZES)) {
  const anon = await browser.newPage({ viewport });
  await anon.goto("http://localhost:4323/", { waitUntil: "networkidle" }).catch(() => {});
  await anon.waitForTimeout(800);
  await anon.screenshot({ path: `${out}/login-${size}.jpg`, quality: 70 });
  console.log(JSON.stringify({ view: "login", size, overflow: await overflow(anon) }));
  await anon.close();
  const context = await browser.newContext({ viewport });
  await context.addInitScript((t) => { try { sessionStorage.setItem("pagosya_merchant_session", t); } catch {} }, token);
  const page = await context.newPage();
  await page.goto("http://localhost:4323/", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  const go = page.getByText("Ir a mi panel").first();
  if (await go.isVisible().catch(() => false)) {
    await page.screenshot({ path: `${out}/welcome-${size}.jpg`, quality: 70 });
    console.log(JSON.stringify({ view: "welcome", size, overflow: await overflow(page) }));
    await go.click(); await page.waitForTimeout(1200);
  }
  for (const view of VIEWS) {
    await page.evaluate((hash) => { location.hash = hash; }, view);
    await page.waitForTimeout(2200);
    // A phone shot covers the whole page up to 6000px (a long store list would make an empty JPEG).
    const height = size === "phone" ? Math.min(6000, await page.evaluate(() => document.documentElement.scrollHeight)) : viewport.height;
    await page.screenshot({ path: `${out}/${view}-${size}.jpg`, quality: 70, fullPage: size === "phone", clip: { x: 0, y: 0, width: viewport.width, height } });
    console.log(JSON.stringify({ view, size, overflow: await overflow(page) }));
  }
  await context.close();
}
await browser.close();
