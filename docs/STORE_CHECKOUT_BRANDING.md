# Store checkout identity

The hosted payment form uses the store name, logo, palette and typography. The payment confirmation continues to use the existing pagosYa printer, receipt animation, keyboard controls and reduced-motion behavior.

CheckoutSessionController obtains branding from the intent merchant through PaymentIntentsService.checkoutBranding. StoreSourceVersion is read at publishedSourceRevision only; drafts and client-supplied store IDs do not choose the identity. Stores without a published source use their store settings. Merchants without a store retain the existing payment appearance.

The shared sourceCheckoutBranding helper extracts simple CSS design tokens, body/heading families and up to two bundled fonts from the source snapshot. It only transports a validated display contract, never authored HTML, CSS rules or scripts. Font data is bounded, restricted to font MIME types, and loaded under checkout-specific aliases. Colors are checked for readable contrast. The CSS variables are scoped to #app, leaving the body-level printer unchanged. More complex authored CSS falls back to the store identity rather than being executed in the payment form.

Studio calculates the total from its catalog and sends the current revision's identity to the hosted preview after CHECKOUT_READY. The receiver checks the parent window, exact origin and message type. Branding cannot alter amounts, payment routing or API credentials. Preview submission uses the same printer renderer with an explicit “Vista previa · Sin cobros” receipt; it never calls payment APIs or emits PAYMENT_SUCCEEDED.

Validation on 2026-09-10:

- 23 checkout tests: form validation, cancellation, payment outcomes, original printer, preview simulation without API requests.
- 4 API/helper tests: published revision, merchant isolation, no draft fallback, source colors and fonts, contrast and unsafe values.
- 4 isolated Playwright scenarios: Toledo cream/green/Fraunces and Noche dark/pink/Instrument at 1440px and 390px. Loaded local fonts, preserved theme on payment method switch, no horizontal overflow, mocked payment confirmation, unchanged printer colors and close behavior. No real charges.
- API, checkout and embedded Studio builds passed; Studio TypeScript check and git diff whitespace check passed.
- Inspected the user's Toledo revision 6 in the browser: cream #f3eddf, ink #173326, accent #08783f, bundled Instrument/Fraunces. Updated preview left open.

Visual review: merchant identity is the primary heading in the summary; the total and payment action remain prominent. Mobile stacks the summary above the form, with 48px input targets and a 56px submit button. Payment method icons inherit the active foreground. The printer retains its original monospace pagosYa identity. No new animation was added to the payment form.
