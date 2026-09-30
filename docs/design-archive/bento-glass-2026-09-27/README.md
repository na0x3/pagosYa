# Merchant dashboard — bento/glass design (archived 2026-09-27)

The merchant dashboard as it looked before the calm-workspace redesign:
navy WebGL mesh behind every page, frosted-glass panels, a near-black rail,
pastel bento finance tiles and poster-style banners.

- **Code:** git tag `design/bento-glass-2026-09-27` (commit `d933078` on `main`).
  `git checkout design/bento-glass-2026-09-27 -- apps/merchant-dashboard` restores it.
- **Design doc at the time:** `DESIGN.md` in this folder.
- **Screenshots:** 1440×900, demo aggregator merchant, store TheStep:
  `overview.png` (plus `overview-full.png`), `growth.png`, `stores.png`, `products.png`,
  `payments.png`, `cobros.png`, `charge-links.png`, `payouts.png`, `compliance.png`,
  `store-settings.png`, `integrations.png`, `connect-ai.png`, `login-profile-picker.png`.

The glass layer lived at the end of `apps/merchant-dashboard/src/workspace-design.css`
("The login's navy mesh … sits behind every signed-in page") and `startDashboardShader()`
in `src/dashboard.js`.
