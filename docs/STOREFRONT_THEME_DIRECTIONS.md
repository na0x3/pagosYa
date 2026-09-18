# Storefront design without presets

The Temas feature is retired. Studio starts from the merchant's own description, photos and references, or the existing product-photo creation flow. It no longer offers a gallery, prepares themed prompts, restores a theme selection, or sends theme metadata.

Conversation and generation ignore legacy themeId fields. Older clients may still submit a bounded string for compatibility, but it is never remembered, forwarded or applied. Historical revisions and their authored appearance remain intact.

The generator explores project-specific concepts and carries the chosen identity through product, cart and checkout. Visual-system version 2 records the concept, asset roles and functional constraints; it does not prescribe colors, fonts, spacing, radii or a default composition. Version 1 preset manifests are not reused as generation instructions. Shared CSS tokens may be authored for each project, but the server no longer injects preset values. Local edits preserve unrelated source and honor current explicit design changes.

Bundled font and icon assets remain available independently of the retired recipes. Removing the theme feature does not automatically redesign saved sites or publish a revision.

Regression checks cover ignored legacy settings, fresh generation without preset tokens, local edits to old themed snapshots, freeform prompts after reload, mobile layout, and product-photo creation. AI responses in these checks are mocked; no paid generation is needed.
