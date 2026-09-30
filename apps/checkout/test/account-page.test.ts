import { afterEach, describe, expect, it, vi } from "vitest";

const TOKEN = "a".repeat(43);
const PROFILE = { id: "c1", storeId: "s1", email: "ana@example.com", name: "Ana", phone: null, addresses: [], emailVerifiedAt: "2026-09-01T00:00:00Z" };
const FUTURE = () => new Date(Date.now() + 3_600_000).toISOString();

type Route = unknown | { status: number; body: unknown };
async function open(view: string, options: { session?: boolean; search?: string; routes?: Record<string, Route> } = {}) {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = "";
  document.head.querySelectorAll('meta[name="robots"]').forEach(meta => meta.remove());
  localStorage.clear();
  if (options.session) localStorage.setItem("pagosya:customer:cafe", JSON.stringify({ token: TOKEN, expiresAt: FUTURE() }));
  window.history.pushState({}, "", `/cuenta/cafe/${view}${options.search ?? ""}`);
  vi.doMock("../src/api", () => ({ API_BASE_URL: "https://api.example/v1", fetchStore: vi.fn().mockResolvedValue({ storeName: "Café Norte", logoUrl: null }), assetUrl: (path: string | null) => path }));
  const calls: Array<{ method: string; path: string; body: any; auth: string | null }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("https://api.example/v1/stores/public/cafe/customers/", "");
    const method = init.method ?? "GET";
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string> | undefined)?.Authorization ?? null });
    const handler = options.routes?.[`${method} ${path}`] as any;
    const route = typeof handler === "function" ? handler(init.body ? JSON.parse(String(init.body)) : undefined) : handler;
    const status = route && typeof route === "object" && "status" in route ? route.status : route === undefined ? 404 : 200;
    const body = route && typeof route === "object" && "status" in route ? route.body : route ?? { message: "no" };
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  const module = await import("../src/account/account-page");
  await module.renderAccount("cafe", view as never);
  return { module, calls, app: document.getElementById("app")! };
}
const fill = (app: HTMLElement, values: Record<string, string>) => { for (const [name, value] of Object.entries(values)) { const field = app.querySelector<HTMLInputElement>(`[name="${name}"]`); if (!field) throw new Error(`no field ${name}`); field.value = value; } };
const submit = (app: HTMLElement, form: string) => { app.querySelector<HTMLFormElement>(`form[data-form="${form}"]`)!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); };
const stored = () => JSON.parse(localStorage.getItem("pagosya:customer:cafe") || "null");

afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock("../src/api"); });

describe("accountRoute", () => {
  it("reads the store and the view from /cuenta/<slug>[/<view>]", async () => {
    vi.resetModules();
    const { accountRoute } = await import("../src/account/account-page");
    expect(accountRoute("/cuenta/cafe")).toEqual({ slug: "cafe", view: "ingresar" });
    expect(accountRoute("/cuenta/cafe/")).toEqual({ slug: "cafe", view: "ingresar" });
    expect(accountRoute("/cuenta/caf%C3%A9/pedidos")).toEqual({ slug: "café", view: "pedidos" });
    for (const view of ["registro", "recuperar", "restablecer", "verificar", "suscripciones", "direcciones", "perfil"]) expect(accountRoute(`/cuenta/cafe/${view}`)).toEqual({ slug: "cafe", view });
    for (const path of ["/cuenta", "/cuenta/", "/cuenta/cafe/otra", "/cuenta/cafe/pedidos/x", "/otra/cafe", "/s/cafe"]) expect({ path, route: accountRoute(path) }).toEqual({ path, route: null });
  });
});

