# Google sign-in setup

pagosYa accepts a Google Identity Services ID token in both dashboards and exchanges it for the existing internal `dash_…` or `consumer_…` session. The API verifies the token audience, issuer, expiry, verified email, and stable Google `sub`; the browser never decides whether the identity is valid.

## Configure Google Cloud

1. Create an OAuth 2.0 Client ID with application type **Web application**.
2. Add every merchant and consumer dashboard origin under **Authorized JavaScript origins**, for example:
   - `http://localhost:4323`
   - `http://localhost:4324`
   - the two production HTTPS origins
3. Set the resulting client ID in the API environment:

   ```env
   GOOGLE_CLIENT_ID="000000000000-example.apps.googleusercontent.com"
   ```

4. Restart the API. `GET /v1/auth/google` should then return `{ "enabled": true, ... }` and both dashboards will display Google’s official button.

Do not put a Google client secret in either dashboard. Merchant Google accounts must already have a provisioned pagosYa merchant user; Google sign-in does not create a new merchant or bypass onboarding/KYC. A new consumer may register with Google after providing their carnet/CI once.

