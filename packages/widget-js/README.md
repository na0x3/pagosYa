# pagosYa browser widget

```bash
npm install @pagosya/widget-js
```

Initialize the widget with a publishable key (`pk_test_...` or `pk_live_...`) and a PaymentIntent `clientSecret` returned by your backend. Never put an `sk_...` key in browser code.

```ts
import PagosYa from "@pagosya/widget-js";

const pagosYa = PagosYa("pk_test_REPLACE_ME");
pagosYa.mount("#checkout", { clientSecret: "pi_REPLACE_ME_secret_REPLACE_ME" });
```