describe("sign in, sign up and recovery", () => {
  it("signs in, keeps the session only in this browser and opens the orders page", async () => {
    const { app, calls } = await open("ingresar", { routes: { "POST login": { token: TOKEN, expiresAt: FUTURE(), customer: PROFILE }, "GET me/orders": [] } });
    expect(app.textContent).toContain("Café Norte");
    fill(app, { email: "ana@example.com", password: "correct horse battery" });
    submit(app, "login");
    await vi.waitFor(() => expect(app.textContent).toContain("Aún no tienes pedidos"));
    expect(calls.find(call => call.path === "login")!.body).toEqual({ email: "ana@example.com", password: "correct horse battery" });
    expect(stored()).toMatchObject({ token: TOKEN });
    expect(window.location.pathname).toBe("/cuenta/cafe/pedidos");
    expect(calls.find(call => call.path === "me/orders")!.auth).toBe(`Bearer ${TOKEN}`);
  });

  it("shows a sign-in error as text and stores nothing", async () => {
    const { app } = await open("ingresar", { routes: { "POST login": { status: 401, body: { message: "Correo o contraseña incorrectos <b>x</b>" } } } });
    fill(app, { email: "ana@example.com", password: "wrong password" });
    submit(app, "login");
    await vi.waitFor(() => expect(app.querySelector('[role="alert"]')?.textContent).toContain("Correo o contraseña incorrectos"));
    expect(app.querySelector('[role="alert"] b')).toBeNull();
    expect(stored()).toBeNull();
  });

  it("registers and answers with the generic message", async () => {
    const { app, calls } = await open("registro", { routes: { "POST register": { message: "Si el correo es válido, te enviamos un enlace." } } });
    fill(app, { name: "Ana", email: "ana@example.com", password: "correct horse battery" });
    submit(app, "register");
    await vi.waitFor(() => expect(app.textContent).toContain("Si el correo es válido"));
    expect(calls.find(call => call.path === "register")!.body).toEqual({ name: "Ana", email: "ana@example.com", password: "correct horse battery" });
  });

  it("asks for a reset link without saying whether the email has an account", async () => {
    const { app, calls } = await open("recuperar", { routes: { "POST forgot-password": { message: "Si el correo es válido, te enviamos un enlace." } } });
    fill(app, { email: "ghost@example.com" });
    submit(app, "forgot");
    await vi.waitFor(() => expect(app.textContent).toContain("Si el correo es válido"));
    expect(calls.find(call => call.path === "forgot-password")!.body).toEqual({ email: "ghost@example.com" });
  });

  it("resets the password from the link token, removes the token from the address bar, and checks the confirmation first", async () => {
    const { app, calls } = await open("restablecer", { search: "?token=TOK123", routes: { "POST reset-password": { ok: true } } });
    expect(window.location.search).toBe("");
    fill(app, { password: "a brand new password", confirm: "something else" });
    submit(app, "reset");
    await vi.waitFor(() => expect(app.querySelector('[role="alert"]')?.textContent).toContain("no coinciden"));
    expect(calls.filter(call => call.path === "reset-password")).toHaveLength(0);
    fill(app, { password: "a brand new password", confirm: "a brand new password" });
    submit(app, "reset");
    await vi.waitFor(() => expect(app.textContent).toContain("contraseña nueva"));
    expect(calls.find(call => call.path === "reset-password")!.body).toEqual({ token: "TOK123", password: "a brand new password" });
  });

  it("says a reset page without a token has an invalid link and never calls the API", async () => {
    const { app, calls } = await open("restablecer");
    expect(app.textContent).toContain("no es válido");
    expect(calls).toHaveLength(0);
  });

  it("confirms the email from the link token and offers the sign-in page", async () => {
    const { app, calls } = await open("verificar", { search: "?token=VER123", routes: { "POST verify-email": { ok: true } } });
    await vi.waitFor(() => expect(app.textContent).toContain("Correo confirmado"));
    expect(calls.find(call => call.path === "verify-email")!.body).toEqual({ token: "VER123" });
    expect(window.location.search).toBe("");
    expect(app.querySelector('a[href="/cuenta/cafe/ingresar"]')).not.toBeNull();
  });

  it("shows why an email link failed", async () => {
    const { app } = await open("verificar", { search: "?token=OLD", routes: { "POST verify-email": { status: 400, body: { message: "El enlace no es válido o expiró" } } } });
    await vi.waitFor(() => expect(app.querySelector('[role="alert"]')?.textContent).toContain("expiró"));
  });

  it("is never indexed", async () => {
    await open("ingresar");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
  });
});

