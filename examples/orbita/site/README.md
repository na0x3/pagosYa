# Next.js storefront

Run npm install, then npm run dev. npm run typecheck validates TypeScript; npm run build exports the website to out/. Serve out/ with a static host (for example npx serve out).

Edit components/*.tsx and styles/globals.css. The same React components and Tailwind rules power the PagosYa preview. Export uses Next.js Pages Router with prerendered pages and client-side commerce. Use normal links to index.html, product.html and checkout.html; React owns the page layout and the PagosYa runtime owns the empty commerce mounts.

Products, orders, stock and payments use your PagosYa API. Configure its allowed storefront origin for your deployed domain. No merchant credentials or database are included.
