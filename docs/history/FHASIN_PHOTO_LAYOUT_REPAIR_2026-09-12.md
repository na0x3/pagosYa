# FHASIN photo and layout repair

FHASIN (`uvlnpyka`) was saved as revision 2 on September 12, 2026. Revision 1 remains available. The store remains unpublished. No products or paid AI generations were created during this repair.

## Cause and correction

- The merchant explicitly requested “use these pictures,” but the conversation classifier labeled all eight uploads reference-only. The files survived in the snapshot, yet no page displayed them. Revision 2 uses two supplied photos in the opening and six in an editorial gallery. Image roles and the saved conversation context now reflect the merchant’s instruction.
- Fraunces headlines used line heights of .81–.87. The opening artwork also used absolute positioning and fixed heights, leaving no room for growing copy. The repaired opening uses a responsive grid with images in document flow, explicit headline lines, and sufficient line spacing. Mobile order access remains visible.
- The gallery explicitly retains original photo colors; the preexisting collection-section icon inversion must not affect photographs.

## Prevention

`source-image-intent.ts` preserves explicit English/Spanish requests to show supplied photos, while retaining reference-only requests and existing product/logo assignments. Conversation instructions reinforce that distinction. Generation preflight checks for requested local image references, including genuine catalog usage, and requests a bounded repair when they are absent. This static check establishes source usage, not proof that every image is visible; browser inspection remains necessary.

Rendered checks now wait for fonts and warn when text boxes from different heading lines collide. The previous blanket count of opening buttons was removed because it misclassified animation pause controls as competing purchase actions.

## Verification

- 135 tests passed across image intent, chat, conversation, generation, and preflight. After extending catalog-image handling, all 66 tests in the affected generation/intent/preflight suites passed again.
- API and merchant Studio production builds passed.
- Actual repaired FHASIN snapshot passed the browser checker at all four configured widths, with no failures or layout warnings. The only blocking item is its empty product catalog.
- Selected Chrome inspection confirmed all eight photos loaded without color filters and mobile document width matched its 390px viewport.
- The broader `source-checks.spec.ts` suite passed 15 of 18 tests, including the new heading-overlap regression. Three other cases failed: contact-form styling, exported contact submission, and a minimal empty-catalog fixture reporting unhandled rejections. Those cases were not repaired as part of this store fix; the real FHASIN empty-catalog snapshot passed.
- The static design detector reported incumbent font/palette/type-scale preferences against the platform DESIGN.md. FHASIN’s existing visual identity was preserved rather than applying platform branding to a merchant store.

Local recovery artifacts are in `tmp/fhasin-repair/`: original snapshot, prepared and saved snapshots, source edits, and the revision/digest receipt. The local preview at `http://127.0.0.1:4317` uses preview mode only; the saved snapshot retains its normal commerce configuration.

The browser extension could inspect the standalone repaired preview, but could not refresh the original dashboard tab after its nested preview navigated to `about:srcdoc#catalog-pending`. Reload the merchant dashboard manually to see revision 2.
