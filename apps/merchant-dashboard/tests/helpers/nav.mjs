import { expect } from "@playwright/test";
import { sectionOf } from "../../src/nav-sections.mjs";

/** Opens a dashboard view the way a merchant does: the section's sidebar link, then its pill. */
export async function openView(page, view, marketingTab) {
  const { section, tab } = sectionOf(view, marketingTab);
  await page.locator(`#dashboardNav [data-nav-section="${section.id}"]`).click();
  if (!tab) return;
  const pill = page.locator(`#sectionTabs [data-section-view="${tab.view}"]${tab.marketingTab ? `[data-section-marketing-tab="${tab.marketingTab}"]` : ""}`);
  if (await pill.count()) { await pill.click(); await expect(pill).toHaveAttribute("aria-current", "page"); }
}

/** Shows the screens hidden by default, as DASHBOARD_FULL_NAV=1 would. Call before page.goto. */
export async function enableFullNav(page) {
  await page.addInitScript(() => {
    const mark = () => document.documentElement?.setAttribute("data-full-nav", "");
    mark();
    new MutationObserver(mark).observe(document, { childList: true });
  });
}
