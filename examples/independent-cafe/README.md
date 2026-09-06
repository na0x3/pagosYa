# Café Aroma — independent storefront

A complete standalone café demo. No dependencies or PagosYa workspace imports.

```sh
npm run build
npm start
```

Open http://127.0.0.1:4315. Set PORT to use a different local port. Deploy dist/ to
any static host. The included server is for local review.

`index.html`, `styles.css` and `site.js` belong to this business. `commerce.js`
connects its menu and cart to the public PagosYa API. Change `config.js` to set a
real store slug, public API URL and checkout origin, and set `demo: false`.
Allow that deployed storefront origin in the API's CORS configuration.
Never place merchant credentials in this public project.

The demo catalog comes from examples/cafe-aroma/schema.sql. Its prices and inventory
are demonstration data. The breakfast photograph is an AI illustration. Demo
checkout never creates an order or payment. In live mode the catalog must refresh
successfully before ordering; the backend determines final price and availability.
Products with variants or extras open the existing hosted product-detail flow.

Your source and bundled assets are portable. The commerce API, orders, inventory,
payment processing and customer data remain on PagosYa. Browser preview in Merchant
Studio disables network access and payment creation.
