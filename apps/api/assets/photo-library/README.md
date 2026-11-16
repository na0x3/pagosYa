# Photo library (spec 2026-11-16 store quality, Part 1)

One folder per kind of business, with its photos and a `manifest.json`:
`{ "sector", "label", "keywords": [], "photos": [{ "file", "subject", "shape": "wide|tall|square", "source", "license": "CC0" }] }`.
Only CC0 photos, picked by hand (no museum art, no visible brands, ≥ 1000 px on the long side). Each sector is approved by the
owner on a contact sheet before it is added here. A V2 build copies photos from the store's sector into the store's uploads when
the store has fewer than 12 photos of its own (v2-photo-library.ts; `topUpLibraryPhotos` in v2-prototype.service.ts).
