# Lumbre · Pilot 1

Standalone browser source. Run npm run build, then npm start (Node 20+). Deploy dist/ to a static host. No install needed.

Edit index.html, styles.css and site.js freely. config.js contains public API configuration and the initial catalog snapshot. The live catalog refreshes before ordering. Configure the deployed origin in PagosYa CORS.

The bundled build script copies files and checks classic JavaScript syntax; it does not execute storefront scripts. Preview code only in an isolated browser. Source checks are not a security review.

Orders, payments, stock and customer data depend on the PagosYa API and are not included. Selected uploaded assets are bundled; other product image URLs may still depend on the API. Export includes the per-file manifest.
