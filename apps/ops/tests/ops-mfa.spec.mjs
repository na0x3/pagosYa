import { expect, test } from "@playwright/test";

const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// ISO A-01: the ops_ token plus an authenticator code start a session; only the session reaches the API and is kept.
test("first sign-in sets codes up, then token + code start a session the API calls carry", async ({ page }) => {
  const calls = [];
  let enabled = false;
  await page.route("http://localhost:3001/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON?.() ?? null;
    calls.push({ method: request.method(), path: url.pathname, body, auth: request.headers()["authorization"] });
    const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname === "/internal/ops_session" && request.method() === "POST") {
      if (!enabled) return json(403, { message: "Configura tu código de verificación antes de entrar", code: "mfa_setup_required" });
      if (body.code !== "654321") return json(401, { message: "Código incorrecto o ya usado" });
      return json(201, { sessionToken: "opss_abc", expiresAt: new Date(Date.now() + 36e6).toISOString(), user: { id: "o1" } });
    }
    if (url.pathname === "/internal/ops_session/mfa/setup") return json(201, { secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x", qrDataUrl: QR });
    if (url.pathname === "/internal/ops_session/mfa/confirm") { enabled = body.code === "123456"; return json(enabled ? 201 : 401, enabled ? { enabled: true } : { message: "Código incorrecto o ya usado" }); }
    if (url.pathname === "/internal/ops_users/me") return json(200, { id: "o1", name: "Ana", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" });
    return json(200, []);
  });
  await page.goto("/");
  await page.fill("#apiOrigin", "http://localhost:3001");
  await page.fill("#opsToken", "ops_secret");
  await page.click("#connect");

  await expect(page.locator("#mfaSetup")).toBeVisible();
  await expect(page.locator("#mfaSecret")).toHaveText("JBSWY3DPEHPK3PXP");
  await page.fill("#mfaConfirmCode", "123456");
  await page.click("#mfaConfirm");
  await expect(page.locator("#mfaSetup")).toBeHidden();

  await page.fill("#opsCode", "654321");
  await page.click("#connect");
  await expect(page.locator("#signOut")).toBeVisible();
  await expect.poll(() => calls.find((c) => c.path === "/internal/ops_users/me")?.auth).toBe("Bearer opss_abc");
  await expect(page.locator("#opsToken")).toHaveValue("");
  expect(await page.evaluate(() => [sessionStorage.getItem("pagosya_ops_session"), sessionStorage.getItem("pagosya_ops_token")])).toEqual(["opss_abc", null]);
  expect(calls.find((c) => c.path === "/internal/ops_session" && c.body?.code === "654321")?.body.token).toBe("ops_secret");
});
