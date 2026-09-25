import { beforeEach, describe, expect, it, vi } from "vitest";

type Json = Record<string, unknown>;

const store = { name: "Estudio Illimani", logoUrl: null, contactEmail: "hola@illimani.bo", contactPhone: "+591 70000001" };

function openCobro(overrides: Json = {}, document: Json = {}): Json {
  return {
    kind: "INVOICE",
    numberLabel: "COB-0007",
    status: "VIEWED",
    version: 1,
    sha256: "a".repeat(64),
    sentAt: "2026-09-25T14:00:00.000Z",
    updatedAfterFirstSend: false,
    store,
    dueAt: "2026-10-03T03:59:59.000Z",
    paidAt: null,
    payable: true,
    preview: false,
    document: {
      kind: "INVOICE",
      numberLabel: "COB-0007",
      title: "Diseño de logo",
      currency: "BOB",
      customer: { name: "Ana Quispe", email: "ana@example.com", phone: null, document: "4567890" },
      items: [
        { description: "Boceto", quantity: 2, unitAmount: 150000, amount: 300000 },
        { description: "Revisión", quantity: 1, unitAmount: 25050, amount: 25050 },
      ],
      subtotalAmount: 325050,
      discountAmount: 5050,
      totalAmount: 320000,
      dueAt: "2026-10-03T03:59:59.000Z",
      validUntil: null,
      blocks: [{ type: "paragraph", text: "Gracias por tu confianza." }],
      ...document,
    },
    ...overrides,
  };
}

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function loadCobroPage(view: Json | { status: number; body: unknown }, path = "/d/tok_1") {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = "";
  window.history.pushState({}, "", path);
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return respond(200, { checkoutUrl: "https://pay.example/#client_secret=pi_1_secret_abc", clientSecret: "pi_1_secret_abc", paymentIntentId: "pi_1" });
    if ("body" in view && typeof view.status === "number" && !("kind" in view)) return respond(view.status as number, view.body);
    return respond(200, view);
  });
  vi.stubGlobal("fetch", fetchMock);
  await import("../src/main");
  await vi.waitFor(() => {
    if (!document.querySelector("[data-cobro-page]")) throw new Error("not rendered yet");
  });
  return fetchMock;
}

describe("the customer's cobro page (/d/:token)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { __xss?: number }).__xss;
  });

  it("shows the store, the number, the items, the total and the due date", async () => {
    const fetchMock = await loadCobroPage(openCobro());
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/documents\/public\/tok_1$/);
    const page = document.querySelector("[data-cobro-page]")!;
    expect(page.textContent).toContain("Estudio Illimani");
    expect(page.textContent).toContain("COB-0007");
    expect(page.textContent).toContain("Boceto");
    expect(page.textContent).toContain("Bs 3.200,00");
    expect(page.textContent).toContain("Vence el 2 de octubre de 2026");
    expect(page.textContent).toContain("Ana Quispe");
    expect(page.textContent).toContain("Gracias por tu confianza.");
    expect(document.querySelector<HTMLAnchorElement>("[data-cobro-pdf]")!.href).toMatch(/\/documents\/public\/tok_1\/pdf$/);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });

  it("escapes everything the merchant typed", async () => {
    await loadCobroPage(openCobro({ store: { ...store, name: '<img src=x onerror="globalThis.__xss=1">' } }, {
      title: "<script>globalThis.__xss=2</script>",
      items: [{ description: '<img src=x onerror="globalThis.__xss=3">', quantity: 1, unitAmount: 100, amount: 100 }],
    }));
    expect((globalThis as typeof globalThis & { __xss?: number }).__xss).toBeUndefined();
    expect(document.querySelector("[data-cobro-page] img")).toBeNull();
    expect(document.querySelector("[data-cobro-page]")!.textContent).toContain('<img src=x onerror="globalThis.__xss=3">');
  });

  it("Pagar asks for the checkout and goes there", async () => {
    const fetchMock = await loadCobroPage(openCobro());
    const assign = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, assign, pathname: "/d/tok_1", search: "" } });
    try {
      const pay = document.querySelector<HTMLButtonElement>("[data-cobro-pay]")!;
      expect(pay.textContent).toContain("Pagar Bs 3.200,00");
      pay.click();
      await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.example/#client_secret=pi_1_secret_abc"));
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    }
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toMatch(/\/documents\/public\/tok_1\/pay$/);
  });

  it("shows a paid cobro as paid, with no Pagar", async () => {
    await loadCobroPage(openCobro({ status: "PAID", paidAt: "2026-09-28T15:00:00.000Z", payable: false }));
    const page = document.querySelector("[data-cobro-page]")!;
    expect(page.textContent).toContain("Pagado");
    expect(page.textContent).toContain("28 de septiembre de 2026");
    expect(document.querySelector("[data-cobro-pay]")).toBeNull();
  });

  it("says an overdue cobro is overdue and still lets the customer pay it", async () => {
    await loadCobroPage(openCobro({ status: "OVERDUE" }));
    expect(document.querySelector("[data-cobro-page]")!.textContent).toContain("Venció el 2 de octubre de 2026");
    expect(document.querySelector("[data-cobro-pay]")).not.toBeNull();
  });

  it("shows a voided cobro as voided, without items or a Pagar button", async () => {
    await loadCobroPage({ kind: "INVOICE", numberLabel: "COB-0007", title: "Diseño de logo", status: "VOIDED", voidedAt: "2026-09-27T12:00:00.000Z", store: { name: "Estudio Illimani", logoUrl: null } });
    const page = document.querySelector("[data-cobro-page]")!;
    expect(page.textContent).toContain("Anulado");
    expect(page.textContent).toContain("27 de septiembre de 2026");
    expect(page.textContent).not.toContain("Boceto");
    expect(document.querySelector("[data-cobro-pay]")).toBeNull();
  });

  it("forwards the merchant's preview token and never lets a preview pay", async () => {
    const fetchMock = await loadCobroPage(openCobro({ preview: true }), "/d/tok_1?preview=prev_1");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/documents\/public\/tok_1\?preview=prev_1$/);
    expect(document.querySelector("[data-cobro-page]")!.textContent).toContain("Vista previa");
    expect(document.querySelector<HTMLButtonElement>("[data-cobro-pay]")!.disabled).toBe(true);
  });

  it("explains a link that does not open", async () => {
    await loadCobroPage({ status: 404, body: { message: "No encontramos este documento" } });
    expect(document.querySelector("[data-cobro-page]")!.textContent).toContain("No encontramos este documento");
  });
});
