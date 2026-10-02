# Inline account forms — follow-up to the screenshot and recording at 23:47–23:48

The owner's recording clarifies the expected editor behavior: selecting Login or Register displays the form directly,
inside the store header and footer. An intermediate gate button is insufficient. This supersedes the gate-only UI scope
in the earlier account-page-files spec; its credential isolation rule remains.

## Implementation

- Existing page files and `AccountGatePage` remain compatible. In Studio, full-window preview and checkout-hosted stores,
  the platform reserves a slot within the account page and places a checkout-origin account iframe over it.
- That iframe is a **sibling of the opaque storefront frame**, owned by the trusted parent. No password, customer record,
  session or form submission passes into authored code. The store frame sends geometry and receives height/scroll only.
- Account messages must match the expected iframe window and origin. Destinations come from a fixed view-to-page mapping.
  The parent chooses the checkout origin and store slug; authored messages cannot supply URLs.
- Branding uses the existing normalized checkout tokens and bundled fonts, never merchant HTML, scripts or arbitrary CSS.
- Registration, login and recovery links update the editor's selected page. Source navigation removes old overlays.
- Preview ignores existing customer sessions and blocks all submissions; it does not register accounts or send mail.
  Reset-password preview can show the form without a token; actual password resets still require the email token.
- Checkout-hosted stores use the actual customer account API. Static exports without the trusted host retain the gate link.
- Nothing is published as part of this fix.

## Verification

Regression checks cover trusted iframe placement, forged origins/views, navigation and cleanup, preview submission isolation,
and ignored real sessions. Browser checks cover Bhakara registration, login, recovery, page selection and mobile layout.
