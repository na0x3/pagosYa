# Account deactivation and evidence retention

“Delete account” removes access immediately, but it does not cascade-delete transaction evidence. This distinction is deliberate so pagosYa can investigate claims such as a NIT-registered seller taking payment without delivering a product.

## Merchant account

- Anonymizes the deleted dashboard user’s email, removes the Google subject, invalidates the password, and revokes that user’s sessions.
- When it is the merchant’s last active user, suspends the merchant, archives active storefronts, and revokes all sessions, API keys, and active webhooks.
- Preserves the merchant record and restricted NIT/KYC, invoicing, payment, ledger, payout, order, fulfillment, support, webhook, and audit records.
- Appends an `ACCOUNT_DEACTIVATED` audit entry tied to the stable merchant/user IDs. Former email and Google identifiers are represented by one-way hashes in the audit metadata.

## Consumer account

- Replaces profile name, email, and carnet with anonymized values, removes the Google subject, invalidates the password, revokes all sessions, and revokes active institution affiliations.
- Preserves linked payments, invoices, orders, and fulfillment changes as restricted evidence.
- Appends an `ACCOUNT_DEACTIVATED` audit entry with one-way hashes of the former email, carnet, and Google subject.

Retained evidence must remain access-controlled and available only for dispute handling, fraud prevention, accounting/tax obligations, and other documented legal purposes. Before production launch, counsel or the designated compliance owner should set jurisdiction-specific retention periods and legal-hold rules; deletion from the evidence store should happen only through that reviewed policy, never through the user-facing account endpoint.