describe("the account pages", () => {
  it("asks to sign in, without calling the API, when there is no session", async () => {
    for (const view of ["pedidos", "suscripciones", "direcciones", "perfil"]) {
      const { app, calls } = await open(view);
      expect({ view, login: Boolean(app.querySelector('form[data-form="login"]')), calls: calls.length }).toEqual({ view, login: true, calls: 0 });
    }
  });

  it("ignores an expired session", async () => {
    const { app, calls, module } = await open("pedidos");
    localStorage.setItem("pagosya:customer:cafe", JSON.stringify({ token: TOKEN, expiresAt: new Date(Date.now() - 1000).toISOString() }));
    await module.renderAccount("cafe", "pedidos");
    expect(app.querySelector('form[data-form="login"]')).not.toBeNull();
    expect(calls.filter(call => call.path === "me/orders")).toHaveLength(0);
  });

  it("lists the orders escaped, with a readable status and total", async () => {
    const { app } = await open("pedidos", { session: true, routes: { "GET me/orders": [
      { id: "ord_abcdef123456", status: "PAID", amount: 15900, currency: "BOB", createdAt: "2026-09-20T12:00:00Z", items: [{ name: "Café <img src=x onerror=alert(1)>", quantity: 2 }] },
      { id: "ord_zzz", status: "SHIPPED", amount: 1000, currency: "BOB", createdAt: "2026-09-21T12:00:00Z", items: [] },
    ] } });
    await vi.waitFor(() => expect(app.textContent).toContain("Pagado"));
    expect(app.textContent).toContain("Enviado");
    expect(app.textContent).toContain("159.00");
    expect(app.querySelector("img")).toBeNull();
    expect(app.innerHTML).toContain("&lt;img");
  });

  it("lists the subscriptions", async () => {
    const { app } = await open("suscripciones", { session: true, routes: { "GET me/subscriptions": [{ id: "sub1", status: "ACTIVE", itemName: "Café 500 g", quantity: 1, cadence: "MONTHLY", nextBillingAt: "2026-11-01T15:00:00Z" }] } });
    await vi.waitFor(() => expect(app.textContent).toContain("Café 500 g"));
  });

  it("saves the profile with the session token", async () => {
    const { app, calls } = await open("perfil", { session: true, routes: { "GET me": PROFILE, "PATCH me": { ...PROFILE, name: "Ana María" } } });
    await vi.waitFor(() => expect(app.querySelector('form[data-form="profile"]')).not.toBeNull());
    fill(app, { name: "Ana María", phone: "+59170000000" });
    submit(app, "profile");
    await vi.waitFor(() => expect(app.textContent).toContain("Guardado"));
    const patch = calls.find(call => call.method === "PATCH")!;
    expect(patch.body).toEqual({ name: "Ana María", phone: "+59170000000" });
    expect(patch.auth).toBe(`Bearer ${TOKEN}`);
  });

  it("adds and removes addresses by replacing the whole list", async () => {
    const existing = { id: "addr_1", label: "Casa", recipient: "Ana", phone: "+59170000000", department: "La Paz", city: "La Paz", street: "Av. 6", references: "" };
    let saved: any[] = [existing];   // the fake server keeps what it was given, like the real one
    const { app, calls } = await open("direcciones", { session: true, routes: { "GET me": () => ({ ...PROFILE, addresses: saved }), "PUT me/addresses": (body: any) => { saved = body.addresses.map((a: any, i: number) => ({ id: a.id ?? `addr_new${i}`, ...a })); return saved; } } });
    await vi.waitFor(() => expect(app.textContent).toContain("Av. 6"));
    fill(app, { label: "Oficina", recipient: "Ana", phone: "+59170000000", department: "La Paz", city: "El Alto", street: "Calle 2", references: "" });
    submit(app, "address");
    await vi.waitFor(() => expect(calls.some(call => call.method === "PUT")).toBe(true));
    expect(calls.find(call => call.method === "PUT")!.body.addresses).toHaveLength(2);
    expect(calls.find(call => call.method === "PUT")!.body.addresses[1]).toMatchObject({ label: "Oficina", city: "El Alto" });
    await vi.waitFor(() => expect(app.textContent).toContain("Calle 2"));   // the page shows what the server kept before the next change
    app.querySelector<HTMLButtonElement>('[data-remove-address="addr_1"]')!.click();
    await vi.waitFor(() => expect(calls.filter(call => call.method === "PUT")).toHaveLength(2));
    expect(calls.filter(call => call.method === "PUT")[1].body.addresses.map((a: any) => a.label)).toEqual(["Oficina"]);
  });

  it("deletes the account only after asking for the password, then forgets the session", async () => {
    const { app, calls } = await open("perfil", { session: true, routes: { "GET me": PROFILE, "DELETE me": { ok: true } } });
    await vi.waitFor(() => expect(app.querySelector('form[data-form="delete"]')).not.toBeNull());
    fill(app, { password: "" });
    submit(app, "delete");
    expect(calls.filter(call => call.method === "DELETE")).toHaveLength(0);
    fill(app, { password: "correct horse battery" });
    submit(app, "delete");
    await vi.waitFor(() => expect(stored()).toBeNull());
    expect(calls.find(call => call.method === "DELETE")!.body).toEqual({ password: "correct horse battery" });
    expect(app.querySelector('form[data-form="login"]')).not.toBeNull();
  });

  it("signs out: tells the API, forgets the session and shows the sign-in page", async () => {
    const { app, calls } = await open("pedidos", { session: true, routes: { "GET me/orders": [], "POST logout": { ok: true } } });
    await vi.waitFor(() => expect(app.querySelector("[data-logout]")).not.toBeNull());
    app.querySelector<HTMLButtonElement>("[data-logout]")!.click();
    await vi.waitFor(() => expect(stored()).toBeNull());
    expect(calls.find(call => call.path === "logout")!.auth).toBe(`Bearer ${TOKEN}`);
    expect(app.querySelector('form[data-form="login"]')).not.toBeNull();
  });

  it("drops the session and asks to sign in again when the API says it is no longer valid", async () => {
    const { app } = await open("pedidos", { session: true, routes: { "GET me/orders": { status: 401, body: { message: "Inicia sesión para continuar" } } } });
    await vi.waitFor(() => expect(app.querySelector('form[data-form="login"]')).not.toBeNull());
    expect(stored()).toBeNull();
  });
});
