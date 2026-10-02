# Yapi browser campaign — 2026-10-01

Local Chrome testing against the real dashboard, Studio, API and ChatGPT plan bridge. All four campaign stores remain private. No production store was edited and no payment was made.

## Systemic fixes

- CSS verification no longer crashes when checking `:root`. It restores the original inline style after canonicalizing CSS values.
- Browser verification rejects missing same-page section targets, including skip links, even when the model did not include them in its task plan. `finish` remains blocked until a fresh clean verification.
- The shared commerce runtime preserves access to product details when a custom card's only link surrounds a missing photo.
- Product breadcrumbs, unavailable-product recovery and stock commerce navigation use the actual catalog page instead of assuming every homepage has `#catalogo`. Legacy stock shells remain recognizable for brand inheritance.
- AI product highlights use the configured ChatGPT plan bridge when paid API access is disabled; a bridge failure does not silently fall back to paid access.
- Studio allows navigation away from durable background builds while retaining guards for other busy/unsaved operations. Reloading and switching stores were exercised during active work.
- Discovery replies say “Respuesta preparada”; only saved revisions present completed build work.
- Task-tool descriptions specify valid check formats. Plans no longer echo the entire original prompt into the tool transcript.

These are shared code changes, not instructions that customers must learn. One explicit skip-link repair prompt tested recovery of a previously saved draft; that prompt is not evidence of autonomous detection. A separate regression exercises a title-only request: all declared text checks pass, but an unplanned broken link still blocks completion until repaired.

## Browser cases

| Case | Exercised | Result |
| --- | --- | --- |
| Luz Papel | Scratch build, empty catalog, reload/recovery, desktop/tablet/phone, empty cart, keyboard skip link | Saved revision 2; requested heading retained; skip target exists |
| Pan de Barrio | Miga template, business adaptation, removal of unconfirmed promises, images, desktop/phone | Saved revision 2; requested heading and template photography retained |
| Montaña Equipos | Cumbre template, real product without images, green branding, details, catalog return, cart, stock ceiling, checkout | Saved revision 2; Bs 149.50 preserved; quantity capped at 7; checkout receives Bs 1,046.50; simulated payment form opens |
| Café & Libros | Actual store-creation dialog with accent/ampersand, product wizard, AI highlights, Página template, ordinary customer adaptation | Saved revision 2 in 19 recorded calls; exact requested title, visible name and green color; photos retained; mobile width/scroll both 390px and no broken visible images |

Initial failures and partial drafts were retained in local evidence; success was not inferred solely from Yapi's summary. Storefront screenshots and job diagnostics are in the ignored `.yapi-evaluation/` directory.

The final live request was: “Quiero que mi tienda se llame Café & Libros, sin QA. Pon ‘Un café, un libro, un buen día’ como título principal y cambia el color principal a verde oscuro. Me gusta esta plantilla: conserva su estilo y las fotos.” No diagnostic prompt or manual source correction was supplied for this adaptation. This proves the tested request completed unassisted, not that every future defect will be repaired automatically.

Database checks confirmed all four stores have no published source revision. Product amounts and stocks remain 14950/7 and 2500/3 (amounts in minor units).

## Validation

- Final prevention group: 67 passing tests across agent-task, commerce-pages and commerce-design.
- Capture regression group: missing/encoded/named/cross-page fragment cases passed in a real browser sandbox.
- Product highlights and root CSS checks: 10 passing tests.
- Studio progress/session/copy checks: 13 passing tests.
- API and Studio typechecks passed; embedded Studio built successfully; storefront runtime parsing and package typecheck passed.

## Limits

Changes are local, not deployed. These checks prevent or detect the reproduced failure classes; they do not establish that arbitrary requests or every possible store are error-free. The new fragment check covers the currently rendered page, not arbitrary cross-page fragments. An empty catalog cannot prove a populated product theme. The intentionally required discovery turns can still repeat information a customer already supplied. Existing template promotional copy (for example gift wrapping and delivery in Página) survives a narrow title/color edit; this campaign does not establish that all inherited commercial claims are grounded in merchant settings.
